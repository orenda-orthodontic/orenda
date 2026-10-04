// photo-lightbox.js — عارض الصور (lightbox: تكبير، سحب، سوايب)
// اتنقل من photos-tab.js كما هو بدون أي تغيير في السلوك (تقسيم ملف كبير). لازم يتحمّل بـ <script> بعد
// photos-tab.js في index.html.

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

  const BTN = 'background:transparent;color:#fff;border:none;min-width:30px;height:30px;border-radius:50%;font-size:16px;line-height:1;cursor:pointer;';
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="lightbox-wrap" style="position:relative;max-width:92vw;max-height:92vh;touch-action:none;overflow:hidden;">
      <img id="lightboxImg" src="${urls[idx]}" style="max-width:92vw;max-height:92vh;border-radius:8px;display:block;user-select:none;-webkit-user-drag:none;touch-action:none;transform-origin:center center;">
      <div id="lightboxLayer" style="position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;transform-origin:center center;">
        <canvas id="lightboxCanvas" style="position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;touch-action:none;"></canvas>
        <div id="lbProtractor" style="position:absolute;display:none;touch-action:none;cursor:move;outline:1px dashed rgba(255,149,0,.9);filter:drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 1.5px #fff);">
          <img id="lbProtractorImg" alt="" draggable="false" style="width:100%;height:100%;display:block;pointer-events:none;user-select:none;-webkit-user-drag:none;">
          <div id="lbProtHandle" title="اسحب لتكبير/تصغير المنقلة" style="position:absolute;left:calc(100% + 22px);top:90.49%;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:#ff9500;border:2px solid #fff;cursor:nwse-resize;touch-action:none;color:#fff;font-size:16px;line-height:30px;text-align:center;user-select:none;">⤢</div>
          <div id="lbProtRotHandle" title="اسحب لتدوير المنقلة" style="position:absolute;left:50%;top:calc(0% - 22px);width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:#30d158;border:2px solid #fff;cursor:grab;touch-action:none;color:#fff;font-size:16px;line-height:30px;text-align:center;user-select:none;">↻</div>
        </div>
      </div>
      <div id="lightboxBars" style="position:absolute;top:8px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;max-width:96%;">
        <div id="lightboxDrawBar" style="display:flex;flex-wrap:wrap;justify-content:center;gap:4px;align-items:center;background:rgba(0,0,0,.45);padding:4px 8px;border-radius:20px;">
          <button id="lbPenBtn" title="قلم (رسم حر)" style="${BTN}">✏️</button>
          <button id="lbRulerBtn" title="مسطرة (خط مستقيم + زاويته عن الأفقي)" style="${BTN}">📏</button>
          <button id="lbAngleBtn" title="قياس زاوية: 3 نقاط (طرف، رأس الزاوية، طرف)" style="${BTN}font-size:15px;font-weight:700;">∠</button>
          <button id="lbEraseBtn" title="ممحاة: اضغط أو اسحب على الخط عشان تمسحه" style="${BTN}">🧽</button>
          <button id="lbProtBtn" title="منقلة" style="${BTN}">📐</button>
          <button id="lbColorBtn" title="اللون" style="background:#ff3b30;border:2px solid #fff;width:22px;height:22px;border-radius:50%;cursor:pointer;padding:0;"></button>
          <button id="lbUndoBtn" title="تراجع" style="${BTN}">↶</button>
          <button id="lbClearBtn" title="مسح كل الخطوط" style="${BTN}font-size:15px;">🗑</button>
          <button id="lbLabelsBtn" title="إظهار/إخفاء أرقام الزوايا" style="${BTN}font-size:15px;font-weight:700;">°</button>
          <button id="lbDownloadBtn" title="تنزيل الصورة بالعلامات" style="${BTN}">💾</button>
          <button id="lbShareBtn" title="مشاركة الصورة بالعلامات (واتساب...)" style="${BTN}display:none;">📤</button>
        </div>
        <div id="lbProtBar" style="display:none;gap:6px;align-items:center;background:rgba(0,0,0,.45);padding:4px 8px;border-radius:20px;color:#fff;font-size:12px;white-space:nowrap;">
          <span>منقلة:</span>
          <button id="lbProtSmaller" title="تصغير" style="${BTN}font-size:18px;">−</button>
          <button id="lbProtBigger" title="تكبير" style="${BTN}font-size:18px;">+</button>
          <button id="lbProtRotL" title="تدوير يسار" style="${BTN}">↺</button>
          <button id="lbProtRotR" title="تدوير يمين" style="${BTN}">↻</button>
          <button id="lbProtClose" title="إخفاء المنقلة" style="${BTN}font-size:14px;">✕</button>
        </div>
      </div>
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
  const canvasEl = document.getElementById('lightboxCanvas');
  const layerEl = document.getElementById('lightboxLayer');
  const counterEl = document.getElementById('lightboxCounter');

  // ---- zoom/pan state ----
  const MAX_SCALE = 4;
  let scale = 1, tx = 0, ty = 0;
  function applyTransform(withTransition){
    imgEl.style.transition = withTransition ? 'transform .2s ease' : 'none';
    imgEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    layerEl.style.transition = imgEl.style.transition;
    layerEl.style.transform = imgEl.style.transform;
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
    cancelCurrentStroke();
    if(typeof clearCanvasOnly === 'function') clearCanvasOnly();
    loadMarksForCurrent();
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
    window.removeEventListener('resize', layoutCanvas);
    lbAnnotFlush(); // حفظ فوري عند القفل
    lbRemoteSync(); // ومزامنة مع ملف المريض من غير ما نستنى الـ debounce
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
  const onWheelZoom = (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.2 : 1/1.2, false);
  };
  imgEl.addEventListener('wheel', onWheelZoom, {passive:false});
  canvasEl.addEventListener('wheel', onWheelZoom, {passive:false});
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
    if(activeTool || protractorBusy) return; // الرسم/تحريك المنقلة شغال: اللمس للرسم مش للسوايب/الزووم
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
    if(activeTool || protractorBusy) return;
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
    if(activeTool || protractorBusy) return;
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

  // ================= أدوات الرسم: قلم / مسطرة / زاوية / ممحاة =================
  // الإحداثيات متخزنة نسبية (0-1) بالنسبة لحجم الصورة فبتتظبط مع الزووم والسحب.
  // الخطوط وشكل المنقلة بتتحفظ لكل صورة (بمسارها في الـ Storage مش بالـ signed URL اللي بيتغير):
  //   - في المتصفح ده (localStorage) فبتفضل بعد قفل الصورة والـ Refresh
  //   - وفي ملف المريض (photoMarks) فبتظهر على باقي الأجهزة كمان
  const LB_COLORS = ['#ff3b30', '#0a84ff', '#ffd60a', '#30d158'];
  let colorIdx = 0;
  let activeTool = null;          // null | 'pen' | 'ruler' | 'angle' | 'erase'
  let curStroke = null;           // قلم/مسطرة تحت الرسم
  let curAngle = null;            // { pts:[...], hover, color } — زاوية لسه بتتحدد (3 نقاط)
  let angleDragging = false;
  let erasing = false, eraseGroup = [];
  let drawPointerId = null;
  let showLabels = true;
  try{ showLabels = localStorage.getItem('lbShowAngleLabels') !== '0'; }catch(_){}
  const undoStacks = {};          // key -> [op]  (في الذاكرة بس، طول ما العارض مفتوح)

  const currentKey = () => lbAnnotKey(urls[idx]);
  const annNow = () => lbAnnotGet(currentKey());
  const strokesNow = () => annNow().strokes;
  const marksChanged = () => lbAnnotChanged(currentKey());
  function pushUndo(op){
    const k = currentKey();
    const st = (undoStacks[k] = undoStacks[k] || []);
    st.push(op);
    if(st.length > 60) st.shift();
  }

  function layoutCanvas(){
    const w = imgEl.clientWidth, h = imgEl.clientHeight;
    if(!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = Math.round(w * dpr);
    canvasEl.height = Math.round(h * dpr);
    redrawCanvas();
    layoutProtractor();
  }
  function clearCanvasOnly(){
    canvasEl.getContext('2d').clearRect(0, 0, canvasEl.width, canvasEl.height);
  }
  function redrawCanvas(){
    const ctx = canvasEl.getContext('2d');
    const W = canvasEl.width, H = canvasEl.height;
    ctx.clearRect(0, 0, W, H);
    strokesNow().forEach(st => lbDrawStroke(ctx, st, W, H, showLabels));
    if(curStroke) lbDrawStroke(ctx, curStroke, W, H, showLabels);
    if(curAngle) lbDrawAnglePartial(ctx, curAngle, W, H);
  }
  function cancelCurrentStroke(){
    curStroke = null; curAngle = null; angleDragging = false; erasing = false; eraseGroup = []; drawPointerId = null;
  }

  // client coords -> normalized image coords (canvas rect already includes zoom/pan transform)
  function normPos(e){
    const r = canvasEl.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  }

  const TOOL_BTN = { pen: 'lbPenBtn', ruler: 'lbRulerBtn', angle: 'lbAngleBtn', erase: 'lbEraseBtn' };
  function setTool(tool){
    activeTool = (activeTool === tool) ? null : tool;
    cancelCurrentStroke();
    // أي حركة لمس/سوايب كانت شغالة تتلغي عشان متتداخلش مع الرسم
    touchStartX = null; touchStartY = null; panStart = null; pinchStartDist = null;
    canvasEl.style.pointerEvents = activeTool ? 'auto' : 'none';
    canvasEl.style.cursor = activeTool === 'erase' ? 'cell' : (activeTool ? 'crosshair' : '');
    updateProtractorPointer();
    Object.keys(TOOL_BTN).forEach(t => {
      document.getElementById(TOOL_BTN[t]).style.background = activeTool === t ? 'rgba(255,255,255,.35)' : 'transparent';
    });
    redrawCanvas();
  }

  // الممحاة: بتمسح أقرب خط تحت الإصبع/الماوس (ضغطة أو سحب فوق أكتر من خط)
  function eraseAt(p){
    const W = canvasEl.width, H = canvasEl.height;
    const thr = 14 * (window.devicePixelRatio || 1) / scale;
    const strokes = strokesNow();
    for(let i = strokes.length - 1; i >= 0; i--){
      if(lbStrokeDist(strokes[i], p[0] * W, p[1] * H, W, H) <= thr){
        eraseGroup.push({ st: strokes[i], index: i });
        strokes.splice(i, 1);
        redrawCanvas();
        return;
      }
    }
  }

  canvasEl.addEventListener('pointerdown', (e) => {
    if(!activeTool) return;
    e.preventDefault();
    e.stopPropagation();
    drawPointerId = e.pointerId;
    try{ canvasEl.setPointerCapture(e.pointerId); }catch(_){}
    const p = normPos(e);
    const color = LB_COLORS[colorIdx];
    if(activeTool === 'angle'){
      if(!curAngle) curAngle = { pts: [], hover: null, color };
      curAngle.pts.push(p);
      curAngle.hover = null;
      angleDragging = true;   // السحب بعد الضغطة بيظبط مكان النقطة قبل ما تسيب
      redrawCanvas();
      return;
    }
    if(activeTool === 'erase'){
      erasing = true; eraseGroup = [];
      eraseAt(p);
      return;
    }
    curStroke = activeTool === 'ruler'
      ? { type: 'ruler', color, p0: p, p1: p }
      : { type: 'pen', color, pts: [p] };
    redrawCanvas();
  });
  canvasEl.addEventListener('pointermove', (e) => {
    if(!activeTool) return;
    const p = normPos(e);
    if(activeTool === 'angle'){
      if(!curAngle) return;
      if(angleDragging && e.pointerId === drawPointerId) curAngle.pts[curAngle.pts.length - 1] = p;
      else curAngle.hover = p;
      redrawCanvas();
      return;
    }
    if(activeTool === 'erase'){
      if(erasing && e.pointerId === drawPointerId){ e.preventDefault(); eraseAt(p); }
      return;
    }
    if(!curStroke || e.pointerId !== drawPointerId) return;
    e.preventDefault();
    if(curStroke.type === 'ruler') curStroke.p1 = p; else curStroke.pts.push(p);
    redrawCanvas();
  });
  const endStroke = (e) => {
    if(e.pointerId !== drawPointerId) return;
    if(activeTool === 'angle'){
      angleDragging = false; drawPointerId = null;
      if(curAngle && curAngle.pts.length >= 3){
        const st = { type: 'angle', color: curAngle.color, pts: curAngle.pts.slice(0, 3).map(pt => pt.map(lbRound4)) };
        curAngle = null;
        strokesNow().push(st);
        pushUndo({ op: 'add', st });
        marksChanged();
      }
      redrawCanvas();
      return;
    }
    if(activeTool === 'erase'){
      if(erasing){
        erasing = false; drawPointerId = null;
        if(eraseGroup.length){ pushUndo({ op: 'del', items: eraseGroup }); marksChanged(); }
        eraseGroup = [];
      }
      return;
    }
    if(!curStroke) return;
    const st = curStroke;
    cancelCurrentStroke();
    // لمسة/كليك بدون سحب في المسطرة مش بيتحسب خط
    const tiny = st.type === 'ruler' && Math.hypot(st.p1[0] - st.p0[0], st.p1[1] - st.p0[1]) < 0.005;
    if(!tiny){
      if(st.type === 'ruler'){ st.p0 = st.p0.map(lbRound4); st.p1 = st.p1.map(lbRound4); }
      else st.pts = lbSimplify(st.pts, 0.0015).map(pt => pt.map(lbRound4));
      strokesNow().push(st);
      pushUndo({ op: 'add', st });
      marksChanged();
    }
    redrawCanvas();
  };
  canvasEl.addEventListener('pointerup', endStroke);
  canvasEl.addEventListener('pointercancel', endStroke);

  function doUndo(){
    if(curAngle && curAngle.pts.length){            // زاوية لسه بتتحدد: شيل آخر نقطة
      curAngle.pts.pop();
      if(!curAngle.pts.length) curAngle = null;
      redrawCanvas();
      return;
    }
    const stack = undoStacks[currentKey()] || [];
    const op = stack.pop();
    const strokes = strokesNow();
    if(!op){
      if(!strokes.length) return;
      strokes.pop();                                // مفيش سجل (صورة اتفتحت من جديد): آخر خط
    } else if(op.op === 'add'){
      const i = strokes.indexOf(op.st);
      if(i >= 0) strokes.splice(i, 1);
    } else if(op.op === 'del'){
      for(let k = op.items.length - 1; k >= 0; k--){
        strokes.splice(Math.min(op.items[k].index, strokes.length), 0, op.items[k].st);
      }
    } else if(op.op === 'clear'){
      annNow().strokes = op.strokes;
    }
    marksChanged();
    redrawCanvas();
  }

  document.getElementById('lbPenBtn').onclick = (e) => { e.stopPropagation(); setTool('pen'); };
  document.getElementById('lbRulerBtn').onclick = (e) => { e.stopPropagation(); setTool('ruler'); };
  document.getElementById('lbAngleBtn').onclick = (e) => { e.stopPropagation(); setTool('angle'); };
  document.getElementById('lbEraseBtn').onclick = (e) => { e.stopPropagation(); setTool('erase'); };
  document.getElementById('lbColorBtn').onclick = (e) => {
    e.stopPropagation();
    colorIdx = (colorIdx + 1) % LB_COLORS.length;
    e.currentTarget.style.background = LB_COLORS[colorIdx];
  };
  document.getElementById('lbUndoBtn').onclick = (e) => { e.stopPropagation(); doUndo(); };
  document.getElementById('lbClearBtn').onclick = (e) => {
    e.stopPropagation();
    if(!strokesNow().length) return;
    if(!confirm('تمسح كل الخطوط على الصورة دي؟')) return;
    pushUndo({ op: 'clear', strokes: annNow().strokes });
    annNow().strokes = [];
    marksChanged();
    redrawCanvas();
  };
  const labelsBtn = document.getElementById('lbLabelsBtn');
  const paintLabelsBtn = () => { labelsBtn.style.background = showLabels ? 'rgba(255,255,255,.35)' : 'transparent'; };
  labelsBtn.onclick = (e) => {
    e.stopPropagation();
    showLabels = !showLabels;
    try{ localStorage.setItem('lbShowAngleLabels', showLabels ? '1' : '0'); }catch(_){}
    paintLabelsBtn();
    redrawCanvas();
  };
  paintLabelsBtn();

  // ================= المنقلة (Protractor) =================
  // اسحبها من أي مكان عشان تحركها. الدايرة البرتقالي (برة طرف الخط الأفقي) للتكبير/التصغير بس،
  // والخضرا (فوق) للتدوير بس. نقطة الأصل (الدايرة الصغيرة في نص الخط الأفقي) هي رأس الزاوية.
  const PROT_RATIO = LB_PROT_RATIO;                 // height / width للصورة
  const PROT_HANDLE_OFFSET = 22;                    // بُعد دوايِر التحكم عن حدود المنقلة (بكسل) — عشان ما تغطيش الأرقام
  const PROT_ORIGIN_Y = LB_PROT_ORIGIN_Y;           // مكان نقطة الأصل رأسيًا داخل الصورة
  const prot = { on: false, x: 0.5, y: 0.7, w: 0.5, rot: 0 };   // x,y نسبية لحجم الصورة، w = عرض المنقلة نسبة لعرض الصورة
  let protractorBusy = false;
  const protEl = document.getElementById('lbProtractor');
  const protHandle = document.getElementById('lbProtHandle');
  const protBar = document.getElementById('lbProtBar');
  document.getElementById('lbProtractorImg').src = LB_PROTRACTOR_SRC;

  function layoutProtractor(){
    const W = imgEl.clientWidth, H = imgEl.clientHeight;
    if(!W || !H) return;
    const wPx = prot.w * W;
    protEl.style.width = wPx + 'px';
    protEl.style.height = (wPx * PROT_RATIO) + 'px';
    protEl.style.left = (prot.x * W) + 'px';
    protEl.style.top = (prot.y * H) + 'px';
    protEl.style.transformOrigin = `50% ${PROT_ORIGIN_Y * 100}%`;
    protEl.style.transform = `translate(-50%, -${PROT_ORIGIN_Y * 100}%) rotate(${prot.rot}deg)`;
  }
  function updateProtractorPointer(){
    protEl.style.pointerEvents = (prot.on && !activeTool) ? 'auto' : 'none';
  }
  function setProtractor(on, silent){
    prot.on = on;
    protEl.style.display = on ? 'block' : 'none';
    protBar.style.display = on ? 'flex' : 'none';
    document.getElementById('lbProtBtn').style.background = on ? 'rgba(255,255,255,.35)' : 'transparent';
    updateProtractorPointer();
    layoutProtractor();
    if(!silent) persistProt();
  }
  function persistProt(){
    annNow().prot = { on: prot.on, x: lbRound4(prot.x), y: lbRound4(prot.y), w: lbRound4(prot.w), rot: Math.round(prot.rot * 10) / 10 };
    marksChanged();
  }
  function protChanged(){ layoutProtractor(); persistProt(); }
  // بيرجّع المنقلة لآخر وضع اتحفظ للصورة الحالية (أو الوضع الافتراضي لو أول مرة)
  function loadProtForCurrent(){
    const saved = annNow().prot;
    Object.assign(prot, saved || { on: false, x: 0.5, y: 0.7, w: 0.5, rot: 0 });
    setProtractor(!!prot.on, true);
  }
  // بيجيب علامات الصورة الحالية (ويدمج النسخة اللي على ملف المريض لو أحدث) وبيرجّع المنقلة لمكانها
  function loadMarksForCurrent(){
    lbAnnotMergeRemote(currentKey());
    loadProtForCurrent();
  }
  const clampProtW = (w) => Math.min(3, Math.max(0.05, w));

  // تحريك المنقلة
  let protDrag = null;
  protEl.addEventListener('pointerdown', (e) => {
    if(e.target === protHandle || e.target.id === 'lbProtRotHandle') return;
    e.preventDefault(); e.stopPropagation();
    protractorBusy = true;
    const r = layerEl.getBoundingClientRect();
    protDrag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x0: prot.x, y0: prot.y, rw: r.width, rh: r.height };
    try{ protEl.setPointerCapture(e.pointerId); }catch(_){}
  });
  protEl.addEventListener('pointermove', (e) => {
    if(!protDrag || e.pointerId !== protDrag.id) return;
    e.preventDefault();
    prot.x = Math.min(1, Math.max(0, protDrag.x0 + (e.clientX - protDrag.sx) / protDrag.rw));
    prot.y = Math.min(1, Math.max(0, protDrag.y0 + (e.clientY - protDrag.sy) / protDrag.rh));
    protChanged();
  });
  const endProtDrag = (e) => { if(protDrag && e.pointerId === protDrag.id){ protDrag = null; protractorBusy = false; } };
  protEl.addEventListener('pointerup', endProtDrag);
  protEl.addEventListener('pointercancel', endProtDrag);

  function protVectorFromOrigin(e){
    const r = layerEl.getBoundingClientRect();
    const zoomF = r.width / (imgEl.clientWidth || 1);
    const ox = r.left + prot.x * r.width, oy = r.top + prot.y * r.height;
    return { vx: e.clientX - ox, vy: e.clientY - oy, zoomF };
  }
  function bindProtHandle(handleEl, onMove){
    let dragId = null;
    handleEl.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      protractorBusy = true;
      dragId = e.pointerId;
      try{ handleEl.setPointerCapture(e.pointerId); }catch(_){}
    });
    handleEl.addEventListener('pointermove', (e) => {
      if(dragId === null || e.pointerId !== dragId) return;
      e.preventDefault();
      onMove(protVectorFromOrigin(e));
      protChanged();
    });
    const end = (e) => { if(dragId !== null && e.pointerId === dragId){ dragId = null; protractorBusy = false; } };
    handleEl.addEventListener('pointerup', end);
    handleEl.addEventListener('pointercancel', end);
  }
  bindProtHandle(protHandle, (v) => {
    // الدايرة برة طرف المنقلة بـ PROT_HANDLE_OFFSET بكسل، فبنطرحه من المسافة
    const distLayer = Math.hypot(v.vx, v.vy) / v.zoomF;
    prot.w = clampProtW((2 * (distLayer - PROT_HANDLE_OFFSET)) / (imgEl.clientWidth || 1));
  });
  bindProtHandle(document.getElementById('lbProtRotHandle'), (v) => {
    prot.rot = Math.atan2(v.vy, v.vx) * 180 / Math.PI + 90;
  });

  // عجلة الماوس فوق المنقلة = تكبير/تصغير المنقلة (مش الصورة)
  protEl.addEventListener('wheel', (e) => {
    e.preventDefault(); e.stopPropagation();
    prot.w = clampProtW(prot.w * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
    protChanged();
  }, { passive: false });

  document.getElementById('lbProtBtn').onclick = (e) => { e.stopPropagation(); setProtractor(!prot.on); };
  document.getElementById('lbProtClose').onclick = (e) => { e.stopPropagation(); setProtractor(false); };
  document.getElementById('lbProtBigger').onclick = (e) => { e.stopPropagation(); prot.w = clampProtW(prot.w * 1.1); protChanged(); };
  document.getElementById('lbProtSmaller').onclick = (e) => { e.stopPropagation(); prot.w = clampProtW(prot.w / 1.1); protChanged(); };
  document.getElementById('lbProtRotL').onclick = (e) => { e.stopPropagation(); prot.rot -= 2; protChanged(); };
  document.getElementById('lbProtRotR').onclick = (e) => { e.stopPropagation(); prot.rot += 2; protChanged(); };

  // ================= تصدير الصورة بالعلامات (تنزيل / مشاركة) =================
  // بيرسم الصورة بدقتها الأصلية + كل الخطوط وأرقام الزوايا + المنقلة (لو ظاهرة) في صورة JPEG جديدة.
  // الصورة الأصلية على السيرفر ماتتغيرش.
  async function renderMarkedBlob(){
    const img = await lbLoadImage(urls[idx], true);
    let W = img.naturalWidth, H = img.naturalHeight;
    const k = Math.min(1, 4000 / Math.max(W, H));       // سقف الحجم عشان موبايلات قديمة
    W = Math.round(W * k); H = Math.round(H * k);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, W, H);
    strokesNow().forEach(st => lbDrawStroke(ctx, st, W, H, showLabels));
    if(prot.on){
      const pimg = await lbLoadImage(LB_PROTRACTOR_SRC, false);
      lbDrawProtractor(ctx, prot, W, H, pimg);
    }
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.92));
    if(!blob) throw new Error('toBlob failed');
    return blob;
  }
  function markedFileName(){
    const seg = currentKey().split('/').pop() || 'photo';
    const base = seg.replace(/-[A-Za-z0-9]+\.jpe?g$/i, '').replace(/\.jpe?g$/i, '');
    return `marked-${base || 'photo'}.jpg`;
  }
  const say = (m) => { if(typeof toast === 'function') toast(m); };
  async function exportMarked(share){
    say('بيجهز الصورة...');
    try{
      const blob = await renderMarkedBlob();
      const name = markedFileName();
      if(share){
        const file = new File([blob], name, { type: 'image/jpeg' });
        if(navigator.canShare && navigator.canShare({ files: [file] })){
          try{ await navigator.share({ files: [file] }); }catch(err){ if(!err || err.name !== 'AbortError') throw err; }
          return;
        }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    }catch(err){
      console.error('export marked photo failed', err);
      say('تعذر تجهيز الصورة بالعلامات');
    }
  }
  document.getElementById('lbDownloadBtn').onclick = (e) => { e.stopPropagation(); exportMarked(false); };
  const shareBtn = document.getElementById('lbShareBtn');
  shareBtn.onclick = (e) => { e.stopPropagation(); exportMarked(true); };
  try{
    const probe = new File([new Blob(['x'], { type: 'image/jpeg' })], 'a.jpg', { type: 'image/jpeg' });
    if(navigator.canShare && navigator.canShare({ files: [probe] })) shareBtn.style.display = '';
  }catch(_){}

  loadMarksForCurrent();
  imgEl.addEventListener('load', layoutCanvas);
  window.addEventListener('resize', layoutCanvas);
  if(imgEl.complete) layoutCanvas();

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



// صورة المنقلة (PNG شفاف، متضغوطة) — مدمجة هنا عشان مفيش ملف صور إضافي يترفع
const LB_PROTRACTOR_SRC = 'data:image/png;base64,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XNe2fbQ+3jbAq64hTUGnne5TcO09uz/G4NpaFXIXXOujD0tzS/Z/7+OvAu+IIa/LruzW81+Oxo15OVOgbgyB6TaZa22Alwdq/psOr+lLdR/3ommMNuf3fM1GCaK3d+9jN9jYoWLKiVT9YvQR0hr+vR8ucEw1CV5pNFlqNUxB2Ua1GtoA71zQZywDpadGF0tgmWcPB/fHyHd/Ltno6TWX59ETKPoIrxC5lvLvo4+dqDAlwt6fY87wOB5z89zs8dkyLbDtJ0lZ66MR8IYdX5lPPmkNY7+f6eqMBS7er8fPxert3fuIzjORbWLZx5+lvMM7VCTnnY8Xaaegojms056qWgHvlEDvwa7OX6mtMM7LKZLTCW8fsR2+ywx9RJH3ta9PBqsyq4WQlj2NvANFM+AdP/tW11rabTSSyHvfkPZpoXAPrfURAd5eAqePKJ5chsfbwt77JPmeAUtaAq/ZKVCN4sc96vl+v25TjvWMwu/u4e2jA28fBchrWv/cHtO4gVv/fD/wFuxR63+HsVvS49Fb//TRgbePUugdEj+CaGOTEMLZgNdcGa+te2813EcH3j7KIaWgvTvXYmmdI6XQ36TxUl2zPnX66MDbx6HTaldYSdAmpZ8ceGf4fTy6zNtHB94+DhoqUkzsTwHvlPvXM9f66MDbxzHDNKWWJv1ry/+inGkdePvowNtHHx4o+lkH+itqNXTg7aMDbx/fOXhYVhBfUJ2sA28fHXj7+NYpFZ5T8vz1eIsxNjw68PbRgbeP45QGFvk9bbPL07saOvD20YG3j4NGrNME+73A+wyPdwfePiKDi14Tso+jgJfOUXYu4P0XHR14++ijj09KDfr3Mt4OvH300cdnh44wW3ElbKl6JuCdWv+MddD90YG3jz76OGjwcKscRt2W8kTAOzZX666GPvro44NDhHIlNG3q2qmkhqn2+a4RXffx9tFHH8dS3qtUbKW9nJmkYcISZecC3qk9nV8PpwNvH330ceCwGgtLKe3Gl78TeI3Y4PcA7cDbRx99HMp5xb44mSAtyXuyBIpJbHheOvD20Ucfn4Re1bQc7+mAdxg7MrtiQwfePvro43js1UqJn6GUpu/+c76ea4NpSecA7/3+7MDbRx99/JZxvp5rESLcb1UfffTRgbcZ8naU7aOPPjrw9tFHH3300YG3jz766KMDbx999NFHHx14++ijjz468PbRRx999NGBt48++uijA28fffTRRwfePvroo48+OvD20UcffXTg7aOPPvroowNvH3300UcH3j766KOPPjrw9tFHH3104O2jjz766MDbRx999NFHB94++uijjw68ffTRRx99dODto48++ujA20cfffTRRwfePvroo48OvH300UcfHXj76KOPPvrowNtHH3300YG3jz766KOPDrx99NFHHx14++ijjz766MDbRx999NGBt48++uijA28fffTRRx8dePvoo48+OvD20UcfffTRgbePPvroowNvH3300UcfHXj76KOPPjrw9tFHH30cMnjxYMVDB4bswNtHH59c0KTLXhcPVToEcEh/7H8THtffOjrw/pEFzWg37cYLumKNQ5Z9xbj20cfhwNt82X9giX9g8fYF3UcfHXj7ou+jjz6+bdAyH0E58nyPd+Dto4+PY0HLNT6N4rNkhUbVWvv+biHxPxGXVCgTRs2GAAAAAElFTkSuQmCC';

// ================= ثوابت المنقلة (مشتركة بين العارض والتصدير) =================
const LB_PROT_RATIO = 773 / 1400;      // height / width لصورة المنقلة
const LB_PROT_ORIGIN_Y = 0.9049;       // مكان نقطة الأصل رأسيًا داخل صورة المنقلة (999/1104)

// ================= رسم الخطوط (بيتستخدم في العارض وفي تصدير الصورة بالعلامات) =================
// W/H = أبعاد الكانفس اللي بنرسم عليه. كل المقاسات (سمك الخط، حجم الخط) نسبة لـ W فبتطلع
// نفس الشكل على الشاشة وفي الصورة المصدّرة بدقتها الأصلية.
function lbDrawLabel(ctx, text, x, y, W){
  const fs = Math.max(12, Math.round(W / 38));
  ctx.save();
  ctx.font = `700 ${fs}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, fs / 4);
  ctx.strokeStyle = 'rgba(0,0,0,.8)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, x, y);
  ctx.restore();
  return fs;
}
// ميل الخط عن الأفقي بالدرجات (موجب = طالع لليمين)
function lbTiltDeg(x0, y0, x1, y1){
  let a = Math.atan2(-(y1 - y0), x1 - x0) * 180 / Math.PI;
  if(a > 90) a -= 180;
  if(a <= -90) a += 180;
  return a;
}
function lbDrawStroke(ctx, st, W, H, labels){
  ctx.save();
  ctx.strokeStyle = st.color;
  ctx.fillStyle = st.color;
  ctx.lineWidth = Math.max(2, W / 260);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if(st.type === 'ruler'){
    const x0 = st.p0[0] * W, y0 = st.p0[1] * H, x1 = st.p1[0] * W, y1 = st.p1[1] * H;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const len = Math.hypot(x1 - x0, y1 - y0);
    if(labels && len > W * 0.03){
      const a = lbTiltDeg(x0, y0, x1, y1);
      const txt = `${a >= 0 ? '↗' : '↘'} ${Math.abs(a).toFixed(1)}°`;
      let nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
      if(ny > 0){ nx = -nx; ny = -ny; }                 // العلامة دايمًا فوق الخط
      const off = Math.max(12, W / 38) * 0.9;
      lbDrawLabel(ctx, txt, (x0 + x1) / 2 + nx * off, (y0 + y1) / 2 + ny * off, W);
    }
  } else if(st.type === 'angle'){
    const A = [st.pts[0][0] * W, st.pts[0][1] * H];
    const B = [st.pts[1][0] * W, st.pts[1][1] * H];
    const C = [st.pts[2][0] * W, st.pts[2][1] * H];
    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.stroke();
    [A, B, C].forEach(pt => { ctx.beginPath(); ctx.arc(pt[0], pt[1], ctx.lineWidth * 1.3, 0, Math.PI * 2); ctx.fill(); });
    const v1 = [A[0] - B[0], A[1] - B[1]], v2 = [C[0] - B[0], C[1] - B[1]];
    const l1 = Math.hypot(v1[0], v1[1]), l2 = Math.hypot(v2[0], v2[1]);
    if(l1 > 0 && l2 > 0){
      const ang = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)))) * 180 / Math.PI;
      const a1 = Math.atan2(v1[1], v1[0]), a2 = Math.atan2(v2[1], v2[0]);
      let diff = a2 - a1;
      while(diff > Math.PI) diff -= 2 * Math.PI;
      while(diff <= -Math.PI) diff += 2 * Math.PI;
      const r = Math.min(Math.min(l1, l2) * 0.4, W * 0.06);
      ctx.beginPath(); ctx.arc(B[0], B[1], r, a1, a1 + diff, diff < 0); ctx.stroke();
      if(labels){
        const mid = a1 + diff / 2;
        const fs = Math.max(12, Math.round(W / 38));
        const d = r + fs * 1.1;
        lbDrawLabel(ctx, `${ang.toFixed(1)}°`, B[0] + Math.cos(mid) * d, B[1] + Math.sin(mid) * d, W);
      }
    }
  } else {
    ctx.beginPath();
    st.pts.forEach((pt, i) => { if(i === 0) ctx.moveTo(pt[0] * W, pt[1] * H); else ctx.lineTo(pt[0] * W, pt[1] * H); });
    if(st.pts.length === 1) ctx.lineTo(st.pts[0][0] * W + 0.1, st.pts[0][1] * H);
    ctx.stroke();
  }
  ctx.restore();
}
// زاوية لسه بتتحدد: النقط اللي اتحطت + خط متقطع لحد مكان الماوس
function lbDrawAnglePartial(ctx, cur, W, H){
  ctx.save();
  ctx.strokeStyle = cur.color; ctx.fillStyle = cur.color;
  ctx.lineWidth = Math.max(2, W / 260);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const pts = cur.pts.map(pt => [pt[0] * W, pt[1] * H]);
  if(pts.length > 1){
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for(let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  if(cur.hover && pts.length){
    ctx.setLineDash([ctx.lineWidth * 3, ctx.lineWidth * 3]);
    ctx.beginPath(); ctx.moveTo(pts[pts.length - 1][0], pts[pts.length - 1][1]); ctx.lineTo(cur.hover[0] * W, cur.hover[1] * H); ctx.stroke();
    ctx.setLineDash([]);
  }
  pts.forEach(pt => { ctx.beginPath(); ctx.arc(pt[0], pt[1], ctx.lineWidth * 1.6, 0, Math.PI * 2); ctx.fill(); });
  ctx.restore();
}
function lbDrawProtractor(ctx, prot, W, H, pimg){
  const w = prot.w * W, h = w * LB_PROT_RATIO;
  ctx.save();
  ctx.translate(prot.x * W, prot.y * H);
  ctx.rotate(prot.rot * Math.PI / 180);
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = Math.max(2, W / 600);
  ctx.drawImage(pimg, -w / 2, -LB_PROT_ORIGIN_Y * h, w, h);
  ctx.drawImage(pimg, -w / 2, -LB_PROT_ORIGIN_Y * h, w, h);   // مرتين عشان الهالة البيضا تبان
  ctx.restore();
}
function lbLoadImage(src, cors){
  return new Promise((resolve, reject) => {
    const im = new Image();
    if(cors) im.crossOrigin = 'anonymous';
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

// ================= مسافات + تبسيط (للممحاة وتقليل حجم الخط الحر) =================
function lbPtSegDist(px, py, x0, y0, x1, y1){
  const dx = x1 - x0, dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x0) * dx + (py - y0) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}
function lbStrokeDist(st, px, py, W, H){
  const pts = st.type === 'ruler' ? [st.p0, st.p1] : st.pts;
  if(!pts || !pts.length) return Infinity;
  if(pts.length === 1) return Math.hypot(px - pts[0][0] * W, py - pts[0][1] * H);
  let best = Infinity;
  for(let i = 1; i < pts.length; i++){
    best = Math.min(best, lbPtSegDist(px, py, pts[i - 1][0] * W, pts[i - 1][1] * H, pts[i][0] * W, pts[i][1] * H));
  }
  return best;
}
// Ramer–Douglas–Peucker: بيشيل النقط الزيادة من الخط الحر من غير ما الشكل يتغير (النقط نسبية 0-1)
function lbSimplify(pts, eps){
  if(pts.length < 3) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while(stack.length){
    const [a, b] = stack.pop();
    let maxD = 0, mi = -1;
    for(let i = a + 1; i < b; i++){
      const d = lbPtSegDist(pts[i][0], pts[i][1], pts[a][0], pts[a][1], pts[b][0], pts[b][1]);
      if(d > maxD){ maxD = d; mi = i; }
    }
    if(maxD > eps && mi > 0){ keep[mi] = true; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// ================= تخزين العلامات: المتصفح (localStorage) + ملف المريض (photoMarks) =================
// كل صورة ليها: { strokes:[...], prot:{...}|null, t: وقت آخر تعديل }.
// - localStorage: بيفضل بعد القفل والـ Refresh على نفس الجهاز.
// - ملف المريض (file.photoMarks[مسار الصورة]): بيتزامن بين الأجهزة. وقت التعديل (t) هو اللي بيحدد
//   النسخة الأحدث لما الاتنين يختلفوا. المسح بيسيب "شاهد" فاضي بوقته عشان المسح نفسه يتزامن.
const LB_ANNOT_LS_KEY = 'lbAnnotations:v1';
let LB_ANNOT_STORE = null;
let lbAnnotTimer = null, lbSyncTimer = null;
let lbSyncBusy = false, lbSyncAgain = false;
const lbDirtyKeys = new Set();
const lbRound4 = (n) => Math.round(n * 10000) / 10000;
const lbClone = (o) => JSON.parse(JSON.stringify(o));

function lbAnnotLoadAll(){
  if(LB_ANNOT_STORE) return LB_ANNOT_STORE;
  try{ LB_ANNOT_STORE = JSON.parse(localStorage.getItem(LB_ANNOT_LS_KEY) || '{}') || {}; }
  catch(e){ LB_ANNOT_STORE = {}; }
  return LB_ANNOT_STORE;
}
// مفتاح ثابت للصورة: مسارها جوه bucket الصور (الـ signed URL بيتغير كل ساعة فمينفعش يتستخدم)
function lbAnnotKey(url){
  try{
    const pn = new URL(url, location.href).pathname;
    const marker = '/patient-photos/';
    const i = pn.indexOf(marker);
    return decodeURIComponent(i >= 0 ? pn.slice(i + marker.length) : pn);
  }catch(e){ return String(url).split('?')[0]; }
}
function lbAnnotGet(key){
  const all = lbAnnotLoadAll();
  const a = all[key] || (all[key] = { strokes: [], prot: null, t: 0 });
  if(!Array.isArray(a.strokes)) a.strokes = [];
  if(!a.t) a.t = 0;
  return a;
}
function lbAnnotFlush(){
  clearTimeout(lbAnnotTimer);
  try{
    const all = lbAnnotLoadAll();
    Object.keys(all).forEach(k => { const a = all[k]; if(!a.t && !(a.strokes && a.strokes.length) && !a.prot) delete all[k]; });
    localStorage.setItem(LB_ANNOT_LS_KEY, JSON.stringify(all));
  }catch(e){ console.error('annotations save failed', e); }
}
function lbAnnotSaveSoon(){
  clearTimeout(lbAnnotTimer);
  lbAnnotTimer = setTimeout(lbAnnotFlush, 250);
  clearTimeout(lbSyncTimer);
  lbSyncTimer = setTimeout(lbRemoteSync, 1500);
}
// أي تعديل على علامات صورة: بيحدّث وقت التعديل، ويحفظ محليًا، ويجدول المزامنة مع ملف المريض
function lbAnnotChanged(key){
  lbAnnotGet(key).t = Date.now();
  lbDirtyKeys.add(key);
  lbAnnotSaveSoon();
}
function lbCanSync(key){
  return typeof state !== 'undefined' && state && state.currentPatientFile && state.currentPatientId
    && String(key).split('/')[0] === String(state.currentPatientId)
    && typeof setData === 'function';
}
// بيتنده عليها وقت فتح الصورة: لو النسخة اللي على ملف المريض أحدث، بنستخدمها؛ ولو اللي عندنا أحدث بنرفعها
function lbAnnotMergeRemote(key){
  if(!lbCanSync(key)) return;
  const remote = state.currentPatientFile.photoMarks && state.currentPatientFile.photoMarks[key];
  const local = lbAnnotGet(key);
  const rt = remote ? (remote.t || 0) : 0, lt = local.t || 0;
  if(remote && rt > lt){
    local.strokes = lbClone(remote.strokes || []);
    local.prot = remote.prot ? lbClone(remote.prot) : null;
    local.t = rt;
    lbAnnotSaveSoon();
  } else if(lt > rt){
    lbDirtyKeys.add(key);
    lbAnnotSaveSoon();
  }
}
async function lbRemoteSync(){
  clearTimeout(lbSyncTimer);
  if(lbSyncBusy){ lbSyncAgain = true; return; }
  const keys = Array.from(lbDirtyKeys).filter(lbCanSync);
  if(!keys.length) return;
  lbSyncBusy = true;
  const file = state.currentPatientFile;
  try{
    file.photoMarks = file.photoMarks || {};
    keys.forEach(k => {
      const a = lbAnnotGet(k);
      file.photoMarks[k] = lbClone({ strokes: a.strokes, prot: a.prot, t: a.t });
      lbDirtyKeys.delete(k);
    });
    // skipUndo: علامات الصور مش لازم تدخل في سجل Ctrl+Z — من غير كده أي Ctrl+Z في أي تاب كان
    // ممكن يلغي رسمة بالغلط (التعديل ده مش بيغيّر أي قسم معروف في ملف المريض فكان بيظهر في كل التابات)
    const ok = await setData('patientfile:' + state.currentPatientId, stripHelperFields(file), { skipUndo: true });
    if(ok === false) keys.forEach(k => lbDirtyKeys.add(k));   // هيتعاد مع أول فتح للصورة
  }catch(e){
    console.error('photo marks sync failed', e);
    keys.forEach(k => lbDirtyKeys.add(k));
  }finally{
    lbSyncBusy = false;
    if(lbSyncAgain){ lbSyncAgain = false; lbAnnotSaveSoon(); }
  }
}
// بيتنده عليها لما الصورة نفسها تتعدل (تدوير/قص) لأن العلامات القديمة مش هتطابق الصورة الجديدة
function lbClearAnnotationsForPath(path){
  const all = lbAnnotLoadAll();
  const t = Date.now();
  all[path] = { strokes: [], prot: null, t };
  lbAnnotFlush();
  if(typeof state !== 'undefined' && state && state.currentPatientFile && state.currentPatientFile.photoMarks && state.currentPatientFile.photoMarks[path]){
    state.currentPatientFile.photoMarks[path] = { strokes: [], prot: null, t };   // محفوظة مع حفظ التعديل في المحرر
  }
}
window.addEventListener('pagehide', () => { lbAnnotFlush(); });

