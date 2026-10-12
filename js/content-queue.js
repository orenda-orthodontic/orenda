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

function renderContentQueueView(){
  if(state.contentQueueLoading || !state.contentQueueData){
    return `<div class="card"><div class="placeholder" style="padding:24px;">جارِ التحميل...</div></div>`;
  }
  const data = state.contentQueueData;
  if(!data.length){
    return `
      <div class="card">
        <div class="empty-state" style="padding:24px;">
          لسه مفيش صور معلّمة كـ"يصلح لسوشيال ميديا" — علّم صور من تبويب "الصور" بتاع أي مريض بالضغط على ⭐ اللي على الصورة
        </div>
      </div>
    `;
  }
  return `
    <div class="card" style="margin-bottom:14px;">
      <h2 style="margin:0 0 4px;">📸 محتوى السوشيال ميديا</h2>
      <div class="placeholder" style="padding:0;font-size:12px;">${data.length} مريض عندهم صور معلّمة — كل مريض صوره مرتبة بالأحدث تعليم الأول</div>
    </div>
    ${data.map(p => contentQueuePatientCardHtml(p)).join('')}
  `;
}

function contentQueuePatientCardHtml(p){
  return `
    <div class="card" style="margin-bottom:14px;">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div>
          <div style="font-weight:700;">${escapeHtml(p.patientName)}</div>
          <div class="placeholder" style="padding:0;font-size:11px;">${escapeHtml(p.clinicName)}</div>
        </div>
        <button class="secondary small" data-cq-open-patient="${p.patientId}" data-cq-clinic="${p.clinicId}">فتح ملف المريض</button>
      </div>
      <div class="photo-slots-grid">
        ${p.photos.map(ph => contentQueuePhotoThumbHtml(ph)).join('')}
      </div>
    </div>
  `;
}

function contentQueuePhotoThumbHtml(ph){
  const cached = state.photoUrlCache[ph.path];
  const url = (cached && cached.expiresAt > Date.now()) ? cached.url : '';
  const sectionLabel = ph.section === 'before' ? 'قبل' : ph.section === 'after' ? 'بعد' : ('أثناء' + (ph.visitDate ? ' — ' + escapeHtml(ph.visitDate) : ''));
  return `
    <div class="photo-slot">
      <div class="photo-slot-label">${sectionLabel} · ${escapeHtml(ph.slotLabel)}</div>
      ${url
        ? `<div class="photo-slot-thumb-wrap"><img src="${url}" class="photo-slot-thumb cq-photo-thumb" data-lightbox="${url}" loading="lazy" decoding="async"></div>`
        : `<div class="photo-slot-empty">جارِ التحميل...</div>`}
    </div>
  `;
}

function attachContentQueueHandlers(){
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
  const data = state.contentQueueData || [];
  const paths = [];
  data.forEach(p => p.photos.forEach(ph => { if(ph.path) paths.push(ph.path); }));
  const needed = paths.filter(p => !(state.photoUrlCache[p] && state.photoUrlCache[p].expiresAt > Date.now()));
  if(needed.length){
    refreshPhotoUrlCache(needed).then(() => { if(state.view === 'contentqueue') render(); });
  }
}
