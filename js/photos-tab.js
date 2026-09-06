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
  const dateStr = await promptModal('تاريخ الزيارة', todayStr(), {type:'date', label:'تاريخ الزيارة'});
  if(!dateStr) return;
  const visit = { id: uid(), date: dateStr, extraoral:{}, intraoral:{} };
  photos.during.push(visit);
  photos.during.sort((a,b) => (a.date < b.date ? -1 : 1));
  await savePatientFile(state.currentPatientId, stripHelperFields(pFile));
  state.photosActiveVisitId = visit.id;
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
        <div class="photo-slot-thumb-wrap" draggable="true" data-photo-drag-source="${dropId}">
          <img src="${resolvePhotoUrl(s)}" class="photo-slot-thumb" data-lightbox="${resolvePhotoUrl(s)}" loading="lazy" decoding="async">
          <button class="photo-slot-del" data-del-photo="${dropId}">×</button>
          <button class="photo-slot-edit" data-edit-photo="${dropId}" title="تعديل (تدوير/قص)">✏️</button>
        </div>
      ` : `<div class="photo-slot-empty">📷<br>اسحب صورة هنا<br>أو دوس للاختيار</div>`}
      <input type="file" accept="image/*" style="display:none;" data-photo-input="${dropId}">
    </div>
  `;
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
  const sub = state.photosActiveSection || 'before';
  const during = photos.during || [];
  if(!state.photosActiveVisitId && during.length) state.photosActiveVisitId = during[during.length-1].id;
  const activeVisit = during.find(v=>v.id===state.photosActiveVisitId);

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
  // records (X-rays/occlusal plan) are only taken at start/end, so compare "before" vs "after" for
  // those; everything else compares "before" vs the most recent "during" visit for progress tracking
  const rightLabel = isRecordsCmp ? 'بعد' : `آخر زيارة${latestDuring ? ' — ' + escapeHtml(latestDuring.date) : ''}`;
  const rightPhoto = isRecordsCmp
    ? (photos.after[cmpCategory] ? photos.after[cmpCategory][cmpSlotId] : null)
    : (latestDuring ? (latestDuring[cmpCategory] ? latestDuring[cmpCategory][cmpSlotId] : null) : null);
  const catLabel = {extraoral:'Extraoral', intraoral:'Intraoral', records:'Records'};

  return `
    <div class="photo-subtabs">
      <button class="photo-subtab ${sub==='before'?'active':''}" data-photo-sub="before">قبل</button>
      <button class="photo-subtab ${sub==='during'?'active':''}" data-photo-sub="during">أثناء العلاج</button>
      <button class="photo-subtab ${sub==='after'?'active':''}" data-photo-sub="after">بعد</button>
      <button class="photo-subtab ${sub==='compare'?'active':''}" data-photo-sub="compare">مقارنة</button>
    </div>

    ${sub === 'before' ? photoSlotsGridHtml('before', null, photos.before) : ''}
    ${sub === 'after' ? photoSlotsGridHtml('after', null, photos.after) : ''}

    ${sub === 'during' ? `
      <div class="photo-timeline">
        ${during.length ? during.map(v => `<button class="photo-timeline-pt ${v.id===state.photosActiveVisitId?'active':''}" data-visit-pt="${v.id}">${escapeHtml(v.date)}</button>`).join('') : `<div class="placeholder" style="padding:8px;">مفيش زيارات لسه — دوس "+ زيارة جديدة"</div>`}
        <button class="secondary small" id="addVisitBtn">+ زيارة جديدة</button>
      </div>
      ${activeVisit ? `
        <div class="row" style="justify-content:space-between;align-items:center;margin:10px 0;">
          <div class="lbl" style="margin:0;">زيارة ${escapeHtml(activeVisit.date)}</div>
          <button class="danger small" data-del-visit="${activeVisit.id}">حذف الزيارة دي</button>
        </div>
        ${photoSlotsGridHtml('during', activeVisit.id, activeVisit)}
      ` : ''}
    ` : ''}

    ${sub === 'compare' ? `
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
    ` : ''}
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
// Supports: click-arrow, keyboard left/right, and touch swipe — so you can flip through
// every photo currently visible in the open tab (before/during/after/compare) without
// closing and reopening the viewer for each one.
function openLightbox(urls, startIndex){
  urls = (urls || []).filter(Boolean);
  if(!urls.length) return;
  let idx = ((startIndex||0) % urls.length + urls.length) % urls.length;

  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="lightbox-wrap" style="position:relative;max-width:92vw;max-height:92vh;touch-action:pan-y;">
      <img id="lightboxImg" src="${urls[idx]}" style="max-width:92vw;max-height:92vh;border-radius:8px;display:block;user-select:none;-webkit-user-drag:none;">
      ${urls.length > 1 ? `
        <button id="lightboxPrevBtn" style="position:absolute;top:50%;left:10px;transform:translateY(-50%);background:rgba(0,0,0,.45);color:#fff;border:none;width:42px;height:42px;border-radius:50%;font-size:24px;line-height:1;cursor:pointer;">‹</button>
        <button id="lightboxNextBtn" style="position:absolute;top:50%;right:10px;transform:translateY(-50%);background:rgba(0,0,0,.45);color:#fff;border:none;width:42px;height:42px;border-radius:50%;font-size:24px;line-height:1;cursor:pointer;">›</button>
        <div id="lightboxCounter" style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.5);color:#fff;padding:3px 10px;border-radius:14px;font-size:12px;">${idx+1} / ${urls.length}</div>
      ` : ''}
    </div>
  `;
  document.body.appendChild(bg);

  const imgEl = document.getElementById('lightboxImg');
  const counterEl = document.getElementById('lightboxCounter');
  function show(newIdx){
    idx = ((newIdx % urls.length) + urls.length) % urls.length;
    imgEl.src = urls[idx];
    if(counterEl) counterEl.textContent = `${idx+1} / ${urls.length}`;
  }

  function cleanup(){
    document.removeEventListener('keydown', onKey);
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

  // swipe: left = next photo, right = previous photo
  let touchStartX = null, touchStartY = null;
  bg.addEventListener('touchstart', (e) => {
    if(e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, {passive:true});
  bg.addEventListener('touchend', (e) => {
    if(touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    touchStartX = null; touchStartY = null;
    if(Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return; // not a real horizontal swipe
    show(dx < 0 ? idx+1 : idx-1);
  }, {passive:true});
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
    el.onclick = () => { state.photosActiveSection = el.dataset.photoSub; render(); };
  });
  document.querySelectorAll('[data-visit-pt]').forEach(el=>{
    el.onclick = () => { state.photosActiveVisitId = el.dataset.visitPt; render(); };
  });
  const addVisitBtn = document.getElementById('addVisitBtn');
  if(addVisitBtn) addVisitBtn.onclick = () => addDuringVisit();
  document.querySelectorAll('[data-del-visit]').forEach(el=>{
    el.onclick = () => deleteDuringVisit(el.dataset.delVisit);
  });
  const cmpSelect = document.getElementById('photoCompareSlotSelect');
  if(cmpSelect) cmpSelect.onchange = () => { state.photosCompareSlot = cmpSelect.value; render(); };
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

