// photos-tab.js — تبويب الصور (قبل/أثناء، مقارنة، رفع لـ Supabase Storage)
// ============ PHOTOS TAB (Extraoral/Intraoral slots, Before + During timeline, Supabase Storage) ============
const PHOTO_INTRAORAL_SLOTS = [
  {id:'frontal', label:'Frontal'},
  {id:'occlusalUpper', label:'Occlusal Upper'},
  {id:'occlusalLower', label:'Occlusal Lower'},
  {id:'right', label:'Right'},
  {id:'left', label:'Left'}
];
const PHOTO_EXTRAORAL_SLOTS = [
  {id:'frontalRest', label:'Frontal Rest'},
  {id:'frontalSmile', label:'Frontal Smile'},
  {id:'profile', label:'Profile'}
];
// records/radiographs — only shown for "before" and "after" (not the recurring "during" visits)
const PHOTO_RECORDS_SLOTS = [
  {id:'occlusalPlan', label:'Occlusal Plan'},
  {id:'lateralCeph', label:'Lateral Ceph'},
  {id:'panorama', label:'Panorama'}
];
const PHOTO_STORAGE_BUCKET = 'patient-photos';

function emptyPhotoSection(withRecords){
  const s = {extraoral:{}, intraoral:{}};
  if(withRecords) s.records = {};
  return s;
}

function ensurePhotos(file){
  if(!file.photos) file.photos = { before: emptyPhotoSection(true), after: emptyPhotoSection(true), during: [] };
  if(!file.photos.before) file.photos.before = emptyPhotoSection(true);
  if(!file.photos.before.extraoral) file.photos.before.extraoral = {};
  if(!file.photos.before.intraoral) file.photos.before.intraoral = {};
  if(!file.photos.before.records) file.photos.before.records = {};
  if(!file.photos.after) file.photos.after = emptyPhotoSection(true);
  if(!file.photos.after.extraoral) file.photos.after.extraoral = {};
  if(!file.photos.after.intraoral) file.photos.after.intraoral = {};
  if(!file.photos.after.records) file.photos.after.records = {};
  if(!file.photos.during) file.photos.during = [];
  return file.photos;
}

// resizes + re-encodes the image client-side before upload so the free storage quota goes further
async function compressImageFile(file, maxDim, quality){
  maxDim = maxDim || 1400;
  quality = quality || 0.8;
  const imgUrl = URL.createObjectURL(file);
  try{
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = imgUrl;
    });
    let w = img.width, h = img.height;
    if(w > h && w > maxDim){ h = Math.round(h * maxDim / w); w = maxDim; }
    else if(h >= w && h > maxDim){ w = Math.round(w * maxDim / h); h = maxDim; }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob || file;
  }catch(e){
    console.error('compress failed, uploading original', e);
    return file;
  }finally{
    URL.revokeObjectURL(imgUrl);
  }
}

async function uploadPhotoToStorage(blob, path){
  await ensureFreshSession();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${PHOTO_STORAGE_BUCKET}/${path}`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }),
    body: blob
  });
  if(!res.ok){
    const t = await res.text().catch(()=> '');
    throw new Error('Storage upload failed: ' + res.status + ' ' + t);
  }
  // bucket is private now — this "public" URL only works once we generate a signed URL for it,
  // which happens lazily via refreshPhotoUrlCache() whenever the Photos tab is rendered
  return `${SUPABASE_URL}/storage/v1/object/public/${PHOTO_STORAGE_BUCKET}/${path}`;
}

// signs a batch of storage paths at once (one request instead of one per photo) and caches
// the temporary signed URLs in state.photoUrlCache, keyed by path; signed URLs expire after
// PHOTO_SIGNED_URL_TTL seconds so a copied/leaked link stops working on its own
const PHOTO_SIGNED_URL_TTL = 3600; // 1 hour
async function refreshPhotoUrlCache(paths){
  const now = Date.now();
  const needed = [...new Set((paths || []).filter(Boolean))]
    .filter(p => !state.photoUrlCache[p] || state.photoUrlCache[p].expiresAt < now);
  if(!needed.length) return;
  try{
    await ensureFreshSession();
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${PHOTO_STORAGE_BUCKET}`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({ expiresIn: PHOTO_SIGNED_URL_TTL, paths: needed })
    });
    if(!res.ok) throw new Error('Storage sign batch failed: ' + res.status);
    const rows = await res.json();
    (rows || []).forEach(r=>{
      if(r && r.signedURL && !r.error){
        const full = r.signedURL.startsWith('http') ? r.signedURL : `${SUPABASE_URL}/storage/v1${r.signedURL}`;
        state.photoUrlCache[r.path] = { url: full, expiresAt: now + (PHOTO_SIGNED_URL_TTL - 60) * 1000 };
      }
    });
  }catch(e){
    console.error('refreshPhotoUrlCache failed', e);
  }
}

// reads the cached signed URL for a stored photo object; falls back to the old .url field
// (harmless if the bucket is still public, dead if it's private — either way not a crash)
function resolvePhotoUrl(photoObj){
  if(!photoObj) return '';
  const cached = photoObj.path && state.photoUrlCache[photoObj.path];
  return (cached && cached.url) || photoObj.url || '';
}

function collectPhotoPaths(photos){
  const paths = [];
  const grab = (obj) => { if(obj) Object.values(obj).forEach(s => { if(s && s.path) paths.push(s.path); }); };
  if(photos.before){ grab(photos.before.extraoral); grab(photos.before.intraoral); grab(photos.before.records); }
  if(photos.after){ grab(photos.after.extraoral); grab(photos.after.intraoral); grab(photos.after.records); }
  (photos.during || []).forEach(v => { grab(v.extraoral); grab(v.intraoral); });
  return paths;
}

// quick "view photos" entry point usable from anywhere in the patient shell (e.g. the diagnosis
// tab, while actually diagnosing the case) without switching to the Photos tab and back —
// refreshes signed URLs on demand since they might not be cached yet if Photos hasn't been
// opened this session. Order: before -> during (chronological) -> after, since "before" is what
// you usually need while diagnosing.
async function openPatientPhotosQuickView(){
  const file = state.currentPatientFile;
  const photos = ensurePhotos(file);
  const beforePaths = collectPhotoPaths({ before: photos.before });
  if(!beforePaths.length){ toast('لسه مفيش صور "قبل" مرفوعة للمريض ده'); return; }
  await refreshPhotoUrlCache(beforePaths);

  const urls = [];
  const grab = (obj) => { if(obj) Object.values(obj).forEach(s => { const u = resolvePhotoUrl(s); if(u) urls.push(u); }); };
  grab(photos.before.extraoral); grab(photos.before.intraoral); grab(photos.before.records);

  openLightbox(urls, 0);
}

