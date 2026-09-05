// clinic-features.js — جدول مواعيد العيادة + مدة الكيس + تحليل العيادة الشهري
// ============ CLINIC VISIT SCHEDULE (manual recurring "أول تلات" / "تالت سبت" style) ============
const WEEKDAY_LABELS_AR = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']; // JS getDay() order (0=Sun)
const ORDINAL_LABELS_AR = {1:'أول', 2:'تاني', 3:'تالت', 4:'رابع', '-1':'آخر'};
function scheduleLabelAr(s){
  return (ORDINAL_LABELS_AR[String(s.ordinal)] || s.ordinal) + ' ' + (WEEKDAY_LABELS_AR[s.weekday] || '');
}
// finds the date of the Nth (or last, ordinal=-1) occurrence of `weekday` in the given year/month (0-based month)
function occurrenceInMonth(year, month, weekday, ordinal){
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const matches = [];
  for(let day=1; day<=daysInMonth; day++){
    const d = new Date(year, month, day);
    if(d.getDay() === weekday) matches.push(day);
  }
  if(!matches.length) return null;
  let day;
  if(ordinal === -1){ day = matches[matches.length-1]; }
  else { day = matches[ordinal-1]; if(day === undefined) return null; }
  const mm = String(month+1).padStart(2,'0');
  const dd = String(day).padStart(2,'0');
  return `${year}-${mm}-${dd}`;
}
// next upcoming occurrence date (today or future) for one schedule entry
function nextScheduleOccurrence(schedule){
  const today = new Date(todayStr()+'T00:00:00');
  for(let add=0; add<3; add++){
    const y = today.getFullYear();
    const m = today.getMonth() + add;
    const d = new Date(y, m, 1);
    const occ = occurrenceInMonth(d.getFullYear(), d.getMonth(), schedule.weekday, schedule.ordinal);
    if(occ && occ >= todayStr()) return occ;
  }
  return null;
}
// all upcoming visits for a clinic, soonest first
function clinicUpcomingVisits(clinic){
  return (clinic.visitSchedules||[]).map(s=>{
    const date = nextScheduleOccurrence(s);
    return date ? {schedule:s, date, daysUntil: daysUntil(date)} : null;
  }).filter(Boolean).sort((a,b)=> a.date.localeCompare(b.date));
}

function buildPatientGreetingMessage(patient){
  return `أهلاً ${patient.name} 👋`;
}
// patient counts as "مجاش" once missed months reach this (>2 months = 3+)
const MISSED_MONTHS_ALERT_THRESHOLD = 3;
// counts consecutive fully-completed calendar months (going backward from last month,
// not counting the current in-progress month) with no monthly-follow-up entry at all —
// but never counts a month before the case actually started (otherwise a brand-new case
// whose only entry is this month would wrongly show up to 24 "missed" months of history
// that predates the case entirely).
function computeMissedMonths(file){
  const monthlyLog = file && file.monthlyLog;
  const monthsWithEntries = new Set((monthlyLog||[]).map(e => (e.date||'').slice(0,7)));
  const startDate = computeCaseStartDate(file);
  const startMonth = startDate ? startDate.slice(0,7) : null;
  let count = 0;
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1); // last fully-completed month
  for(let i=0;i<24;i++){
    const m = d.toISOString().slice(0,7);
    if(startMonth && m < startMonth) break; // case hadn't started yet — stop counting further back
    if(monthsWithEntries.has(m)) break;
    count++;
    d.setMonth(d.getMonth()-1);
  }
  return count;
}
function buildWhatsappLinkWithText(raw, text){
  const base = buildWhatsappLink(raw);
  if(base === '#') return '#';
  return base + '?text=' + encodeURIComponent(text || '');
}
function monthsSince(dateStr){
  if(!dateStr) return 0;
  const d = new Date(dateStr);
  const now = new Date();
  let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if(now.getDate() < d.getDate()) months -= 1;
  return Math.max(0, months);
}

// ============ CASE DURATION (case start / one-year / one-and-a-half-year tracking) ============
const CASE_LONG_DURATION_MONTHS = 18; // "قعدت أكتر من سنة ونص"
const CASE_ONE_YEAR_MONTHS = 12;
// best-guess start date for a case: manual override wins, otherwise the earliest date recorded
// anywhere for this patient (first monthly-follow-up entry or first "new case" event)
function computeCaseStartDate(file){
  if(!file) return null;
  if(file.caseStartDateOverride) return file.caseStartDateOverride;
  const dates = [];
  (file.monthlyLog||[]).forEach(e=>{ if(e.date) dates.push(e.date); });
  (file.newCaseEvents||[]).forEach(e=>{ if(e.date) dates.push(e.date); });
  if(!dates.length) return null;
  return dates.sort()[0];
}

