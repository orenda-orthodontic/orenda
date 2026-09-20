// state.js — الـ state العام للتطبيق
// ============ STATE ============
let state = {
  view: 'clinics', // 'clinics' | 'patients' | 'patient' | 'inventory' | 'reports'
  clinics: [],
  currentClinicId: null,
  patients: [], // patients of current clinic
  currentPatientId: null,
  searchTerm: '',
  activeTab: 'overview',
  expandedDiagSections: {},
  clinicSummaryMonth: null,
  clinicSummaryTotal: 0,
  clinicSummaryYourShare: 0, // this month's total split by each patient's own commission rule (respects "العيادة ليها نسبة") — computed in loadClinicPatientAggregates
  clinicSummaryLoading: false,
  clinicMissedStatus: {}, // patientId -> consecutive missed months (computed)
  clinicUnpaidStatus: {}, // patientId -> consecutive unpaid calendar months (computed)
  clinicBracketTypes: {}, // patientId -> 'roth'/'mbt'/'' (computed)
  patientSortMode: 'alpha', // 'alpha' | 'number'
  inventory: [], // items of current clinic
  inventoryCategories: [],
  photoUrlCache: {}, // path -> {url, expiresAt} — temporary signed URLs for the (now private) photos bucket
  doctorName: 'MAHMOUD NASSAR',
  monthlyKeywordsOpen: false,
  dismissedAlerts: {}, // alertKey -> signature (dismissed until the underlying value changes)
  deletedRevealTeeth: [], // array of 'categoryId:toothNum' keys the user explicitly deleted from a reveal chart
  clinicAnalysisMonth: null,
  clinicAnalysisLoading: false,
  clinicAnalysisData: null,
  allClinicsAnalysisMonth: null,
  allClinicsAnalysisLoading: false,
  allClinicsAnalysisData: null,
  reportsSelectedClinicId: '', // '' = "كل العيادات مجمعة" in the Reports tab, else a specific clinic id
  reportsMonth: null, // shared month picker for the Reports tab (both "all clinics" and single-clinic modes)
  reportsKind: 'cases', // 'cases' (تحليل الحالات) | 'inventory' (تقرير المخزون) — Reports tab report-type selector
  reportsWorkDays: null, // computed distinct work-days count for the Reports overview strip (null while loading)
  inventoryUsageReportData: null, // {month, perClinic, combinedUsage} — computed by computeInventoryUsageReport
  globalMissedAlerts: [], // [{patientId, name, clinicId, clinicName, missed}] — scanned across every clinic at boot
  globalUnpaidAlerts: [], // [{patientId, name, clinicId, clinicName, unpaid}] — scanned across every clinic at boot
  globalCaseAlerts: [], // [{patientId, name, clinicId, clinicName, months, oneYear, longDuration}] — scanned across every clinic at boot
  clinicCaseStatus: {}, // patientId -> 'active'/'debonded' (computed alongside clinicMissedStatus/clinicBracketTypes)
  patientsShowArchived: false, // false = show only active patients in the clinic's patient list, true = show only archived (debonded)
  photosCompareMode: 'beforeVsDuring', // 'beforeVsDuring' | 'duringVsDuring' — Photos tab "مقارنة" sub-screen
  photosCompareVisitA: null, // during-visit id — left side when photosCompareMode is 'duringVsDuring'
  photosCompareVisitB: null, // during-visit id — right side when photosCompareMode is 'duringVsDuring'
  photosActiveSectionByPatient: {}, // patientId -> 'before'/'during'/'after'/'compare' — which Photos sub-tab was last open, kept per patient
  contentQueueLoading: false, // Content Queue screen — true while scanning every clinic's patients for ⭐-flagged photos
  contentQueueData: null // [{patientId, patientName, clinicId, clinicName, photos:[...], latestFlaggedAt}] — null until first loaded, computed by loadContentQueueData()
};

const PHOTO_REMINDER_MONTHS = 3;
// local-time date helpers (NOT UTC) — using toISOString() here would shift the
// date/month backwards for part of the night in Egypt (UTC+2), since toISOString()
// converts to UTC first. Every "today"/"this month" in the app should go through
// these two functions instead of building its own Date string, so there's exactly
// one place to get this right.
function pad2(n){ return String(n).padStart(2,'0'); }
function currentMonthStr(){
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
}
function todayStr(){
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
// days between today and a given YYYY-MM-DD date (negative = in the past)
function daysUntil(dateStr){
  if(!dateStr) return null;
  const today = new Date(todayStr()+'T00:00:00');
  const d = new Date(dateStr+'T00:00:00');
  return Math.round((d - today) / 86400000);
}
function formatDateAr(dateStr){
  if(!dateStr) return '-';
  const parts = dateStr.split('-');
  if(parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
// returns 'YYYY-MM' shifted by `delta` whole months — used to compute "next month" labels
// (e.g. the Overview tab's "الشهر الجاي" card) from a logged entry's date, without depending
// on today's real date. delta can be negative.
function addMonthToYm(ym, delta){
  const [y, m] = (ym || currentMonthStr()).split('-').map(Number);
  const d = new Date(y, (m - 1) + (delta || 1), 1);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
}