async function deletePhotoFromStorage(path){
  if(!path) return;
  await ensureFreshSession();
  try{
    await fetch(`${SUPABASE_URL}/storage/v1/object/${PHOTO_STORAGE_BUCKET}/${path}`, { method: 'DELETE', headers: supabaseHeaders() });
  }catch(e){ console.error('delete photo failed', e); }
}

function photoSlotPath(patientId, section, visitId, category, slotId){
  const base = visitId ? `${patientId}/during/${visitId}` : `${patientId}/${section}`;
  return `${base}/${category}-${slotId}-${uid()}.jpg`;
}

function getSlotsObj(section, visitId, category){
  const photos = ensurePhotos(state.currentPatientFile);
  if(section === 'before') return photos.before[category];
  if(section === 'after') return photos.after[category];
  const v = photos.during.find(x=>x.id===visitId);
  return v ? v[category] : null;
}

const PHOTO_SLOT_ORDER = [
  {category:'extraoral', id:'frontalRest'},
  {category:'extraoral', id:'frontalSmile'},
  {category:'extraoral', id:'profile'},
  {category:'intraoral', id:'frontal'},
  {category:'intraoral', id:'occlusalUpper'},
  {category:'intraoral', id:'occlusalLower'},
  {category:'intraoral', id:'right'},
  {category:'intraoral', id:'left'}
];
// "before"/"after" also carry the 3 records/radiograph slots at the end of the batch order
const PHOTO_SLOT_ORDER_WITH_RECORDS = [
  ...PHOTO_SLOT_ORDER,
  {category:'records', id:'occlusalPlan'},
  {category:'records', id:'lateralCeph'},
  {category:'records', id:'panorama'}
];
function photoSlotOrderFor(section){
  return (section === 'before' || section === 'after') ? PHOTO_SLOT_ORDER_WITH_RECORDS : PHOTO_SLOT_ORDER;
}

// does the actual compress+upload+save for one slot, without toasting/rendering —
// used both by single-slot drop and by the batch multi-drop below
async function uploadOnePhotoSlot(section, visitId, category, slotId, file){
  const pFile = state.currentPatientFile;
  const slotsObj = getSlotsObj(section, visitId, category);
  if(!slotsObj) throw new Error('slot not found');
  const blob = await compressImageFile(file);
  const path = photoSlotPath(state.currentPatientId, section, visitId, category, slotId);
  const url = await uploadPhotoToStorage(blob, path);
  const old = slotsObj[slotId];
  slotsObj[slotId] = { path, url, uploadedAt: new Date().toISOString() };
  await savePatientFile(state.currentPatientId, stripHelperFields(pFile));
  if(old && old.path) deletePhotoFromStorage(old.path);
}

async function handlePhotoDrop(section, visitId, category, slotId, file){
  if(!file || !file.type || file.type.indexOf('image/') !== 0){ toast('لازم تختار صورة'); return; }
  toast('بيترفع...');
  try{
    await uploadOnePhotoSlot(section, visitId, category, slotId, file);
    toast('اتضافت الصورة');
    render();
  }catch(e){
    console.error(e);
    toast('فشل رفع الصورة — تأكد إن النت شغال');
  }
}

// drop several photos at once onto the batch zone — fills the empty slots in the fixed
// order (Frontal Rest, Frontal Smile, Profile, Frontal, Occlusal Upper, Occlusal Lower, Right, Left),
// skipping slots that already have a photo so you don't lose good shots while adding missing ones
async function handleBatchPhotoDrop(section, visitId, fileList){
  const files = Array.from(fileList || []).filter(f => f.type && f.type.indexOf('image/') === 0);
  if(!files.length){ toast('محتاج تسحب صور بس'); return; }
  const order = photoSlotOrderFor(section);
  const catsNeeded = [...new Set(order.map(s=>s.category))];
  const objByCat = {};
  for(const c of catsNeeded){
    objByCat[c] = getSlotsObj(section, visitId, c);
    if(!objByCat[c]){ toast('حصل خطأ، حاول تاني'); return; }
  }
  const emptySlots = order.filter(sl => !objByCat[sl.category][sl.id]);
  if(!emptySlots.length){ toast('كل الخانات مليانة بالفعل — امسح خانة الأول لو عايز تستبدلها'); return; }
  const toAssign = files.slice(0, emptySlots.length);

  toast('بيترفع الصور...');
  try{
    for(let i=0;i<toAssign.length;i++){
      await uploadOnePhotoSlot(section, visitId, emptySlots[i].category, emptySlots[i].id, toAssign[i]);
    }
    toast(files.length > emptySlots.length
      ? `اتوزعوا أول ${emptySlots.length} على الخانات الفاضية، والباقي اتجاهل`
      : 'اتوزعوا الصور على الخانات');
    render();
  }catch(e){
    console.error(e);
    toast('فشل رفع بعض الصور — تأكد إن النت شغال وحاول تاني');
    render();
  }
}

// swaps (or moves) two photos between slots — used for fixing a wrong auto-assignment by drag & drop
async function swapPhotoSlots(fromSection, fromVisit, fromCategory, fromSlot, toSection, toVisit, toCategory, toSlot){
  if(fromSection !== toSection || fromVisit !== toVisit){ toast('السحب متاح جوه نفس الزيارة/القسم بس'); return; }
  if(fromCategory === toCategory && fromSlot === toSlot) return;
  const pFile = state.currentPatientFile;
  const fromObj = getSlotsObj(fromSection, fromVisit, fromCategory);
  const toObj = getSlotsObj(toSection, toVisit, toCategory);
  if(!fromObj || !toObj) return;
  const a = fromObj[fromSlot];
  const b = toObj[toSlot];
  if(b) fromObj[fromSlot] = b; else delete fromObj[fromSlot];
  if(a) toObj[toSlot] = a; else delete toObj[toSlot];
  await savePatientFile(state.currentPatientId, stripHelperFields(pFile));
  render();
}

async function deletePhotoSlot(section, visitId, category, slotId){
  if(!(await confirmModal('حذف الصورة دي؟', {danger:true}))) return;
  const pFile = state.currentPatientFile;
  const slotsObj = getSlotsObj(section, visitId, category);
  if(!slotsObj || !slotsObj[slotId]) return;
  const old = slotsObj[slotId];
  delete slotsObj[slotId];
  await savePatientFile(state.currentPatientId, stripHelperFields(pFile));
  deletePhotoFromStorage(old.path);
  await logActivity('delete_photo', `حذف صورة (${section}/${category}/${slotId}) لمريض ${patientNameForLog()}`);
  toast('اتمسحت الصورة');
  render();
}

async function addDuringVisit(){
  const pFile = state.currentPatientFile;
  const photos = ensurePhotos(pFile);
  const dateStr = await promptModal('تاريخ الزيارة', defaultRecordDate(), {type:'date', label:'تاريخ الزيارة'});
  if(!dateStr) return;
  const visit = { id: uid(), date: dateStr, extraoral:{}, intraoral:{} };
  photos.during.push(visit);
  photos.during.sort((a,b) => (a.date < b.date ? -1 : 1));
  await savePatientFile(state.currentPatientId, stripHelperFields(pFile));
  state.photosActiveVisitId = visit.id;
  render();
}