async function loadClinicPatientAggregates(clinicId, month){
  state.clinicSummaryLoading = true;
  let total = 0;
  const missedStatus = {};
  const bracketTypes = {};
  const caseAlerts = {}; // patientId -> {months, oneYear, longDuration} — only for active cases with a known start date
  function applyFile(patientId, file){
    const payments = (file && file.payments) || [];
    payments.forEach(pay=>{
      if((pay.date||'').slice(0,7) === month){
        total += parseFloat(pay.amount) || 0;
      }
    });
    missedStatus[patientId] = computeMissedMonths(file);
    bracketTypes[patientId] = (file && file.bracketSystem) || '';
    if(file && (file.caseStatus || 'active') === 'active'){
      const startDate = computeCaseStartDate(file);
      if(startDate){
        const months = monthsSince(startDate);
        caseAlerts[patientId] = { months, oneYear: months === CASE_ONE_YEAR_MONTHS, longDuration: months >= CASE_LONG_DURATION_MONTHS };
      }
    }
  }
  try{
    if(state.patients.length){
      const keys = state.patients.map(p => '"patientfile:' + p.id + '"');
      await ensureFreshSession();
      const res = await fetch(
        SUPABASE_REST + '?key=in.(' + keys.join(',') + ')&select=key,value',
        { headers: supabaseHeaders() }
      );
      if(!res.ok) throw new Error('Supabase batch get failed: ' + res.status);
      const rows = await res.json();
      const byKey = {};
      rows.forEach(row=>{ byKey[row.key] = row.value; });
      state.patients.forEach(p=>{
        applyFile(p.id, byKey['patientfile:' + p.id]);
      });
    }
  }catch(e){
    console.error('clinic patient aggregates batch fetch failed', e);
    // fallback: old slower per-patient method, so the numbers still load even if batch fails
    for(const p of state.patients){
      const file = await getData('patientfile:' + p.id, { payments: [], monthlyLog: [] });
      applyFile(p.id, file);
    }
  }
  state.clinicSummaryTotal = total;
  state.clinicMissedStatus = missedStatus;
  state.clinicBracketTypes = bracketTypes;
  state.clinicCaseAlerts = caseAlerts;
  state.clinicSummaryLoading = false;
}

