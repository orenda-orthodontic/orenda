// content-queue.js — شاشة "محتوى السوشيال ميديا" (الصور المعلّمة ⭐)
// ملحوظة: بيقرا PHOTO_*_SLOTS من photos-tab.js وقت التحميل، فلازم يتحمّل بعده
// اتنقل من photos-tab.js كما هو بدون أي تغيير في السلوك (تقسيم ملف كبير). لازم يتحمّل بـ <script> بعد
// photos-tab.js في index.html.

// ============ CONTENT QUEUE ("محتوى السوشيال ميديا") ============
// A dedicated screen that gathers every photo across every clinic/patient that's been flagged
// via the ⭐ button in the Photos tab, grouped by patient (one card per patient), with that
// patient's flagged photos sorted by when they were flagged (newest flag first). Doesn't touch
// any patient's own Photos tab data beyond reading it — reuses the same social/socialFlaggedAt
// fields written by toggleSocialFlag() above.
const CONTENT_QUEUE_ALL_SLOTS = [...PHOTO_EXTRAORAL_SLOTS, ...PHOTO_INTRAORAL_SLOTS, ...PHOTO_RECORDS_SLOTS];

function collectFlaggedPhotosForFile(file){
  const photos = ensurePhotos(file);
  const out = [];
  const grabSection = (sectionName, obj, visitId, visitDate) => {
    if(!obj) return;
    ['extraoral','intraoral','records'].forEach(category=>{
      const catObj = obj[category];
      if(!catObj) return;
      Object.keys(catObj).forEach(slotId=>{
        const s = catObj[slotId];
        if(s && s.social){
          const slotDef = CONTENT_QUEUE_ALL_SLOTS.find(x=>x.id===slotId);
          out.push({
            section: sectionName, visitId: visitId || null, visitDate: visitDate || null,
            category, slotId, slotLabel: slotDef ? slotDef.label : slotId,
            path: s.path, flaggedAt: s.socialFlaggedAt || s.uploadedAt || ''
          });
        }
      });
    });
  };
  grabSection('before', photos.before, null, null);
  grabSection('after', photos.after, null, null);
  (photos.during||[]).forEach(v => grabSection('during', v, v.id, v.date));
  return out;
}

// scans every clinic's patients (same batched approach as scanAllClinicsForAlerts) collecting
// only patients who have at least one flagged photo — most-recently-flagged patient first,
// and within each patient, most-recently-flagged photo first.
async function loadContentQueueData(){
  state.contentQueueLoading = true;
  render();
  try{
    const perPatient = [];
    await Promise.all((state.clinics||[]).map(async (c) => {
      const patients = await getData('patients:' + c.id, []);
      if(!patients.length) return;
      const files = await batchLoadPatientFiles(patients);
      files.forEach(({patient, file})=>{
        if(!file) return;
        const flagged = collectFlaggedPhotosForFile(file);
        if(!flagged.length) return;
        flagged.sort((a,b) => (b.flaggedAt||'').localeCompare(a.flaggedAt||''));
        perPatient.push({
          patientId: patient.id, patientName: patient.name,
          clinicId: c.id, clinicName: c.name,
          photos: flagged,
          latestFlaggedAt: flagged[0].flaggedAt || ''
        });
      });
    }));
    perPatient.sort((a,b) => (b.latestFlaggedAt||'').localeCompare(a.latestFlaggedAt||''));
    state.contentQueueData = perPatient;
  }catch(e){
    console.error('loadContentQueueData failed', e);
    state.contentQueueData = [];
  }
  state.contentQueueLoading = false;
  render();
}

function ensureContentQueueStyles(){
  if(document.getElementById('cqProStyles')) return;
  const s = document.createElement('style');
  s.id = 'cqProStyles';
  s.textContent = `
    .cq-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
    .cq-head h2{margin:0;font-size:19px;font-weight:700;}
    .cq-filters{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:12px;}
    .cq-chip{background:var(--panel) !important;color:var(--text) !important;border:1px solid var(--border) !important;border-radius:20px;padding:5px 14px;font-size:13px;font-weight:600;cursor:pointer;}
    .cq-chip.active{background:var(--accent) !important;color:#fff !important;border-color:var(--accent) !important;}
    .cq-filters select{max-width:200px;}
    .cq-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;}
    .cq-tile{display:flex;flex-direction:column;gap:6px;}
    .cq-tile-label{font-size:12px;color:var(--muted);line-height:1.4;}
    .cq-tile-label b{color:var(--text);font-weight:700;margin-inline-end:4px;}
    .cq-img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;cursor:zoom-in;display:block;background:var(--border);}
    .cq-img-empty{width:100%;aspect-ratio:1;border-radius:10px;background:var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--muted);}
  `;
  document.head.appendChild(s);
}

// applies the clinic + before/after/during filters to the scanned data (nothing is re-fetched)
function contentQueueFilteredData(){
  const f = state.cqFilter || 'all';
  const clinicId = state.cqClinicId || '';
  const order = { before: 0, after: 1, during: 2 };
  const out = [];
  (state.contentQueueData || []).forEach(p => {
    if(clinicId && p.clinicId !== clinicId) return;
    let photos = p.photos.filter(ph => f === 'all' || (f === 'ba' && ph.section !== 'during') || (f === 'during' && ph.section === 'during'));
    if(!photos.length) return;
    // same angle next to each other: قبل ثم بعد ثم أثناء
    photos = [...photos].sort((a, b) => (a.slotLabel || '').localeCompare(b.slotLabel || '') || (order[a.section] - order[b.section]));
    out.push(Object.assign({}, p, { photos }));
  });
  return out;
}

