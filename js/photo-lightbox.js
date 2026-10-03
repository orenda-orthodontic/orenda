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