async function editDuringVisitDate(visitId){
  const pFile = state.currentPatientFile;
  const photos = ensurePhotos(pFile);
  const v = photos.during.find(x=>x.id===visitId);
  if(!v) return;
  const newDate = await promptModal('تعديل تاريخ الزيارة', v.date, {type:'date', label:'تاريخ الزيارة'});
  if(!newDate || newDate === v.date) return;
  v.date = newDate;
  photos.during.sort((a,b) => (a.date < b.date ? -1 : 1));
  await savePatientFile(state.currentPatientId, stripHelperFields(pFile));
  toast('اتحدث تاريخ الزيارة');
  render();
}

async function deleteDuringVisit(visitId){
  if(!(await confirmModal('حذف الزيارة دي بكل صورها؟', {danger:true}))) return;
  const pFile = state.currentPatientFile;
  const photos = ensurePhotos(pFile);
  const v = photos.during.find(x=>x.id===visitId);
  if(!v) return;
  const allPaths = [...Object.values(v.extraoral||{}), ...Object.values(v.intraoral||{})].map(s=>s.path).filter(Boolean);
  photos.during = photos.during.filter(x=>x.id!==visitId);
  await savePatientFile(state.currentPatientId, stripHelperFields(pFile));
  allPaths.forEach(p => deletePhotoFromStorage(p));
  state.photosActiveVisitId = null;
  toast('اتمسحت الزيارة');
  render();
}

function photoSlotHtml(section, visitId, category, slot, slotsObj){
  const s = slotsObj ? slotsObj[slot.id] : null;
  const dropId = `${section}_${visitId||'main'}_${category}_${slot.id}`;
  return `
    <div class="photo-slot" data-photo-slot="${dropId}" data-section="${section}" data-visit="${visitId||''}" data-category="${category}" data-slot="${slot.id}">
      <div class="photo-slot-label">${escapeHtml(slot.label)}</div>
      ${s ? `
        <div class="photo-slot-thumb-wrap" draggable="true" data-photo-drag-source="${dropId}" style="position:relative;">
          <img src="${resolvePhotoUrl(s)}" class="photo-slot-thumb" data-lightbox="${resolvePhotoUrl(s)}" loading="lazy" decoding="async">
          <button class="photo-slot-del" data-del-photo="${dropId}">×</button>
          <button class="photo-slot-edit" data-edit-photo="${dropId}" title="تعديل (تدوير/قص)">✏️</button>
          <button class="photo-slot-social" data-social-photo="${dropId}" title="${s.social ? 'شيل من محتوى السوشيال' : 'يصلح لمحتوى السوشيال'}" style="position:absolute;bottom:4px;left:4px;background:${s.social ? '#f5a623' : 'rgba(0,0,0,.55)'};color:#fff;border:none;border-radius:50%;width:24px;height:24px;font-size:13px;cursor:pointer;line-height:24px;padding:0;z-index:2;">⭐</button>
        </div>
      ` : `<div class="photo-slot-empty">📷<br>اسحب صورة هنا<br>أو دوس للاختيار</div>`}
      <input type="file" accept="image/*" style="display:none;" data-photo-input="${dropId}">
    </div>
  `;
}

// toggles the "يصلح لمحتوى السوشيال" flag on a single photo slot — stores social:true and a
// socialFlaggedAt timestamp right on the slot object itself (so it travels with the photo in
// backups/exports), used by the Content Queue screen to sort each patient's flagged photos by
// when they were flagged.
async function toggleSocialFlag(section, visitId, category, slotId){
  const pFile = state.currentPatientFile;
  const slotsObj = getSlotsObj(section, visitId, category);
  if(!slotsObj || !slotsObj[slotId]) return;
  const s = slotsObj[slotId];
  if(s.social){
    delete s.social;
    delete s.socialFlaggedAt;
  } else {
    s.social = true;
    s.socialFlaggedAt = new Date().toISOString();
  }
  await savePatientFile(state.currentPatientId, stripHelperFields(pFile));
  render();
}

function photoSlotsGridHtml(section, visitId, slotsObj){
  const batchId = `${section}_${visitId||'main'}`;
  const withRecords = (section === 'before' || section === 'after');
  return `
    <div class="photo-batch-zone" data-photo-batch="${batchId}" data-section="${section}" data-visit="${visitId||''}">
      📥 اسحب كل صور الجلسة هنا مرة واحدة (هيتوزعوا بالترتيب: Frontal Rest ← Frontal Smile ← Profile ← Frontal ← Occlusal Upper ← Occlusal Lower ← Right ← Left${withRecords ? ' ← Occlusal Plan ← Lateral Ceph ← Panorama' : ''}) — أو دوس للاختيار
      <input type="file" accept="image/*" multiple style="display:none;" data-photo-batch-input="${batchId}">
    </div>
    <div class="photo-category-block">
      <div class="photo-category-title">Extraoral</div>
      <div class="photo-slots-grid">${PHOTO_EXTRAORAL_SLOTS.map(sl => photoSlotHtml(section, visitId, 'extraoral', sl, slotsObj.extraoral)).join('')}</div>
    </div>
    <div class="photo-category-block">
      <div class="photo-category-title">Intraoral</div>
      <div class="photo-slots-grid">${PHOTO_INTRAORAL_SLOTS.map(sl => photoSlotHtml(section, visitId, 'intraoral', sl, slotsObj.intraoral)).join('')}</div>
    </div>
    ${withRecords ? `
    <div class="photo-category-block">
      <div class="photo-category-title">Records</div>
      <div class="photo-slots-grid">${PHOTO_RECORDS_SLOTS.map(sl => photoSlotHtml(section, visitId, 'records', sl, slotsObj.records)).join('')}</div>
    </div>
    ` : ''}
    <div class="placeholder" style="padding:8px;margin-top:4px;font-size:12px;">ملحوظة: لو صورة وقعت في خانة غلط، اسحبها وحطها في الخانة الصح — هيتبادلوا مكان بعض تلقائي.</div>
  `;
}

