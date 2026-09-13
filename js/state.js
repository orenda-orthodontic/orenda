// state.js — الـ state العام للتطبيق
// ============ STATE ============
let state = {
  view: 'clinics', // 'clinics' | 'patients' | 'patient' | 'inventory' | 'clinicAnalysis' | 'allClinicsAnalysis'
  clinics: [],
  currentClinicId: null,
  patients: [], // patients of current clinic
  currentPatientId: null,
  searchTerm: '',
  activeTab: 'overview',
  expandedDiagSections: {},
  clinicSummaryMonth: null,
  clinicSummaryTotal: 0,
  clinicSummaryLoading: false,
  clinicMissedStatus: {}, // patientId -> consecutive missed months (computed)
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
  globalMissedAlerts: [], // [{patientId, name, clinicId, clinicName, missed}] — scanned across every clinic at boot
  globalCaseAlerts: [] // [{patientId, name, clinicId, clinicName, months, oneYear, longDuration}] — scanned across every clinic at boot
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

