// clinic-attendance.js — تسجيل حضورك (الدكتور) في ميعاد العيادة. بتتخزن على العيادة نفسها:
//   clinic.visitAttendance = { 'YYYY-MM-DD': { status: 'attended' | 'absent', markedAt } }
// - يوم الميعاد: زرار "✅ حضرت" على كارت العيادة.
// - لو يوم ميعاد عدّى ومتسجلش: لما تفتح العيادة بيسألك "حضرت يوم X؟" (حضرت / ماحضرتش)، وبيظهر
//   تنبيه في الجرس لحد ما تسجله. الإلغاء (من غير اختيار) = اسألني بعدين.
// - بنبص رجوع آخر ATTENDANCE_LOOKBACK_DAYS يوم بس (ومش قبل تاريخ إنشاء العيادة) عشان أول تشغيل
//   مايسألكش عن شهور فاتت.
// الملف بيتحمّل بعد clinic-features.js (بيستخدم occurrenceInMonth) وقبل main.js.

const ATTENDANCE_LOOKBACK_DAYS = 10;

function attendanceAddDays(dateStr, delta){
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// كل تواريخ ميعاد العيادة (من كل جداولها) بين fromDate وtoDate شامل — مرتبة من الأقدم للأحدث
function clinicScheduledDatesBetween(clinic, fromDate, toDate){
  const out = new Set();
  const start = new Date(fromDate + 'T00:00:00');
  const end = new Date(toDate + 'T00:00:00');
  // شهر قبل fromDate لحد شهر toDate — كفاية لأي مدى قصير
  for(let y = start.getFullYear(), m = start.getMonth(); y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth()); m++){
    if(m > 11){ m = 0; y++; }
    (clinic.visitSchedules || []).forEach(s => {
      const occ = occurrenceInMonth(y, m, s.weekday, s.ordinal);
      if(occ && occ >= fromDate && occ <= toDate) out.add(occ);
    });
  }
  return [...out].sort();
}

function clinicAttendanceMark(clinic, date){
  return clinic && clinic.visitAttendance ? clinic.visitAttendance[date] || null : null;
}

// مواعيد فاتت (قبل النهاردة) ولسه ماتسجلش فيها حضورك
function clinicPendingAttendanceDates(clinic){
  if(!clinic || !(clinic.visitSchedules || []).length) return [];
  const today = todayStr();
  let from = attendanceAddDays(today, -ATTENDANCE_LOOKBACK_DAYS);
  if(clinic.createdAt && clinic.createdAt > from) from = clinic.createdAt;
  const to = attendanceAddDays(today, -1);
  if(from > to) return [];
  return clinicScheduledDatesBetween(clinic, from, to).filter(d => !clinicAttendanceMark(clinic, d));
}

// النهاردة يوم عيادة ولسه ماسجلتش حضورك؟ بيرجّع التاريخ أو null
function clinicTodayAttendancePending(clinic){
  const today = todayStr();
  if(!clinicScheduledDatesBetween(clinic, today, today).length) return null;
  return clinicAttendanceMark(clinic, today) ? null : today;
}

async function markClinicAttendance(clinicId, date, status){
  const c = (state.clinics || []).find(x => x.id === clinicId);
  if(!c) return false;
  if(!c.visitAttendance) c.visitAttendance = {};
  const prev = c.visitAttendance[date];
  c.visitAttendance[date] = { status, markedAt: new Date().toISOString() };
  const ok = await setData('clinics', state.clinics); // نفس نمط باقي بيانات العيادة (محمي من التعارض)
  if(!ok){
    if(prev) c.visitAttendance[date] = prev; else delete c.visitAttendance[date];
    return false;
  }
  await logActivity('clinic_attendance', `${status === 'attended' ? 'سجّل حضوره' : 'سجّل إنه ماحضرش'} في ${c.name} — ميعاد ${formatDateAr(date)}`);
  if(typeof ensureNotificationBell === 'function') ensureNotificationBell();
  return true;
}

// بيسأل عن كل ميعاد فات ومتسجلش (من الأقدم) — الإلغاء بيوقف الأسئلة (هيسألك بعدين)
let _attendancePromptBusy = false;
async function promptPendingAttendance(clinicId){
  if(_attendancePromptBusy) return;
  const clinic = (state.clinics || []).find(c => c.id === clinicId);
  if(!clinic) return;
  const pending = clinicPendingAttendanceDates(clinic);
  if(!pending.length) return;
  _attendancePromptBusy = true;
  try{
    for(const date of pending){
      const pick = await askChoice('حضورك في العيادة', `كان فيه ميعاد في ${clinic.name} يوم ${visitWeekdayLabelAr(date)} ${formatDateAr(date)} — حضرت؟`, [
        { value: 'attended', label: '✅ حضرت' },
        { value: 'absent', label: '❌ ماحضرتش' }
      ]);
      if(!pick) break;
      await markClinicAttendance(clinicId, date, pick);
    }
  } finally {
    _attendancePromptBusy = false;
  }
  if(state.view === 'clinics') render();
}