// returns 'YYYY-MM' shifted by `delta` whole months (delta can be negative)
function shiftMonthStr(ym, delta){
  const [y,m] = (ym||currentMonthStr()).split('-').map(Number);
  const d = new Date(y, (m-1) + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}

// Shared per-patient-file metrics used by both the single-clinic and the all-clinics analysis
// screens. `files` is an array of {patient, file} pairs (file may be missing for a brand-new
// patient with nothing saved yet).
function computeCaseStatsFromFiles(files, month){
  const monthsBack = [1,2,3].map(n=>shiftMonthStr(month, -n)); // 3 months right before `month`
  const allMonths = [month, ...monthsBack];
  const perPatient = [];
  const monthTotals = {}; allMonths.forEach(m=>monthTotals[m]=0);

  const debondedThisMonth = [];
  const turnedOneYearThisMonth = [];
  const overLongDuration = [];
  const paidOffStillActive = [];
  let extractionCount = 0, nonExtractionCount = 0, growthModCount = 0;
  let activeCasesCount = 0, debondedTotalCount = 0;

  files.forEach(({patient, file})=>{
    if(!file) return;
    const payments = file.payments || [];
    function sumForMonth(m){ return payments.filter(p=>(p.date||'').slice(0,7)===m).reduce((s,p)=>s+(parseFloat(p.amount)||0),0); }
    const thisAmt = sumForMonth(month);
    const prevAmts = monthsBack.map(sumForMonth);
    allMonths.forEach((m,idx)=>{ monthTotals[m] += (idx===0 ? thisAmt : prevAmts[idx-1]); });

    const newCaseDatesThisMonth = (file.newCaseEvents||[])
      .filter(ev=>(ev.date||'').slice(0,7)===month)
      .map(ev=>ev.date);
    perPatient.push({ name: patient.name, thisAmt, prevAmts, newCaseDatesThisMonth });

    const caseStatus = file.caseStatus || 'active';
    if(caseStatus === 'debonded'){
      debondedTotalCount++;
      if((file.debondDate||'').slice(0,7) === month) debondedThisMonth.push({ name: patient.name, date: file.debondDate });
      return;
    }

    activeCasesCount++;
    const startDate = computeCaseStartDate(file);
    if(startDate){
      const months = monthsSince(startDate);
      if(months >= CASE_LONG_DURATION_MONTHS) overLongDuration.push({ name: patient.name, date: startDate, months });
      if(shiftMonthStr(startDate.slice(0,7), CASE_ONE_YEAR_MONTHS) === month) turnedOneYearThisMonth.push({ name: patient.name, date: startDate });
    }

    const total = parseFloat(file.financeTotal) || 0;
    const extrasSum = (file.financeExtras||[]).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
    const paidSum = payments.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
    const caseValue = total + extrasSum;
    if(caseValue > 0 && paidSum >= caseValue) paidOffStillActive.push({ name: patient.name, remaining: caseValue - paidSum });

    const txPlan = (file.diagnosisSections||[]).find(s=>s.title==='Treatment Plan');
    const findVal = (label) => txPlan ? (((txPlan.fields||[]).find(f=>(f.label||'').trim().toLowerCase()===label)||{}).value||'') : '';
    const extractionVal = findVal('extraction / non-extraction');
    const growthVal = findVal('growth modification');
    if(extractionVal === 'Extraction') extractionCount++;
    else if(extractionVal === 'Non-extraction') nonExtractionCount++;
    if(growthVal === 'Yes') growthModCount++;
  });

  return {
    perPatient, monthTotals, monthsBack, allMonths,
    debondedThisMonth, turnedOneYearThisMonth, overLongDuration, paidOffStillActive,
    extractionCount, nonExtractionCount, growthModCount, activeCasesCount, debondedTotalCount
  };
}

// batch-fetches every patient file for `patients` (Supabase REST, falling back to per-item
// getData on failure) and returns [{patient, file}, ...]
async function batchLoadPatientFiles(patients){
  const results = [];
  try{
    if(patients.length){
      const keys = patients.map(p => '"patientfile:' + p.id + '"');
      await ensureFreshSession();
      const res = await fetch(
        SUPABASE_REST + '?key=in.(' + keys.join(',') + ')&select=key,value',
        { headers: supabaseHeaders() }
      );
      if(!res.ok) throw new Error('Supabase batch get failed: ' + res.status);
      const rows = await res.json();
      const byKey = {};
      rows.forEach(row=>{ byKey[row.key] = row.value; });
      patients.forEach(p=>{ results.push({ patient: p, file: byKey['patientfile:' + p.id] }); });
    }
  }catch(e){
    console.error('batch patient file fetch failed', e);
    results.length = 0;
    for(const p of patients){
      const file = await getData('patientfile:' + p.id, null);
      results.push({ patient: p, file });
    }
  }
  return results;
}

// ============ CLINIC MONTHLY ANALYSIS (income, patient stability, new cases, alerts) ============
async function loadClinicAnalysisData(clinicId, month){
  state.clinicAnalysisLoading = true;
  const files = await batchLoadPatientFiles(state.patients);
  const stats = computeCaseStatsFromFiles(files, month);

  // categorize each patient's stability this month vs the average of the previous 3 months
  const STABILITY_THRESHOLD = 0.15; // ±15% counts as "stable"
  const groups = { stable:[], up:[], down:[], stopped:[] };
  stats.perPatient.forEach(pd=>{
    const avgPrev = (pd.prevAmts[0]+pd.prevAmts[1]+pd.prevAmts[2]) / 3;
    if(pd.thisAmt === 0 && avgPrev === 0) return; // no payment data at all in this window — nothing to say
    if(avgPrev === 0 && pd.thisAmt > 0){ groups.up.push(pd); return; } // started paying, nothing to compare to yet
    if(pd.thisAmt === 0 && avgPrev > 0){ groups.stopped.push(pd); return; } // was paying, nothing this month
    const ratio = (pd.thisAmt - avgPrev) / avgPrev;
    if(Math.abs(ratio) <= STABILITY_THRESHOLD) groups.stable.push(pd);
    else if(ratio > STABILITY_THRESHOLD) groups.up.push(pd);
    else groups.down.push(pd);
  });

  const newCases = [];
  stats.perPatient.forEach(pd=>{
    pd.newCaseDatesThisMonth.forEach(d=>newCases.push({ name: pd.name, date: d }));
  });

  const incomeThisMonth = stats.monthTotals[month] || 0;
  const avgPrev3 = (stats.monthTotals[stats.monthsBack[0]] + stats.monthTotals[stats.monthsBack[1]] + stats.monthTotals[stats.monthsBack[2]]) / 3;

  const alerts = [];
  if(newCases.length === 0) alerts.push('⚠ مفيش حالات جديدة اتسجلت الشهر ده');
  if(avgPrev3 > 0 && incomeThisMonth < avgPrev3 * (1 - STABILITY_THRESHOLD)) alerts.push('⚠ فلوس المتابعات الشهر ده أقل من متوسط آخر 3 شهور');
  if(stats.overLongDuration.length > 0) alerts.push(`⏳ فيه ${stats.overLongDuration.length} حالة قاعدة أكتر من سنة ونص في العلاج`);
  if(stats.turnedOneYearThisMonth.length > 0) alerts.push(`🎂 ${stats.turnedOneYearThisMonth.length} حالة كمّلت سنة في العلاج الشهر ده`);

  state.clinicAnalysisData = {
    month, incomeThisMonth, avgPrev3, groups, newCases, alerts,
    debondedThisMonth: stats.debondedThisMonth,
    turnedOneYearThisMonth: stats.turnedOneYearThisMonth,
    overLongDuration: stats.overLongDuration,
    paidOffStillActive: stats.paidOffStillActive,
    extractionCount: stats.extractionCount,
    nonExtractionCount: stats.nonExtractionCount,
    growthModCount: stats.growthModCount,
    activeCasesCount: stats.activeCasesCount,
    debondedTotalCount: stats.debondedTotalCount
  };
  state.clinicAnalysisLoading = false;
}