function renderPhotosTab(){
  const file = state.currentPatientFile;
  const photos = ensurePhotos(file);
  if(!state.photosActiveSectionByPatient) state.photosActiveSectionByPatient = {};
  const sub = state.photosActiveSectionByPatient[state.currentPatientId] || 'before';
  const during = photos.during || [];
  if(!state.photosActiveVisitId && during.length) state.photosActiveVisitId = during[during.length-1].id;
  const activeVisit = during.find(v=>v.id===state.photosActiveVisitId);

  const countObj = (obj) => Object.values(obj || {}).filter(Boolean).length;
  const countSection = (section) => section ? countObj(section.extraoral)+countObj(section.intraoral)+countObj(section.records) : 0;
  const beforeCount = countSection(photos.before);
  const afterCount = countSection(photos.after);
  const duringCounts = during.map(v=>countSection(v));
  const duringTotal = duringCounts.reduce((a,b)=>a+b,0);
  const total = beforeCount + afterCount + duringTotal;
  const latest = during.length ? during[during.length-1] : null;
  const latestCount = latest ? countSection(latest) : 0;
  const expectedSlots = PHOTO_EXTRAORAL_SLOTS.length + PHOTO_INTRAORAL_SLOTS.length + PHOTO_RECORDS_SLOTS.length;
  const completion = Math.min(100, Math.round((total / Math.max(1, expectedSlots * (2 + during.length))) * 100));

  const allSlots = [
    ...PHOTO_EXTRAORAL_SLOTS.map(s=>({...s,category:'extraoral'})),
    ...PHOTO_INTRAORAL_SLOTS.map(s=>({...s,category:'intraoral'})),
    ...PHOTO_RECORDS_SLOTS.map(s=>({...s,category:'records'}))
  ];
  const cmpSlotKey = state.photosCompareSlot || (allSlots[0].category + ':' + allSlots[0].id);
  const [cmpCategory, cmpSlotId] = cmpSlotKey.split(':');
  const isRecordsCmp = cmpCategory === 'records';
  const beforePhoto = photos.before[cmpCategory] ? photos.before[cmpCategory][cmpSlotId] : null;
  const latestDuring = during.length ? during[during.length-1] : null;
  const rightLabel = isRecordsCmp ? 'بعد' : `آخر زيارة${latestDuring ? ' — ' + escapeHtml(latestDuring.date) : ''}`;
  const rightPhoto = isRecordsCmp
    ? (photos.after[cmpCategory] ? photos.after[cmpCategory][cmpSlotId] : null)
    : (latestDuring ? (latestDuring[cmpCategory] ? latestDuring[cmpCategory][cmpSlotId] : null) : null);
  const catLabel = {extraoral:'Extraoral', intraoral:'Intraoral', records:'Records'};

  const nav = (key, label, count, note) => `<button class="photo-nav-btn ${sub===key?'active':''}" data-photo-sub="${key}"><b>${label}</b><small>${count} صورة${note ? ' · '+note : ''}</small></button>`;

  return `
    <div class="photo-command">
      <div class="photo-hero">
        <div class="photo-eyebrow">CASE PHOTOGRAPHY</div>
        <div class="photo-hero-title">سجل الصور والتقدم</div>
        <div class="photo-hero-sub">من الـ records الأولية لحد آخر متابعة — كل الصور في Timeline واحد، مع مقارنة سريعة للتقدم.</div>
        <div class="photo-progress"><span style="width:${completion}%"></span></div>
        <div class="photo-section-meta" style="margin-top:7px;">اكتمال السجل التقريبي: ${completion}%</div>
      </div>
      <div class="photo-stat-grid">
        <div class="photo-stat-card"><div class="photo-stat-num">${beforeCount}</div><div class="photo-stat-label">قبل العلاج</div></div>
        <div class="photo-stat-card"><div class="photo-stat-num">${duringTotal}</div><div class="photo-stat-label">أثناء العلاج</div></div>
        <div class="photo-stat-card"><div class="photo-stat-num">${afterCount}</div><div class="photo-stat-label">بعد العلاج</div></div>
        <div class="photo-stat-card"><div class="photo-stat-num">${during.length}</div><div class="photo-stat-label">زيارات مصورة</div></div>
      </div>
    </div>

    <div class="photo-nav">
      ${nav('before','قبل العلاج',beforeCount,'records')}
      ${nav('during','أثناء العلاج',duringTotal,`${during.length} زيارة`)}
      ${nav('after','بعد العلاج',afterCount,'final records')}
      ${nav('compare','مقارنة',0,'قبل ↔ آخر')}
    </div>

    ${sub === 'before' ? `
      <div class="photo-section-head"><div><div class="photo-section-title">الـ Initial Records</div><div class="photo-section-meta">الصور الأساسية قبل بدء العلاج</div></div></div>
      ${photoSlotsGridHtml('before', null, photos.before)}
    ` : ''}

    ${sub === 'after' ? `
      <div class="photo-section-head"><div><div class="photo-section-title">النتيجة النهائية</div><div class="photo-section-meta">صور ما بعد العلاج / الـ retention</div></div></div>
      ${photoSlotsGridHtml('after', null, photos.after)}
    ` : ''}

    ${sub === 'during' ? `
      <div class="photo-timeline-wrap">
        <div class="photo-section-head">
          <div><div class="photo-section-title">Treatment Timeline</div><div class="photo-section-meta">اختار الزيارة لمراجعة صورها</div></div>
          <button class="secondary small" id="addVisitBtn">+ زيارة جديدة</button>
        </div>
        <div class="photo-timeline-scroll">
          ${during.length ? during.map(v => {
            const c=countSection(v);
            return `<button class="photo-visit-pill ${v.id===state.photosActiveVisitId?'active':''}" data-visit-pt="${v.id}"><div class="photo-visit-pill-date">${escapeHtml(v.date)}</div><div class="photo-visit-pill-count">${c} صورة</div></button>`;
          }).join('') : `<div class="placeholder" style="padding:12px;width:100%;">مفيش زيارات مصورة لسه — أضف أول زيارة.</div>`}
        </div>
      </div>
      ${activeVisit ? `
        <div class="photo-section-head">
          <div><div class="photo-section-title">زيارة ${escapeHtml(activeVisit.date)}</div><div class="photo-section-meta">${latest && activeVisit.id===latest.id ? 'آخر زيارة مسجلة' : 'زيارة أثناء العلاج'} · ${countSection(activeVisit)} صور</div></div>
          <div class="row" style="gap:6px;">
            <button class="secondary small" data-edit-visit-date="${activeVisit.id}">✎ تعديل التاريخ</button>
            <button class="danger small" data-del-visit="${activeVisit.id}">حذف</button>
          </div>
        </div>
        ${photoSlotsGridHtml('during', activeVisit.id, activeVisit)}
      ` : ''}
    ` : ''}

    ${sub === 'compare' ? renderPhotoCompareSubtab(photos, during, allSlots, catLabel, cmpSlotKey, cmpCategory, cmpSlotId, isRecordsCmp, beforePhoto, rightLabel, rightPhoto) : ''}
  `;
}

