// diagnosis-photo-dock.js — لوحة صور عائمة بتفتح تلقائي وانت بتكتب في شيت التشخيص، عشان متحتاجش
// تفتح تبويب الصور وتقفله كل شوية وانت بتقارن. المطابقة بتتم على مستوى "القسم" في الشيت:
//   Extra-oral      -> Frontal Rest + Frontal Smile + Lateral (Profile)  سوا
//   Intra-oral      -> Frontal + Occlusal Upper + Occlusal Lower + Panorama سوا
//   Classification  -> Right + Left سوا (عشان تقارن وانت بتحدد الكلاس)
//   Cephalometric   -> Lateral Ceph
// دايمًا بتعرض صور "قبل" (baseline) بما إن ده اللي بيتاخد منه التشخيص عادةً.
// فيه زرار "تلقائي/يدوي" لو حابب توقف التتبع التلقائي وتختار القسم بنفسك بدل ما يتغير وهو
// بيكتب، وأزرار سريعة تفتح أي قسم يدوي في أي وقت بصرف النظر عن مكان الكتابة.

const DIAG_PHOTO_SECTION_MAP = {
  'Extra-oral': [
    { category: 'extraoral', slot: 'frontalRest', label: 'Frontal Rest' },
    { category: 'extraoral', slot: 'frontalSmile', label: 'Frontal Smile' },
    { category: 'extraoral', slot: 'profile', label: 'Lateral (Profile)' }
  ],
  'Intra-oral': [
    { category: 'intraoral', slot: 'frontal', label: 'Frontal' },
    { category: 'intraoral', slot: 'occlusalUpper', label: 'Occlusal Upper' },
    { category: 'intraoral', slot: 'occlusalLower', label: 'Occlusal Lower' },
    { category: 'records', slot: 'panorama', label: 'Panorama' }
  ],
  'Classification': [
    { category: 'intraoral', slot: 'right', label: 'Right' },
    { category: 'intraoral', slot: 'left', label: 'Left' }
  ],
  'Cephalometric': [
    { category: 'records', slot: 'lateralCeph', label: 'Lateral Ceph' }
  ]
};
const DIAG_PHOTO_SECTION_ORDER = ['Extra-oral', 'Intra-oral', 'Classification', 'Cephalometric'];

let diagPhotoDockAutoFollow = true;
let diagPhotoDockCollapsed = false;
let diagPhotoDockCurrentSection = null;
let diagPhotoDockPatientId = null;
let diagPhotoDockFocusHandlerAttached = false;

// works out which diagnosis SECTION a focused input belongs to, straight from the data
// attributes diagnosis-tab.js already renders — no change needed there.
function diagPhotoDockSectionTitleFromEl(el){
  const file = state.currentPatientFile;
  if(!file) return null;
  let secId = null;
  if(el.classList && el.classList.contains('diag-content')){
    secId = el.dataset.id; // the free-text notes box carries the SECTION id in data-id
  } else if(el.dataset && el.dataset.sec){
    secId = el.dataset.sec;
  } else {
    const carrier = el.closest('[data-sec]');
    if(carrier) secId = carrier.dataset.sec;
  }
  if(!secId) return null;
  const sec = (file.diagnosisSections || []).find(s => s.id === secId);
  return sec ? sec.title : null;
}

function ensureDiagPhotoDock(){
  // reset to the default section whenever we land on a different patient
  if(diagPhotoDockPatientId !== state.currentPatientId){
    diagPhotoDockPatientId = state.currentPatientId;
    diagPhotoDockCurrentSection = null;
  }
  let dock = document.getElementById('diagPhotoDock');
  if(!dock){
    dock = document.createElement('div');
    dock.id = 'diagPhotoDock';
    dock.style.cssText = 'position:fixed;bottom:20px;right:20px;width:320px;max-width:calc(100vw - 24px);max-height:70vh;background:var(--panel);border:1px solid var(--border);border-radius:12px;box-shadow:0 4px 18px rgba(0,0,0,.35);z-index:950;display:flex;flex-direction:column;overflow:hidden;';
    document.body.appendChild(dock);
  }
  renderDiagPhotoDock();
  if(!diagPhotoDockFocusHandlerAttached){
    diagPhotoDockFocusHandlerAttached = true;
    // delegated on document (registered once, ever) — cheap, and works no matter how many
    // times the diagnosis tab itself gets re-rendered/rebuilt
    document.addEventListener('focusin', (e) => {
      if(!diagPhotoDockAutoFollow) return;
      if(state.view !== 'patient' || state.activeTab !== 'diagnosis') return;
      const el = e.target;
      if(!el.matches || !el.matches('.diag-field-value, .diag-field-label, .diag-content, .diag-group-title')) return;
      const title = diagPhotoDockSectionTitleFromEl(el);
      if(title && DIAG_PHOTO_SECTION_MAP[title] && title !== diagPhotoDockCurrentSection){
        diagPhotoDockCurrentSection = title;
        renderDiagPhotoDock();
      }
    });
  }
}

