// photo-editor.js — محرر الصور (تدوير + قص)
// اتنقل من photos-tab.js كما هو بدون أي تغيير في السلوك (تقسيم ملف كبير). لازم يتحمّل بـ <script> بعد
// photos-tab.js في index.html.

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