// "مقارنة" sub-tab body — two modes:
//  - beforeVsDuring (default): قبل مقابل آخر زيارة أثناء العلاج (أو بعد للـ Records) — زي ما كان
//  - duringVsDuring: زيارتين "أثناء العلاج" مع بعض، لمتابعة تقدم العلاج بين زيارة وزيارة
function renderPhotoCompareSubtab(photos, during, allSlots, catLabel, cmpSlotKey, cmpCategory, cmpSlotId, isRecordsCmp, beforePhoto, rightLabel, rightPhoto){
  const mode = state.photosCompareMode || 'beforeVsDuring';
  const modeToggleHtml = `
    <div class="photo-subtabs" style="margin-bottom:14px;">
      <button class="photo-subtab ${mode==='beforeVsDuring'?'active':''}" data-photo-cmp-mode="beforeVsDuring">قبل / أثناء</button>
      <button class="photo-subtab ${mode==='duringVsDuring'?'active':''}" data-photo-cmp-mode="duringVsDuring">بين زيارتين أثناء</button>
    </div>
  `;

  if(mode === 'duringVsDuring'){
    if(during.length < 2){
      return modeToggleHtml + `<div class="placeholder" style="padding:20px;">محتاج زيارتين "أثناء العلاج" على الأقل عشان تقارن بينهم</div>`;
    }
    const visitA = during.find(v=>v.id===state.photosCompareVisitA) || during[0];
    const visitB = during.find(v=>v.id===state.photosCompareVisitB) || during[during.length-1];
    const slotA = visitA[cmpCategory] ? visitA[cmpCategory][cmpSlotId] : null;
    const slotB = visitB[cmpCategory] ? visitB[cmpCategory][cmpSlotId] : null;
    return modeToggleHtml + `
      <div class="field" style="margin-bottom:14px;">
        <label>اختار الخانة</label>
        <select id="photoCompareSlotSelect">
          ${allSlots.filter(s=>s.category!=='records').map(s => `<option value="${s.category}:${s.id}" ${cmpSlotKey===(s.category+':'+s.id)?'selected':''}>${catLabel[s.category]} — ${escapeHtml(s.label)}</option>`).join('')}
        </select>
      </div>
      <div class="row" style="gap:10px;margin-bottom:14px;">
        <div class="field" style="flex:1;">
          <label>الزيارة الأولى</label>
          <select id="photoCompareVisitASelect">
            ${during.map(v => `<option value="${v.id}" ${v.id===visitA.id?'selected':''}>${escapeHtml(v.date)}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="flex:1;">
          <label>الزيارة التانية</label>
          <select id="photoCompareVisitBSelect">
            ${during.map(v => `<option value="${v.id}" ${v.id===visitB.id?'selected':''}>${escapeHtml(v.date)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="photo-compare-grid">
        <div class="photo-compare-col">
          <div class="photo-category-title">${escapeHtml(visitA.date)}</div>
          ${slotA ? `<img src="${resolvePhotoUrl(slotA)}" class="photo-compare-img" data-lightbox="${resolvePhotoUrl(slotA)}" loading="lazy" decoding="async">` : `<div class="placeholder" style="padding:20px;">مفيش صورة</div>`}
        </div>
        <div class="photo-compare-col">
          <div class="photo-category-title">${escapeHtml(visitB.date)}</div>
          ${slotB ? `<img src="${resolvePhotoUrl(slotB)}" class="photo-compare-img" data-lightbox="${resolvePhotoUrl(slotB)}" loading="lazy" decoding="async">` : `<div class="placeholder" style="padding:20px;">مفيش صورة</div>`}
        </div>
      </div>
    `;
  }

  return modeToggleHtml + `
    <div class="field" style="margin-bottom:14px;">
      <label>اختار الخانة</label>
      <select id="photoCompareSlotSelect">
        ${allSlots.map(s => `<option value="${s.category}:${s.id}" ${cmpSlotKey===(s.category+':'+s.id)?'selected':''}>${catLabel[s.category]} — ${escapeHtml(s.label)}</option>`).join('')}
      </select>
    </div>
    <div class="photo-compare-grid">
      <div class="photo-compare-col">
        <div class="photo-category-title">قبل</div>
        ${beforePhoto ? `<img src="${resolvePhotoUrl(beforePhoto)}" class="photo-compare-img" data-lightbox="${resolvePhotoUrl(beforePhoto)}" loading="lazy" decoding="async">` : `<div class="placeholder" style="padding:20px;">مفيش صورة</div>`}
      </div>
      <div class="photo-compare-col">
        <div class="photo-category-title">${rightLabel}</div>
        ${rightPhoto ? `<img src="${resolvePhotoUrl(rightPhoto)}" class="photo-compare-img" data-lightbox="${resolvePhotoUrl(rightPhoto)}" loading="lazy" decoding="async">` : `<div class="placeholder" style="padding:20px;">مفيش صورة</div>`}
      </div>
    </div>
  `;
}

// ============ PHOTO EDITOR (rotate + crop, re-uploads over the same storage path) ============
// Rotation is "baked" into a full-resolution offscreen canvas immediately on each rotate click,
// so the crop rectangle (drawn on the smaller on-screen preview) only ever needs a simple scale
// factor to map back to full-res coordinates — no combined rotate+crop math to get wrong.
const PHOTO_EDITOR_MAX_DISPLAY = 480;

function rotateCanvas90(srcCanvas){
  const out = document.createElement('canvas');
  out.width = srcCanvas.height;
  out.height = srcCanvas.width;
  const ctx = out.getContext('2d');
  ctx.translate(out.width/2, out.height/2);
  ctx.rotate(Math.PI/2);
  ctx.drawImage(srcCanvas, -srcCanvas.width/2, -srcCanvas.height/2);
  return out;
}

// mirrors the image left-right (same dimensions, just flipped) — useful when a photo was taken
// from a mirror or the wrong side and left/right need to swap
function flipCanvasHorizontal(srcCanvas){
  const out = document.createElement('canvas');
  out.width = srcCanvas.width;
  out.height = srcCanvas.height;
  const ctx = out.getContext('2d');
  ctx.translate(out.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(srcCanvas, 0, 0);
  return out;
}

async function openPhotoEditorModal(section, visitId, category, slotId){
  const slotsObj = getSlotsObj(section, visitId, category);
  const s = slotsObj ? slotsObj[slotId] : null;
  if(!s){ toast('مفيش صورة هنا'); return; }
  const srcUrl = resolvePhotoUrl(s);

  toast('بيحمّل الصورة...');
  let img;
  try{
    img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = srcUrl;
    });
  }catch(err){
    console.error('photo editor load failed', err);
    toast('تعذر تحميل الصورة للتعديل');
    return;
  }

  let working = document.createElement('canvas');
  working.width = img.naturalWidth;
  working.height = img.naturalHeight;
  working.getContext('2d').drawImage(img, 0, 0);

  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <h3>تعديل الصورة</h3>
      <div class="placeholder" style="padding:8px;margin-bottom:10px;">دوّر الصورة أو اعمل Flip لو محتاجة، وبعدين اسحب بالماوس على الصورة عشان تحدد جزء تقصّه (اختياري)</div>
      <div style="text-align:center;">
        <canvas id="photoEditCanvas" style="max-width:100%;border-radius:8px;cursor:crosshair;touch-action:none;"></canvas>
      </div>
      <div class="row" style="margin-top:12px;justify-content:center;gap:8px;">
        <button class="secondary small" id="photoEditRotateLeft">↺ تدوير يسار</button>
        <button class="secondary small" id="photoEditRotateRight">↻ تدوير يمين</button>
        <button class="secondary small" id="photoEditFlipH">⇋ Flip أفقي</button>
        <button class="secondary small" id="photoEditResetCrop">إلغاء القص</button>
      </div>
      <div class="modal-actions">
        <button class="secondary" id="photoEditCancelBtn">إلغاء</button>
        <button id="photoEditSaveBtn">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);

  const canvas = document.getElementById('photoEditCanvas');
  const ctx = canvas.getContext('2d');
  let cropRect = null; // in DISPLAY canvas coordinates
  let scale = 1;

  function redraw(){
    scale = Math.min(1, PHOTO_EDITOR_MAX_DISPLAY / Math.max(working.width, working.height));
    canvas.width = Math.round(working.width * scale);
    canvas.height = Math.round(working.height * scale);
    ctx.drawImage(working, 0, 0, canvas.width, canvas.height);
    if(cropRect){
      ctx.save();
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.setLineDash([6,4]);
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
      ctx.fillStyle = 'rgba(37,99,235,0.12)';
      ctx.fillRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
      ctx.restore();
    }
  }
  redraw();

  let dragStart = null;
  const getPos = (e) => {
    const r = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    return { x: Math.max(0, Math.min(canvas.width, cx * canvas.width / r.width)), y: Math.max(0, Math.min(canvas.height, cy * canvas.height / r.height)) };
  };
  const onDown = (e) => { e.preventDefault(); dragStart = getPos(e); cropRect = { x:dragStart.x, y:dragStart.y, w:0, h:0 }; };
  const onMove = (e) => {
    if(!dragStart) return;
    e.preventDefault();
    const p = getPos(e);
    cropRect = {
      x: Math.min(dragStart.x, p.x), y: Math.min(dragStart.y, p.y),
      w: Math.abs(p.x - dragStart.x), h: Math.abs(p.y - dragStart.y)
    };
    redraw();
  };
  const onUp = () => {
    dragStart = null;
    if(cropRect && (cropRect.w < 6 || cropRect.h < 6)) cropRect = null; // treat a tiny drag/click as "no crop"
    redraw();
  };
  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  canvas.addEventListener('touchstart', onDown, {passive:false});
  canvas.addEventListener('touchmove', onMove, {passive:false});
  canvas.addEventListener('touchend', onUp);

  const cleanup = () => {
    window.removeEventListener('mouseup', onUp);
    bg.remove();
  };
  document.getElementById('photoEditCancelBtn').onclick = cleanup;
  bg.onclick = (e) => { if(e.target === bg) cleanup(); };
  document.getElementById('photoEditRotateLeft').onclick = () => {
    working = rotateCanvas90(rotateCanvas90(rotateCanvas90(working))); // 3x90 = -90
    cropRect = null;
    redraw();
  };
  document.getElementById('photoEditRotateRight').onclick = () => {
    working = rotateCanvas90(working);
    cropRect = null;
    redraw();
  };
  document.getElementById('photoEditFlipH').onclick = () => {
    working = flipCanvasHorizontal(working);
    cropRect = null;
    redraw();
  };
  document.getElementById('photoEditResetCrop').onclick = () => { cropRect = null; redraw(); };

  document.getElementById('photoEditSaveBtn').onclick = async () => {
    let finalCanvas = working;
    if(cropRect && cropRect.w > 0 && cropRect.h > 0){
      const sx = Math.round(cropRect.x / scale), sy = Math.round(cropRect.y / scale);
      const sw = Math.round(cropRect.w / scale), sh = Math.round(cropRect.h / scale);
      finalCanvas = document.createElement('canvas');
      finalCanvas.width = sw; finalCanvas.height = sh;
      finalCanvas.getContext('2d').drawImage(working, sx, sy, sw, sh, 0, 0, sw, sh);
    }
    toast('بيحفظ...');
    try{
      const blob = await new Promise(resolve => finalCanvas.toBlob(resolve, 'image/jpeg', 0.88));
      if(!blob) throw new Error('canvas toBlob failed (possibly a CORS-tainted canvas)');
      const url = await uploadPhotoToStorage(blob, s.path);
      delete state.photoUrlCache[s.path]; // force a fresh signed URL for the updated bytes
      slotsObj[slotId] = { path: s.path, url, uploadedAt: new Date().toISOString() };
      await savePatientFile(state.currentPatientId, stripHelperFields(state.currentPatientFile));
      cleanup();
      toast('اتحفظ التعديل');
      render();
    }catch(err){
      console.error('photo edit save failed', err);
      toast('فشل حفظ التعديل — جرب تاني');
    }
  };
}