function renderContentQueueView(){
  if(state.contentQueueLoading || !state.contentQueueData){
    return `<div class="card"><div class="placeholder" style="padding:24px;">جارِ التحميل...</div></div>`;
  }
  ensureContentQueueStyles();
  const all = state.contentQueueData;
  if(!all.length){
    return `
      <div class="card">
        <div class="empty-state" style="padding:24px;">
          لسه مفيش صور معلّمة كـ"يصلح لسوشيال ميديا" — علّم صور من تبويب "الصور" بتاع أي مريض بالضغط على ⭐ اللي على الصورة
        </div>
      </div>
    `;
  }
  const f = state.cqFilter || 'all';
  const clinicId = state.cqClinicId || '';
  const data = contentQueueFilteredData();
  const photoCount = data.reduce((n, p) => n + p.photos.length, 0);
  const clinicOpts = [...new Map(all.map(p => [p.clinicId, p.clinicName])).entries()];
  const chip = (id, label) => `<button type="button" class="cq-chip${f === id ? ' active' : ''}" data-cq-filter="${id}">${label}</button>`;
  return `
    <div class="card" style="margin-bottom:14px;">
      <div class="cq-head"><h2>محتوى السوشيال ميديا</h2><div class="placeholder" style="padding:0;font-size:13px;border:none;">${data.length} مريض · ${photoCount} صورة</div></div>
      <div class="cq-filters">
        ${chip('all', 'الكل')}${chip('ba', 'قبل / بعد')}${chip('during', 'أثناء')}
        <select id="cqClinicSelect"><option value="">كل العيادات</option>${clinicOpts.map(([id, name]) => `<option value="${escapeHtml(id)}" ${id === clinicId ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select>
      </div>
    </div>
    ${data.length ? data.map(p => contentQueuePatientCardHtml(p)).join('') : `<div class="card"><div class="empty-state" style="padding:20px;">مفيش صور بالفلتر ده</div></div>`}
  `;
}

function contentQueuePatientCardHtml(p){
  const ts = p.latestFlaggedAt ? Date.parse(p.latestFlaggedAt) : NaN;
  const days = isNaN(ts) ? null : Math.max(0, Math.round((Date.now() - ts) / 86400000));
  const when = days === null ? '' : (days === 0 ? ' · اتعلّمت النهاردة' : ` · اتعلّمت من ${days} يوم`);
  return `
    <div class="card" style="margin-bottom:14px;">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div>
          <div style="font-weight:700;font-size:15.5px;">${escapeHtml(p.patientName)}</div>
          <div class="placeholder" style="padding:0;font-size:12px;border:none;">${escapeHtml(p.clinicName)}${when}</div>
        </div>
        <button class="secondary small" data-cq-open-patient="${p.patientId}" data-cq-clinic="${p.clinicId}">فتح الملف</button>
      </div>
      <div class="cq-grid">
        ${p.photos.map(ph => contentQueuePhotoThumbHtml(ph)).join('')}
      </div>
    </div>
  `;
}

function contentQueuePhotoThumbHtml(ph){
  const cached = state.photoUrlCache[ph.path];
  const url = (cached && cached.expiresAt > Date.now()) ? cached.url : '';
  const sectionLabel = ph.section === 'before' ? 'قبل' : ph.section === 'after' ? 'بعد' : ('أثناء' + (ph.visitDate ? ' ' + escapeHtml(formatDateAr(ph.visitDate)) : ''));
  return `
    <div class="cq-tile">
      <div class="cq-tile-label"><b>${sectionLabel}</b>${escapeHtml(ph.slotLabel)}</div>
      ${url
        ? `<img src="${url}" class="cq-img cq-photo-thumb" data-lightbox="${url}" loading="lazy" decoding="async" alt="">`
        : `<div class="cq-img-empty">جارِ التحميل...</div>`}
    </div>
  `;
}

function attachContentQueueHandlers(){
  document.querySelectorAll('[data-cq-filter]').forEach(el=>{ el.onclick = () => { state.cqFilter = el.dataset.cqFilter; render(); }; });
  const cqSel = document.getElementById('cqClinicSelect');
  if(cqSel) cqSel.onchange = () => { state.cqClinicId = cqSel.value; render(); };
  document.querySelectorAll('[data-cq-open-patient]').forEach(el=>{
    el.onclick = async () => {
      const clinicId = el.dataset.cqClinic;
      const patientId = el.dataset.cqOpenPatient;
      const clinic = state.clinics.find(c=>c.id===clinicId);
      if(!clinic) return;
      await loadPatients(clinicId);
      if(!state.patients.find(x=>x.id===patientId)) return;
      await loadInventory();
      state.currentClinicId = clinicId;
      state.currentPatientId = patientId;
      state.activeTab = 'photos';
      state.view = 'patient';
      render();
    };
  });
  document.querySelectorAll('.cq-photo-thumb').forEach(el=>{
    el.onclick = () => {
      const all = Array.from(document.querySelectorAll('.cq-photo-thumb'));
      const urls = all.map(x => x.dataset.lightbox || x.src);
      openLightbox(urls, all.indexOf(el));
    };
  });

  // sign whichever flagged-photo paths aren't cached yet (this screen can be the first place
  // a given photo is ever viewed this session), then redraw once ready — non-blocking, same
  // pattern as renderDiagPhotoDock() in diagnosis-photo-dock.js
  const data = contentQueueFilteredData();
  const paths = [];
  data.forEach(p => p.photos.forEach(ph => { if(ph.path) paths.push(ph.path); }));
  const needed = paths.filter(p => !(state.photoUrlCache[p] && state.photoUrlCache[p].expiresAt > Date.now()));
  if(needed.length){
    refreshPhotoUrlCache(needed).then(() => { if(state.view === 'contentqueue') render(); });
  }
}
