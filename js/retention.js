// retention.js — مرحلة التثبيت (Retention) بعد فك الحالة: نوع الريتينر فوق وتحت، تاريخ التسليم،
// وجدول متابعات تلقائي بعد 1 و3 و6 و12 شهر من التسليم. الكارت بيظهر في "نظرة عامة" للحالات اللي
// فكت بس، ولما ميعاد متابعة يقرّب (7 أيام) أو يتأخر بيظهر تنبيه في الجرس (clinic-features.js
// بيحسبه وقت الفتح، render-core.js بيعرضه). بيانات التثبيت بتتخزن جوه ملف المريض نفسه:
//   file.retention = { upperType, lowerType, deliveredDate, notes, checks:[{id, monthsAfter, dueDate, doneDate}] }

const RETENTION_TYPES = [
  { value: 'none',   label: 'مفيش' },
  { value: 'hawley', label: 'Hawley (متحرك)' },
  { value: 'essix',  label: 'Essix (شفاف)' },
  { value: 'fixed',  label: 'Fixed (ثابت من ورا)' },
  { value: 'other',  label: 'تاني' }
];
const RETENTION_CHECK_MONTHS = [1, 3, 6, 12];
const RETENTION_ALERT_DAYS_AHEAD = 7;

function retentionTypeLabel(v){
  const t = RETENTION_TYPES.find(x => x.value === v);
  return t ? t.label : '—';
}