// gallery lightbox: shows one photo at a time out of `urls`, starting at `startIndex`.
// Supports: click-arrow, keyboard left/right, touch swipe to change photo — plus zoom:
// mouse wheel / pinch to zoom, double-click / double-tap to toggle 2.5x, and drag-to-pan once
// zoomed in. Swiping to the next/previous photo only fires at 1x zoom (moving a zoomed-in
// photo around takes priority over navigating away from it); zoom always resets when the
// photo changes.
function openLightbox(urls, startIndex){
  urls = (urls || []).filter(Boolean);
  if(!urls.length) return;
  let idx = ((startIndex||0) % urls.length + urls.length) % urls.length;

  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="lightbox-wrap" style="position:relative;max-width:92vw;max-height:92vh;touch-action:none;overflow:hidden;">
      <img id="lightboxImg" src="${urls[idx]}" style="max-width:92vw;max-height:92vh;border-radius:8px;display:block;user-select:none;-webkit-user-drag:none;touch-action:none;transform-origin:center center;">
      ${urls.length > 1 ? `
        <button id="lightboxPrevBtn" style="position:absolute;top:50%;left:10px;transform:translateY(-50%);background:rgba(0,0,0,.45);color:#fff;border:none;width:42px;height:42px;border-radius:50%;font-size:24px;line-height:1;cursor:pointer;">‹</button>
        <button id="lightboxNextBtn" style="position:absolute;top:50%;right:10px;transform:translateY(-50%);background:rgba(0,0,0,.45);color:#fff;border:none;width:42px;height:42px;border-radius:50%;font-size:24px;line-height:1;cursor:pointer;">›</button>
        <div id="lightboxCounter" style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.5);color:#fff;padding:3px 10px;border-radius:14px;font-size:12px;">${idx+1} / ${urls.length}</div>
      ` : ''}
      <div style="position:absolute;bottom:8px;right:8px;display:flex;gap:6px;">
        <button id="lightboxZoomOutBtn" title="تصغير" style="background:rgba(0,0,0,.45);color:#fff;border:none;width:30px;height:30px;border-radius:50%;font-size:16px;line-height:1;cursor:pointer;">−</button>
        <button id="lightboxZoomResetBtn" title="إعادة الضبط" style="background:rgba(0,0,0,.45);color:#fff;border:none;width:30px;height:30px;border-radius:50%;font-size:13px;line-height:1;cursor:pointer;">⟲</button>
        <button id="lightboxZoomInBtn" title="تكبير" style="background:rgba(0,0,0,.45);color:#fff;border:none;width:30px;height:30px;border-radius:50%;font-size:16px;line-height:1;cursor:pointer;">+</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);

  const imgEl = document.getElementById('lightboxImg');
  const counterEl = document.getElementById('lightboxCounter');

  // ---- zoom/pan state ----
  const MAX_SCALE = 4;
  let scale = 1, tx = 0, ty = 0;
  function applyTransform(withTransition){
    imgEl.style.transition = withTransition ? 'transform .2s ease' : 'none';
    imgEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    imgEl.style.cursor = scale > 1 ? 'grab' : 'zoom-in';
  }
  function resetZoom(withTransition){
    scale = 1; tx = 0; ty = 0;
    applyTransform(withTransition);
  }
  // keeps whatever image content is under (clientX, clientY) fixed on screen while the scale
  // changes by `factor` — the standard "zoom toward cursor/pinch-midpoint" formula
  function zoomAt(clientX, clientY, factor, withTransition){
    const rect = imgEl.getBoundingClientRect();
    const offsetX = clientX - (rect.left + rect.width / 2);
    const offsetY = clientY - (rect.top + rect.height / 2);
    const newScale = Math.min(MAX_SCALE, Math.max(1, scale * factor));
    const actualFactor = newScale / scale;
    tx = tx + offsetX * (1 - actualFactor);
    ty = ty + offsetY * (1 - actualFactor);
    scale = newScale;
    if(scale === 1){ tx = 0; ty = 0; }
    applyTransform(withTransition);
  }

  function show(newIdx){
    idx = ((newIdx % urls.length) + urls.length) % urls.length;
    imgEl.src = urls[idx];
    if(counterEl) counterEl.textContent = `${idx+1} / ${urls.length}`;
    resetZoom(false);
  }

  const winMouseMove = (e) => {
    if(!mouseDragging) return;
    tx = mouseDragStart.tx0 + (e.clientX - mouseDragStart.x);
    ty = mouseDragStart.ty0 + (e.clientY - mouseDragStart.y);
    applyTransform(false);
  };
  const winMouseUp = () => {
    if(mouseDragging){ mouseDragging = false; imgEl.style.cursor = scale > 1 ? 'grab' : 'zoom-in'; }
  };
  window.addEventListener('mousemove', winMouseMove);
  window.addEventListener('mouseup', winMouseUp);

  function cleanup(){
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('mousemove', winMouseMove);
    window.removeEventListener('mouseup', winMouseUp);
    bg.remove();
  }
  function onKey(e){
    if(e.key === 'Escape') cleanup();
    else if(e.key === 'ArrowLeft') show(idx+1);
    else if(e.key === 'ArrowRight') show(idx-1);
  }
  document.addEventListener('keydown', onKey);

  bg.onclick = (e) => { if(e.target === bg) cleanup(); };
  const prevBtn = document.getElementById('lightboxPrevBtn');
  const nextBtn = document.getElementById('lightboxNextBtn');
  if(prevBtn) prevBtn.onclick = (e) => { e.stopPropagation(); show(idx-1); };
  if(nextBtn) nextBtn.onclick = (e) => { e.stopPropagation(); show(idx+1); };

  document.getElementById('lightboxZoomInBtn').onclick = (e) => {
    e.stopPropagation();
    const rect = imgEl.getBoundingClientRect();
    zoomAt(rect.left + rect.width/2, rect.top + rect.height/2, 1.5, true);
  };
  document.getElementById('lightboxZoomOutBtn').onclick = (e) => {
    e.stopPropagation();
    const rect = imgEl.getBoundingClientRect();
    zoomAt(rect.left + rect.width/2, rect.top + rect.height/2, 1/1.5, true);
  };
  document.getElementById('lightboxZoomResetBtn').onclick = (e) => {
    e.stopPropagation();
    resetZoom(true);
  };

  // mouse: wheel to zoom toward the cursor, double-click to toggle 2.5x, drag to pan once zoomed
  imgEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.2 : 1/1.2, false);
  }, {passive:false});
  imgEl.addEventListener('dblclick', (e) => {
    e.preventDefault();
    if(scale > 1) resetZoom(true);
    else zoomAt(e.clientX, e.clientY, 2.5, true);
  });
  let mouseDragging = false, mouseDragStart = null;
  imgEl.addEventListener('mousedown', (e) => {
    if(scale <= 1) return;
    e.preventDefault();
    mouseDragging = true;
    mouseDragStart = { x: e.clientX, y: e.clientY, tx0: tx, ty0: ty };
    imgEl.style.cursor = 'grabbing';
  });

  // touch: one finger swipes to the next/previous photo at 1x, or pans once zoomed in;
  // two fingers pinch-zoom; a quick double-tap toggles 2.5x, same as double-click
  let touchStartX = null, touchStartY = null;
  let panStart = null;
  let pinchStartDist = null;
  let lastTapTime = 0, lastTapPos = null;
  const touchDist = (t0, t1) => Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
  const touchMid = (t0, t1) => ({ x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 });

  bg.addEventListener('touchstart', (e) => {
    if(e.touches.length === 2){
      pinchStartDist = touchDist(e.touches[0], e.touches[1]);
      touchStartX = null;
      panStart = null;
      return;
    }
    if(e.touches.length !== 1) return;
    const t = e.touches[0];
    const now = Date.now();
    if(lastTapPos && (now - lastTapTime) < 300 && Math.hypot(t.clientX - lastTapPos.x, t.clientY - lastTapPos.y) < 30){
      lastTapTime = 0; lastTapPos = null;
      touchStartX = null;
      if(scale > 1) resetZoom(true);
      else zoomAt(t.clientX, t.clientY, 2.5, true);
      return;
    }
    lastTapTime = now; lastTapPos = { x: t.clientX, y: t.clientY };
    if(scale > 1){
      panStart = { x: t.clientX, y: t.clientY, tx0: tx, ty0: ty };
      touchStartX = null;
    } else {
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      panStart = null;
    }
  }, {passive:true});

  bg.addEventListener('touchmove', (e) => {
    if(e.touches.length === 2 && pinchStartDist){
      e.preventDefault();
      const dist = touchDist(e.touches[0], e.touches[1]);
      const mid = touchMid(e.touches[0], e.touches[1]);
      zoomAt(mid.x, mid.y, dist / pinchStartDist, false);
      pinchStartDist = dist;
      return;
    }
    if(e.touches.length === 1 && panStart){
      e.preventDefault();
      const t = e.touches[0];
      tx = panStart.tx0 + (t.clientX - panStart.x);
      ty = panStart.ty0 + (t.clientY - panStart.y);
      applyTransform(false);
    }
  }, {passive:false});

  bg.addEventListener('touchend', (e) => {
    if(e.touches.length >= 1){
      // dropped from two fingers to one — stop pinching, start a fresh pan if still zoomed
      pinchStartDist = null;
      if(scale > 1){
        const t = e.touches[0];
        panStart = { x: t.clientX, y: t.clientY, tx0: tx, ty0: ty };
      }
      return;
    }
    pinchStartDist = null;
    if(panStart){ panStart = null; return; }
    if(touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    touchStartX = null; touchStartY = null;
    if(Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return; // not a real horizontal swipe
    show(dx < 0 ? idx+1 : idx-1);
  }, {passive:true});

  applyTransform(false);
}


// collects the urls of every photo thumbnail currently rendered in the open tab (in DOM order)
// and opens the lightbox positioned at whichever one was clicked, so swipe/arrows can reach them all
function openLightboxFromClick(clickedEl){
  const all = Array.from(document.querySelectorAll('.photo-slot-thumb, .photo-compare-img'));
  const urls = all.map(el => el.dataset.lightbox || el.src);
  const idx = all.indexOf(clickedEl);
  openLightbox(urls, idx < 0 ? 0 : idx);
}

function attachPhotosHandlers(){
  document.querySelectorAll('[data-photo-sub]').forEach(el=>{
    el.onclick = () => {
      if(!state.photosActiveSectionByPatient) state.photosActiveSectionByPatient = {};
      state.photosActiveSectionByPatient[state.currentPatientId] = el.dataset.photoSub;
      render();
    };
  });
  document.querySelectorAll('[data-visit-pt]').forEach(el=>{
    el.onclick = () => { state.photosActiveVisitId = el.dataset.visitPt; render(); };
  });
  const addVisitBtn = document.getElementById('addVisitBtn');
  if(addVisitBtn) addVisitBtn.onclick = () => addDuringVisit();
  document.querySelectorAll('[data-del-visit]').forEach(el=>{
    el.onclick = () => deleteDuringVisit(el.dataset.delVisit);
  });
  document.querySelectorAll('[data-edit-visit-date]').forEach(el=>{
    el.onclick = () => editDuringVisitDate(el.dataset.editVisitDate);
  });
  const cmpSelect = document.getElementById('photoCompareSlotSelect');
  if(cmpSelect) cmpSelect.onchange = () => { state.photosCompareSlot = cmpSelect.value; render(); };
  document.querySelectorAll('[data-photo-cmp-mode]').forEach(el=>{
    el.onclick = () => { state.photosCompareMode = el.dataset.photoCmpMode; render(); };
  });
  const cmpVisitA = document.getElementById('photoCompareVisitASelect');
  if(cmpVisitA) cmpVisitA.onchange = () => { state.photosCompareVisitA = cmpVisitA.value; render(); };
  const cmpVisitB = document.getElementById('photoCompareVisitBSelect');
  if(cmpVisitB) cmpVisitB.onchange = () => { state.photosCompareVisitB = cmpVisitB.value; render(); };
  document.querySelectorAll('[data-del-photo]').forEach(el=>{
    el.onclick = (e) => {
      e.stopPropagation();
      const wrap = el.closest('[data-photo-slot]');
      deletePhotoSlot(wrap.dataset.section, wrap.dataset.visit, wrap.dataset.category, wrap.dataset.slot);
    };
  });
  document.querySelectorAll('[data-edit-photo]').forEach(el=>{
    el.onclick = (e) => {
      e.stopPropagation();
      const wrap = el.closest('[data-photo-slot]');
      openPhotoEditorModal(wrap.dataset.section, wrap.dataset.visit, wrap.dataset.category, wrap.dataset.slot);
    };
  });
  document.querySelectorAll('[data-social-photo]').forEach(el=>{
    el.onclick = (e) => {
      e.stopPropagation();
      const wrap = el.closest('[data-photo-slot]');
      toggleSocialFlag(wrap.dataset.section, wrap.dataset.visit, wrap.dataset.category, wrap.dataset.slot);
    };
  });
  document.querySelectorAll('.photo-slot-thumb, .photo-compare-img').forEach(el=>{
    el.onclick = (e) => { e.stopPropagation(); openLightboxFromClick(el); };
  });
  document.querySelectorAll('[data-photo-slot]').forEach(wrap=>{
    const section = wrap.dataset.section, visit = wrap.dataset.visit, category = wrap.dataset.category, slot = wrap.dataset.slot;
    const input = wrap.querySelector('[data-photo-input]');
    wrap.onclick = (e) => {
      if(e.target.closest('[data-del-photo]') || e.target.classList.contains('photo-slot-thumb')) return;
      input.click();
    };
    input.onchange = () => { if(input.files[0]) handlePhotoDrop(section, visit, category, slot, input.files[0]); input.value=''; };
    wrap.ondragover = (e) => { e.preventDefault(); wrap.classList.add('drag-over'); };
    wrap.ondragleave = () => wrap.classList.remove('drag-over');
    wrap.ondrop = (e) => {
      e.preventDefault();
      wrap.classList.remove('drag-over');
      // an internal drag from another slot (fixing a wrong assignment) takes priority over a fresh file drop
      const srcId = e.dataTransfer.getData('application/x-photo-slot');
      if(srcId){
        const src = document.querySelector(`[data-photo-drag-source="${srcId}"]`)?.closest('[data-photo-slot]');
        if(src){
          swapPhotoSlots(src.dataset.section, src.dataset.visit, src.dataset.category, src.dataset.slot, section, visit, category, slot);
          return;
        }
      }
      if(e.dataTransfer.files[0]) handlePhotoDrop(section, visit, category, slot, e.dataTransfer.files[0]);
    };
  });
  document.querySelectorAll('[data-photo-drag-source]').forEach(thumb=>{
    thumb.ondragstart = (e) => { e.dataTransfer.setData('application/x-photo-slot', thumb.dataset.photoDragSource); };
  });
  document.querySelectorAll('[data-photo-batch]').forEach(zone=>{
    const section = zone.dataset.section, visit = zone.dataset.visit;
    const input = zone.querySelector('[data-photo-batch-input]');
    zone.onclick = () => input.click();
    input.onchange = () => { if(input.files.length) handleBatchPhotoDrop(section, visit, input.files); input.value=''; };
    zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('drag-over'); };
    zone.ondragleave = () => zone.classList.remove('drag-over');
    zone.ondrop = (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if(e.dataTransfer.files.length) handleBatchPhotoDrop(section, visit, e.dataTransfer.files);
    };
  });
}


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