function removeDiagPhotoDock(){
  const dock = document.getElementById('diagPhotoDock');
  if(dock) dock.remove();
}

// called once per render() (any screen) — shows/keeps-updated the dock only while actually on
// the diagnosis tab, hides it everywhere else.
function syncDiagPhotoDockVisibility(){
  if(state.view === 'patient' && state.activeTab === 'diagnosis'){
    ensureDiagPhotoDock();
  } else {
    removeDiagPhotoDock();
  }
}

async function renderDiagPhotoDock(){
  const dock = document.getElementById('diagPhotoDock');
  if(!dock) return;
  const file = state.currentPatientFile;
  if(!file) return;
  const photos = ensurePhotos(file);
  const section = (diagPhotoDockCurrentSection && DIAG_PHOTO_SECTION_MAP[diagPhotoDockCurrentSection])
    ? diagPhotoDockCurrentSection
    : DIAG_PHOTO_SECTION_ORDER[0];
  const items = DIAG_PHOTO_SECTION_MAP[section] || [];

  const headerHtml = `
    <div id="diagPhotoDockHeader" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--border);cursor:pointer;">
      <span style="font-size:12px;font-weight:700;">📷 ${escapeHtml(section)}</span>
      <span style="display:flex;gap:6px;align-items:center;">
        <button id="diagPhotoDockFollowBtn" class="secondary small" style="padding:2px 6px;font-size:11px;" title="لو شغّال، اللوحة بتتغير لوحدها حسب مكان الكتابة">${diagPhotoDockAutoFollow ? '🔗 تلقائي' : '📌 يدوي'}</button>
        <span id="diagPhotoDockCollapseIcon" style="font-size:14px;">${diagPhotoDockCollapsed ? '▸' : '▾'}</span>
      </span>
    </div>
  `;

  const tabsHtml = `
    <div style="display:flex;gap:4px;flex-wrap:wrap;padding:6px 8px;border-bottom:1px solid var(--border);">
      ${DIAG_PHOTO_SECTION_ORDER.map(s => `
        <button class="secondary small diag-photo-dock-tab" data-section="${escapeHtml(s)}" style="padding:2px 7px;font-size:11px;${s === section ? 'font-weight:700;' : ''}">${escapeHtml(s)}</button>
      `).join('')}
    </div>
  `;

  let bodyHtml = '';
  if(!diagPhotoDockCollapsed){
    bodyHtml = `
      <div id="diagPhotoDockBody" style="padding:8px;overflow-y:auto;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        ${items.map(it => {
          const slotObj = photos.before[it.category] ? photos.before[it.category][it.slot] : null;
          const url = slotObj ? resolvePhotoUrl(slotObj) : '';
          return `
            <div style="text-align:center;">
              <div style="font-size:10px;color:var(--muted);margin-bottom:3px;">${escapeHtml(it.label)}</div>
              ${url
                ? `<img src="${url}" data-dock-lightbox="1" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;cursor:zoom-in;">`
                : `<div style="width:100%;aspect-ratio:1;border-radius:6px;background:var(--border);display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--muted);">لا توجد صورة</div>`}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  dock.innerHTML = headerHtml + tabsHtml + bodyHtml;
  attachDiagPhotoDockHandlers();

  // sign whichever of these photos aren't already cached, then redraw once ready — avoids
  // blocking the dock's first paint on the network round trip
  const needed = items
    .map(it => photos.before[it.category] && photos.before[it.category][it.slot])
    .filter(Boolean)
    .map(s => s.path)
    .filter(p => p && !(state.photoUrlCache[p] && state.photoUrlCache[p].expiresAt > Date.now()));
  if(needed.length){
    await refreshPhotoUrlCache(needed);
    if(document.getElementById('diagPhotoDock')) renderDiagPhotoDock();
  }
}

function attachDiagPhotoDockHandlers(){
  const header = document.getElementById('diagPhotoDockHeader');
  if(header) header.onclick = (e) => {
    if(e.target.id === 'diagPhotoDockFollowBtn') return; // its own handler below stops propagation
    diagPhotoDockCollapsed = !diagPhotoDockCollapsed;
    renderDiagPhotoDock();
  };
  const followBtn = document.getElementById('diagPhotoDockFollowBtn');
  if(followBtn) followBtn.onclick = (e) => {
    e.stopPropagation();
    diagPhotoDockAutoFollow = !diagPhotoDockAutoFollow;
    renderDiagPhotoDock();
  };
  document.querySelectorAll('.diag-photo-dock-tab').forEach(btn => {
    btn.onclick = () => {
      diagPhotoDockCurrentSection = btn.dataset.section;
      diagPhotoDockAutoFollow = false; // manual pick sticks until switched back to "تلقائي"
      renderDiagPhotoDock();
    };
  });
  document.querySelectorAll('#diagPhotoDock [data-dock-lightbox]').forEach(img => {
    img.onclick = () => {
      const all = Array.from(document.querySelectorAll('#diagPhotoDock [data-dock-lightbox]'));
      openLightbox(all.map(i => i.src), all.indexOf(img));
    };
  });
}