// تاريخ + n شهر (لو اليوم مش موجود في الشهر الجديد بياخد آخر يوم فيه)
function retentionDateAddMonths(dateStr, n){
  const parts = String(dateStr).split('-').map(Number);
  const y = parts[0], m = parts[1], d = parts[2];
  const first = new Date(y, m - 1 + n, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return `${first.getFullYear()}-${pad2(first.getMonth() + 1)}-${pad2(Math.min(d, lastDay))}`;
}

// بيبني جدول المتابعات من تاريخ التسليم — أي متابعة اتسجلت "تمت" قبل كده بتفضل زي ما هي
function buildRetentionChecks(deliveredDate, oldChecks){
  return RETENTION_CHECK_MONTHS.map(m => {
    const old = (oldChecks || []).find(c => c.monthsAfter === m);
    if(old && old.doneDate) return old;
    return { id: (old && old.id) || uid(), monthsAfter: m, dueDate: retentionDateAddMonths(deliveredDate, m), doneDate: null };
  });
}

// أقرب متابعة لسه ماتعملتش لو ميعادها خلال 7 أيام أو فات — وإلا null (للتنبيهات)
function retentionAlertForFile(file){
  if(!file || (file.caseStatus || 'active') !== 'debonded' || !file.retention) return null;
  const pending = (file.retention.checks || []).filter(c => !c.doneDate && c.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if(!pending.length) return null;
  const c = pending[0];
  const dl = daysUntil(c.dueDate);
  if(dl === null || dl > RETENTION_ALERT_DAYS_AHEAD) return null;
  return { checkId: c.id, monthsAfter: c.monthsAfter, dueDate: c.dueDate, daysUntil: dl };
}

function retentionCheckWhenLabel(dl){
  if(dl < 0) return `متأخرة ${-dl} يوم`;
  if(dl === 0) return 'النهاردة';
  return `بعد ${dl} يوم`;
}

function renderRetentionCardHtml(file){
  const r = file.retention;
  if(!r){
    return `
      <div class="overview-card">
        <div class="overview-card-title">🛡️ التثبيت (Retention)</div>
        <div class="placeholder" style="padding:6px 0;">لسه ماتسجلش ريتينر للحالة دي</div>
        <button type="button" class="secondary small" id="editRetentionBtn" style="margin-top:8px;">+ تسجيل الريتينر</button>
      </div>
    `;
  }
  const patient = (state.patients || []).find(p => p.id === state.currentPatientId);
  const clinic = (state.clinics || []).find(c => c.id === state.currentClinicId);
  const checks = [...(r.checks || [])].sort((a, b) => a.monthsAfter - b.monthsAfter);
  const nextPending = checks.filter(c => !c.doneDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const rows = checks.map(c => {
    if(c.doneDate){
      return `<div class="overview-row"><span class="ov-lbl">${c.monthsAfter} شهر — ${escapeHtml(formatDateAr(c.dueDate))}</span><span class="ov-val" style="color:var(--green);">✅ اتعملت ${escapeHtml(formatDateAr(c.doneDate))}</span></div>`;
    }
    const dl = daysUntil(c.dueDate);
    const late = dl !== null && dl < 0;
    const soon = dl !== null && dl <= RETENTION_ALERT_DAYS_AHEAD;
    return `
      <div class="overview-row" style="align-items:center;gap:6px;flex-wrap:wrap;">
        <span class="ov-lbl">${c.monthsAfter} شهر — ${escapeHtml(formatDateAr(c.dueDate))}</span>
        <span class="ov-val ${soon ? 'ov-alert' : ''}" style="${late ? 'color:var(--red);' : ''}">${dl === null ? '' : escapeHtml(retentionCheckWhenLabel(dl))}
          <button type="button" class="secondary small" data-retention-done="${escapeHtml(c.id)}" style="margin-inline-start:6px;">✓ تمت</button>
        </span>
      </div>`;
  }).join('');
  let waHtml = '';
  if(nextPending && patient && patient.phone){
    const msg = `أهلاً ${patient.name} 👋\nبنفكّرك بمتابعة الريتينر (${nextPending.monthsAfter} شهر بعد الفك) — ميعادها حوالي ${formatDateAr(nextPending.dueDate)}.\nيا ريت تحجز ميعاد معانا${clinic && clinic.phone ? ' على: ' + clinic.phone : ''} 🙏`;
    waHtml = `<a class="wa-btn small" data-wa-link href="${escapeHtml(buildWhatsappLinkWithText(patient.phone, msg))}" target="_blank" rel="noopener" style="margin-top:8px;display:inline-block;">💬 ذكّر المريض بالمتابعة الجاية</a>`;
  }
  return `
    <div class="overview-card">
      <div class="overview-card-title">🛡️ التثبيت (Retention)</div>
      <div class="overview-row"><span class="ov-lbl">فوق</span><span class="ov-val">${escapeHtml(retentionTypeLabel(r.upperType))}</span></div>
      <div class="overview-row"><span class="ov-lbl">تحت</span><span class="ov-val">${escapeHtml(retentionTypeLabel(r.lowerType))}</span></div>
      <div class="overview-row"><span class="ov-lbl">تاريخ التسليم</span><span class="ov-val">${escapeHtml(formatDateAr(r.deliveredDate))}</span></div>
      ${r.notes ? `<div class="overview-row"><span class="ov-lbl">ملاحظات</span><span class="ov-val">${escapeHtml(r.notes)}</span></div>` : ''}
      <div style="margin-top:8px;">${rows}</div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px;">
        <button type="button" class="secondary small" id="editRetentionBtn">✏️ تعديل</button>
        ${waHtml}
      </div>
    </div>
  `;
}

// بيحدّث تنبيه التثبيت للمريض المفتوح دلوقتي في الـ state العام من غير ما نعيد مسح كل العيادات
function refreshRetentionAlertForCurrentPatient(){
  const file = state.currentPatientFile;
  const patient = (state.patients || []).find(p => p.id === state.currentPatientId);
  const clinic = (state.clinics || []).find(c => c.id === state.currentClinicId);
  state.globalRetentionAlerts = (state.globalRetentionAlerts || []).filter(a => a.patientId !== state.currentPatientId);
  const a = retentionAlertForFile(file);
  if(a && patient) state.globalRetentionAlerts.push({ patientId: patient.id, name: patient.name, clinicId: state.currentClinicId, clinicName: clinic ? clinic.name : '', ...a });
  if(typeof ensureNotificationBell === 'function') ensureNotificationBell();
}

async function saveRetentionAndRender(logAction, logText){
  const file = state.currentPatientFile;
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  await logActivity(logAction, `${logText} — مريض ${patientNameForLog()}`);
  refreshRetentionAlertForCurrentPatient();
  render();
}

function openRetentionModal(){
  const file = state.currentPatientFile;
  if(!file) return;
  const r = file.retention || {};
  const typeOptions = (sel) => RETENTION_TYPES.map(t => `<option value="${t.value}" ${t.value === sel ? 'selected' : ''}>${escapeHtml(t.label)}</option>`).join('');
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal" style="max-width:440px;width:95%;">
      <h3>🛡️ الريتينر (Retention)</h3>
      <div class="field"><label>فوق</label><select id="retUpper" style="width:100%;">${typeOptions(r.upperType || 'hawley')}</select></div>
      <div class="field" style="margin-top:10px;"><label>تحت</label><select id="retLower" style="width:100%;">${typeOptions(r.lowerType || 'fixed')}</select></div>
      <div class="field" style="margin-top:10px;"><label>تاريخ تسليم الريتينر</label><input type="date" id="retDate" value="${escapeHtml(r.deliveredDate || file.debondDate || todayStr())}" style="width:100%;"></div>
      <div class="field" style="margin-top:10px;"><label>ملاحظات (اختياري)</label><input type="text" id="retNotes" value="${escapeHtml(r.notes || '')}" style="width:100%;"></div>
      <div class="placeholder" style="font-size:12px;padding:8px 0;">هيتعمل جدول متابعات تلقائي بعد 1 و3 و6 و12 شهر من تاريخ التسليم، وهيظهر تنبيه في الجرس قبل كل ميعاد بـ 7 أيام.</div>
      <div class="modal-actions">
        <button class="secondary" id="retCancelBtn">إلغاء</button>
        <button id="retSaveBtn">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  document.getElementById('retCancelBtn').onclick = close;
  bg.onclick = (e) => { if(e.target === bg) close(); };
  document.getElementById('retSaveBtn').onclick = async () => {
    const deliveredDate = document.getElementById('retDate').value;
    if(!deliveredDate){ toast('اختار تاريخ التسليم'); return; }
    const isNew = !file.retention;
    file.retention = {
      upperType: document.getElementById('retUpper').value,
      lowerType: document.getElementById('retLower').value,
      deliveredDate,
      notes: document.getElementById('retNotes').value.trim(),
      checks: buildRetentionChecks(deliveredDate, r.checks)
    };
    close();
    await saveRetentionAndRender(isNew ? 'retention_set' : 'retention_edit',
      `${isNew ? 'سجّل' : 'عدّل'} الريتينر (فوق: ${retentionTypeLabel(file.retention.upperType)} — تحت: ${retentionTypeLabel(file.retention.lowerType)}) بتاريخ تسليم ${formatDateAr(deliveredDate)}`);
    toast('اتحفظ الريتينر وجدول المتابعات');
  };
}

async function markRetentionCheckDone(checkId){
  const file = state.currentPatientFile;
  const check = file && file.retention && (file.retention.checks || []).find(c => c.id === checkId);
  if(!check) return;
  const date = await promptModal(`تاريخ متابعة التثبيت (${check.monthsAfter} شهر)`, todayStr(), { type: 'date', label: 'التاريخ' });
  if(!date) return;
  check.doneDate = date;
  await saveRetentionAndRender('retention_check_done', `سجّل متابعة تثبيت ${check.monthsAfter} شهر بتاريخ ${formatDateAr(date)}`);
  toast('اتسجلت متابعة التثبيت');
}

function attachRetentionHandlers(){
  const editBtn = document.getElementById('editRetentionBtn');
  if(editBtn) editBtn.onclick = () => openRetentionModal();
  document.querySelectorAll('[data-retention-done]').forEach(el => {
    el.onclick = () => markRetentionCheckDone(el.dataset.retentionDone);
  });
}
