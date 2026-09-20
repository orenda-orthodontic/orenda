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
  // أرشفة الحالة (فكت) توقف تنبيه "مجاش من X شهر" نهائيًا — الحالة خلصت وخرجت من المتابعة
  if(!file || (file.caseStatus || 'active') !== 'active') return 0;
  // Explicit-only: counts consecutive "❌ العيان مجاش الشهر ده" markers at the most recent end of
  // the log, not silence. Previously this walked real calendar months and treated ANY month with
  // no monthlyLog entry at all as a missed visit — but a doctor simply being late to log a month
  // he DID see the patient in looked identical to a genuine no-show, and forgetting to log at all
  // (the most common real failure mode) triggered false alarms just the same. Now nothing counts
  // as missed unless it was explicitly marked so via that button — logging catching up late no
  // longer trips this at all, at the cost of relying on the mark actually being made.
  const log = (file.monthlyLog || []).filter(e => e.date).sort((a,b) => (b.date||'').localeCompare(a.date||''));
  let count = 0;
  for(const e of log){
    if(e.missed) count++;
    else break;
  }
  return count;
}

// patient counts as "مدفعش" once unpaid months reach this (2+ consecutive calendar months)
const UNPAID_MONTHS_ALERT_THRESHOLD = 2;
// Unlike computeMissedMonths (attendance — explicit-marker based, so logging late doesn't look
// like a no-show), a payment is a real dated transaction: it either landed in a given calendar
// month or it didn't, with no "logged late" ambiguity to protect against. So this DOES walk real
// calendar months — backward from the last FULLY completed month (the current in-progress month
// isn't judged yet, same as the "يوم شغل" work-days count elsewhere) — counting how many months
// in a row have no payment recorded at all, stopping at whichever comes first: a month that DOES
// have a payment, or the case's own start month (never counts unpaid months before the case
// actually started, same guard as computeMissedMonths' old calendar version had).
function computeUnpaidMonths(file){
  if(!file || (file.caseStatus || 'active') !== 'active') return 0;
  const paidMonths = new Set((file.payments||[]).filter(p=>p.date).map(p => p.date.slice(0,7)));
  const startYm = (computeCaseStartDate(file) || '').slice(0,7);
  let ym = addMonthToYm(currentMonthStr(), -1);
  let count = 0;
  while(!paidMonths.has(ym)){
    if(startYm && ym < startYm) break;
    count++;
    ym = addMonthToYm(ym, -1);
    if(count >= 60) break; // safety cap — never loops forever on bad/missing data
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
  const clinicObj = (state.clinics||[]).find(c=>c.id===clinicId);
  const clinicCommissionPct = clinicObj ? (parseFloat(clinicObj.commission) || 70) : 70;
  let total = 0;
  let yourShareTotal = 0;
  const missedStatus = {};
  const unpaidStatus = {};
  const bracketTypes = {};
  const caseStatusMap = {}; // patientId -> 'active'/'debonded' — used to filter the patient list vs the archive
  const caseAlerts = {}; // patientId -> {months, oneYear, longDuration} — only for active cases with a known start date
  function applyFile(patientId, file){
    const payments = (file && file.payments) || [];
    // "حالة الدكتور" (file.clinicHasShare === false) is 100% his for THAT patient's money —
    // applying the clinic's blanket commission % to the whole month's total afterward (the old
    // approach) silently gave the clinic a cut of money that should've been 100% his instead.
    const patientPct = (file && file.clinicHasShare !== false) ? clinicCommissionPct : 100;
    payments.forEach(pay=>{
      if((pay.date||'').slice(0,7) === month){
        const amt = parseFloat(pay.amount) || 0;
        total += amt;
        yourShareTotal += amt * (patientPct/100);
      }
    });
    missedStatus[patientId] = computeMissedMonths(file);
    unpaidStatus[patientId] = computeUnpaidMonths(file);
    bracketTypes[patientId] = (file && file.bracketSystem) || '';
    caseStatusMap[patientId] = (file && file.caseStatus) || 'active';
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
  state.clinicSummaryYourShare = yourShareTotal;
  state.clinicMissedStatus = missedStatus;
  state.clinicUnpaidStatus = unpaidStatus;
  state.clinicBracketTypes = bracketTypes;
  state.clinicCaseStatus = caseStatusMap;
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
function computeCaseStatsFromFiles(files, month, clinicCommissionPct){
  const clinicPct = (typeof clinicCommissionPct === 'number' && !isNaN(clinicCommissionPct)) ? clinicCommissionPct : 70;
  const monthsBack = [1,2,3].map(n=>shiftMonthStr(month, -n)); // 3 months right before `month`
  const allMonths = [month, ...monthsBack];
  const perPatient = [];
  const monthTotals = {}; allMonths.forEach(m=>monthTotals[m]=0);
  // "حالة الدكتور" patients (file.clinicHasShare === false) are 100% his regardless of the
  // clinic's blanket commission % — this tracks each month's total split by that per-patient
  // rule instead of applying one flat % to everything afterward (which used to silently give the
  // clinic a cut of money that should've been 100% his, and the doctor's own share too little).
  const monthYourShareTotals = {}; allMonths.forEach(m=>monthYourShareTotals[m]=0);

  const debondedThisMonth = [];
  const turnedOneYearThisMonth = [];
  const overLongDuration = [];
  const paidOffStillActive = [];
  const settledActive = [];
  const unsettledActive = [];
  let extractionCount = 0, nonExtractionCount = 0, growthModCount = 0;
  let activeCasesCount = 0, debondedTotalCount = 0;

  files.forEach(({patient, file})=>{
    if(!file) return;
    const payments = file.payments || [];
    const patientPct = file.clinicHasShare !== false ? clinicPct : 100; // default (unset) = "له نصيب" as before
    function sumForMonth(m){ return payments.filter(p=>(p.date||'').slice(0,7)===m).reduce((s,p)=>s+(parseFloat(p.amount)||0),0); }
    const thisAmt = sumForMonth(month);
    const prevAmts = monthsBack.map(sumForMonth);
    allMonths.forEach((m,idx)=>{
      const amt = (idx===0 ? thisAmt : prevAmts[idx-1]);
      monthTotals[m] += amt;
      monthYourShareTotals[m] += amt * (patientPct/100);
    });

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
    if(file.accountSettled) settledActive.push({ name: patient.name, date: file.accountSettledDate });
    else unsettledActive.push({ name: patient.name });
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
    perPatient, monthTotals, monthYourShareTotals, monthsBack, allMonths,
    debondedThisMonth, turnedOneYearThisMonth, overLongDuration, paidOffStillActive,
    settledActive, unsettledActive,
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

// ============ CROSS-CLINIC ALERT SCAN (runs once at boot) ============
// The per-clinic alerts (missed months / one-year / long-duration) used to only get computed for
// whichever clinic's patient list happened to be open (loadClinicPatientAggregates). That meant a
// case turning exactly one year old in a clinic you hadn't opened this session never showed up in
// the notification bell. This scans every clinic's patients once, independent of what's on screen,
// so the bell is always accurate across the whole practice.
// scans every clinic for missed-follow-up / long-duration-case alerts, at boot. Each clinic's
// data is independent, so all clinics are fetched in parallel (Promise.all) instead of one after
// another — with several clinics this scan used to take roughly (clinics × per-clinic fetch time)
// sequentially; in parallel it takes about as long as the single slowest clinic.
async function scanAllClinicsForAlerts(){
  const missedAlerts = [];
  const unpaidAlerts = [];
  const caseAlerts = [];
  await Promise.all((state.clinics||[]).map(async (c) => {
    try{
      const patients = await getData('patients:' + c.id, []);
      if(!patients.length) return;
      const files = await batchLoadPatientFiles(patients);
      files.forEach(({patient, file})=>{
        if(!file) return;
        const missed = computeMissedMonths(file);
        if(missed >= MISSED_MONTHS_ALERT_THRESHOLD){
          missedAlerts.push({ patientId: patient.id, name: patient.name, clinicId: c.id, clinicName: c.name, missed });
        }
        const unpaid = computeUnpaidMonths(file);
        if(unpaid >= UNPAID_MONTHS_ALERT_THRESHOLD){
          unpaidAlerts.push({ patientId: patient.id, name: patient.name, clinicId: c.id, clinicName: c.name, unpaid });
        }
        if((file.caseStatus || 'active') === 'active'){
          const startDate = computeCaseStartDate(file);
          if(startDate){
            const months = monthsSince(startDate);
            const oneYear = months === CASE_ONE_YEAR_MONTHS;
            const longDuration = months >= CASE_LONG_DURATION_MONTHS;
            if(oneYear || longDuration){
              caseAlerts.push({ patientId: patient.id, name: patient.name, clinicId: c.id, clinicName: c.name, months, oneYear, longDuration });
            }
          }
        }
      });
    }catch(e){
      console.error('scanAllClinicsForAlerts failed for clinic', c.id, e);
    }
  }));
  state.globalMissedAlerts = missedAlerts;
  state.globalUnpaidAlerts = unpaidAlerts;
  state.globalCaseAlerts = caseAlerts;
}

// ============ ALL-CLINICS COMBINED ANALYSIS (compare clinics, combined totals) ============
// Reuses computeCaseStatsFromFiles per clinic (for the comparison table) and once more on every
// file concatenated together (for the combined totals), so the math always matches the existing
// single-clinic analysis screen exactly.
// ============ INVENTORY USAGE REPORT ============
// For a given month: how much of each item every clinic used (from materialsUsed on that clinic's
// patients' monthlyLog entries — this already covers every deduction path, automatic keyword-based
// or manual, since they all push into materialsUsed), plus each item's current stock and last
// restock date. Every clinic is fetched in parallel, same reasoning as the other per-clinic scans.
async function computeInventoryUsageReport(month){
  const perClinic = await Promise.all((state.clinics||[]).map(async (c) => {
    const patients = await getData('patients:' + c.id, []);
    const files = await batchLoadPatientFiles(patients);
    const usage = {}; // itemName -> qty used this month by this clinic
    files.forEach(({file}) => {
      if(!file) return;
      (file.monthlyLog||[]).forEach(e => {
        if(!e || typeof e.date !== 'string' || e.date.slice(0,7) !== month) return;
        (e.materialsUsed||[]).forEach(m => {
          if(!m) return;
          const name = (typeof m.itemName === 'string' && m.itemName.trim()) ? m.itemName : 'غير معروف';
          usage[name] = (usage[name]||0) + (parseFloat(m.qty)||0);
        });
      });
    });
    return { clinicId: c.id, clinicName: c.name, usage };
  }));

  const combinedUsage = {}; // itemName -> total qty across every clinic
  perClinic.forEach(pc => {
    Object.entries(pc.usage).forEach(([name, qty]) => {
      combinedUsage[name] = (combinedUsage[name]||0) + qty;
    });
  });

  return { month, perClinic, combinedUsage };
}

function buildInventoryUsageReportHtml(report){
  // names filtered to real, non-empty strings before sorting — an inventory item with a missing
  // name (or any stray non-string value slipping into a usage key) would otherwise throw inside
  // localeCompare and take the whole Reports screen down with it, not just this one table
  const itemNames = Array.from(new Set([
    ...state.inventory.map(i=>i.name),
    ...Object.keys(report.combinedUsage)
  ])).filter(n => typeof n === 'string' && n.trim()).sort((a,b)=>a.localeCompare(b,'ar'));

  const rowsHtml = itemNames.map(name => {
    const item = state.inventory.find(i=>i.name === name);
    const used = report.combinedUsage[name] || 0;
    const stock = item ? (parseFloat(item.qty)||0) : null;
    const lastRestock = item && item.lastRestockedAt ? formatDateAr(item.lastRestockedAt) : '—';
    const perClinicUsed = report.perClinic.filter(pc => pc.usage[name]);
    const perClinicLabel = perClinicUsed.length
      ? perClinicUsed.map(pc => `${escapeHtml(pc.clinicName)}: ${pc.usage[name]}`).join(' | ')
      : '—';
    return `
      <tr>
        <td>${escapeHtml(name)}</td>
        <td style="text-align:center;">${used || '—'}</td>
        <td style="text-align:center;">${stock === null ? '<span class="placeholder">مش في المخزون</span>' : stock}</td>
        <td style="text-align:center;">${lastRestock}</td>
        <td style="font-size:12px;">${perClinicLabel}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="card">
      <div class="section-title" style="margin:0 0 10px;">📦 تقرير المخزون — ${monthLabelAr(report.month)}</div>
      ${itemNames.length ? `
        <table class="diag-table">
          <thead><tr><th>الصنف</th><th>استخدام الشهر</th><th>المخزون الحالي</th><th>آخر توريد</th><th>حسب العيادة</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      ` : `<div class="placeholder">مفيش أي استخدام أو أصناف مسجلة</div>`}
    </div>
  `;
}

// ============ REPORTS OVERVIEW STRIP (أيام الشغل / عدد العيادات / أصناف محتاجة توريد) ============
// Moved off the main Clinics screen (visible to anyone who opens the app, staff included) into
// Reports specifically so it's not shown to just anyone by default. "أيام الشغل" = count of
// distinct calendar days, across every clinic, that have at least one REAL (non-missed) monthly
// follow-up entry logged that month — a day counts once even if multiple clinics/patients were
// seen on it.
async function computeWorkDaysThisMonth(month){
  const perClinicDateSets = await Promise.all((state.clinics||[]).map(async (c) => {
    const patients = await getData('patients:' + c.id, []);
    const files = await batchLoadPatientFiles(patients);
    const dates = new Set();
    files.forEach(({file}) => {
      if(!file) return;
      (file.monthlyLog||[]).forEach(e => {
        if(!e || typeof e.date !== 'string' || e.missed) return;
        if(e.date.slice(0,7) !== month) return;
        dates.add(e.date);
      });
    });
    return dates;
  }));
  const allDates = new Set();
  perClinicDateSets.forEach(s => s.forEach(d => allDates.add(d)));
  // returns the actual dates too (not just the count) so a wrong/unexpected count is checkable —
  // e.g. a draft entry accidentally materialized with today's date while just browsing, or a
  // backfilled old entry that kept today's date instead of the real visit date, would otherwise
  // silently inflate the number with no way to tell which day is the odd one out
  return { count: allDates.size, dates: [...allDates].sort() };
}

async function loadAllClinicsAnalysisData(month){
  state.allClinicsAnalysisLoading = true;
  // each clinic's data is independent, so fetch every clinic in parallel instead of one after
  // another — this powers "كل العيادات مجمعة" and used to take roughly (clinics × per-clinic
  // fetch time) sequentially; Promise.all still resolves in the same clinic order as state.clinics
  const perClinicResults = await Promise.all((state.clinics||[]).map(async (c) => {
    const patients = await getData('patients:' + c.id, []);
    const files = await batchLoadPatientFiles(patients);
    const stats = computeCaseStatsFromFiles(files, month, parseFloat(c.commission) || 70);
    return { clinic: c, stats, patientCount: patients.length, files };
  }));
  const perClinic = perClinicResults.map(({clinic, stats, patientCount}) => ({ clinic, stats, patientCount }));
  const allFiles = perClinicResults.reduce((acc, r) => acc.concat(r.files), []);
  const combinedStats = computeCaseStatsFromFiles(allFiles, month);
  state.allClinicsAnalysisData = { month, perClinic, combinedStats };
  state.allClinicsAnalysisLoading = false;
}

// ============ CLINIC MONTHLY ANALYSIS (income, patient stability, new cases, alerts) ============
async function loadClinicAnalysisData(clinicId, month){
  state.clinicAnalysisLoading = true;
  // fetch this clinic's patients explicitly rather than assuming state.patients already holds
  // them — Reports lets the doctor pick ANY clinic from a dropdown, not just whichever one's
  // patient list happens to be open, so this can no longer rely on that ambient state.
  const patients = await getData('patients:' + clinicId, []);
  const files = await batchLoadPatientFiles(patients);
  const clinicObj = (state.clinics||[]).find(c=>c.id===clinicId);
  const clinicCommissionPct = clinicObj ? (parseFloat(clinicObj.commission) || 70) : 70;
  const stats = computeCaseStatsFromFiles(files, month, clinicCommissionPct);

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
  const incomeYourShareThisMonth = stats.monthYourShareTotals[month] || 0;
  const avgPrev3 = (stats.monthTotals[stats.monthsBack[0]] + stats.monthTotals[stats.monthsBack[1]] + stats.monthTotals[stats.monthsBack[2]]) / 3;

  const alerts = [];
  if(newCases.length === 0) alerts.push('⚠ مفيش حالات جديدة اتسجلت الشهر ده');
  if(avgPrev3 > 0 && incomeThisMonth < avgPrev3 * (1 - STABILITY_THRESHOLD)) alerts.push('⚠ فلوس المتابعات الشهر ده أقل من متوسط آخر 3 شهور');
  if(stats.overLongDuration.length > 0) alerts.push(`⏳ فيه ${stats.overLongDuration.length} حالة قاعدة أكتر من سنة ونص في العلاج`);
  if(stats.turnedOneYearThisMonth.length > 0) alerts.push(`🎂 ${stats.turnedOneYearThisMonth.length} حالة كمّلت سنة في العلاج الشهر ده`);

  state.clinicAnalysisData = {
    clinicId, month, incomeThisMonth, incomeYourShareThisMonth, avgPrev3, groups, newCases, alerts,
    debondedThisMonth: stats.debondedThisMonth,
    turnedOneYearThisMonth: stats.turnedOneYearThisMonth,
    overLongDuration: stats.overLongDuration,
    paidOffStillActive: stats.paidOffStillActive,
    settledActive: stats.settledActive,
    unsettledActive: stats.unsettledActive,
    extractionCount: stats.extractionCount,
    nonExtractionCount: stats.nonExtractionCount,
    growthModCount: stats.growthModCount,
    activeCasesCount: stats.activeCasesCount,
    debondedTotalCount: stats.debondedTotalCount
  };
  state.clinicAnalysisLoading = false;
}

