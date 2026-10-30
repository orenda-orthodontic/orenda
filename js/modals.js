// modals.js — نوافذ التأكيد/التنبيه/الإدخال (بديل confirm/alert/prompt)
// ============ MODAL HELPERS (replace native confirm/prompt/alert) ============
function confirmModal(message, opts={}){
  const confirmLabel = opts.confirmLabel || 'تأكيد';
  const cancelLabel = opts.cancelLabel || 'إلغاء';
  const danger = !!opts.danger;
  return new Promise(resolve=>{
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `
      <div class="modal">
        <h3>تأكيد</h3>
        <p style="font-size:14px;line-height:1.7;white-space:pre-line;margin:0 0 16px;color:var(--text);">${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button class="secondary" id="modalCancelBtn">${escapeHtml(cancelLabel)}</button>
          <button class="${danger?'danger':''}" id="modalConfirmBtn">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(bg);
    const cleanup = (result) => { bg.remove(); document.removeEventListener('keydown', onKey); resolve(result); };
    document.getElementById('modalCancelBtn').onclick = () => cleanup(false);
    document.getElementById('modalConfirmBtn').onclick = () => cleanup(true);
    bg.onclick = (e) => { if(e.target === bg) cleanup(false); };
    function onKey(e){ if(e.key==='Escape') cleanup(false); }
    document.addEventListener('keydown', onKey);
    setTimeout(()=>{ const b = document.getElementById('modalConfirmBtn'); if(b) b.focus(); }, 50);
  });
}

function alertModal(message, opts={}){
  const title = opts.title || 'تنبيه';
  return new Promise(resolve=>{
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `
      <div class="modal">
        <h3>${escapeHtml(title)}</h3>
        <p style="font-size:14px;line-height:1.7;white-space:pre-line;margin:0 0 16px;color:var(--text);">${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button id="modalOkBtn">تمام</button>
        </div>
      </div>
    `;
    document.body.appendChild(bg);
    const cleanup = () => { bg.remove(); document.removeEventListener('keydown', onKey); resolve(); };
    document.getElementById('modalOkBtn').onclick = cleanup;
    bg.onclick = (e) => { if(e.target === bg) cleanup(); };
    function onKey(e){ if(e.key==='Escape' || e.key==='Enter') cleanup(); }
    document.addEventListener('keydown', onKey);
    setTimeout(()=>{ const b = document.getElementById('modalOkBtn'); if(b) b.focus(); }, 50);
  });
}

function promptModal(title, defaultValue, opts={}){
  const placeholder = opts.placeholder || '';
  const type = opts.type || 'text';
  const label = opts.label || '';
  return new Promise(resolve=>{
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `
      <div class="modal">
        <h3>${escapeHtml(title)}</h3>
        <div class="field">
          ${label ? `<label>${escapeHtml(label)}</label>` : ''}
          <input type="${type}" id="modalPromptInput" value="${escapeHtml(defaultValue || '')}" placeholder="${escapeHtml(placeholder)}" style="width:100%;">
        </div>
        <div class="modal-actions">
          <button class="secondary" id="modalPromptCancelBtn">إلغاء</button>
          <button id="modalPromptOkBtn">حفظ</button>
        </div>
      </div>
    `;
    document.body.appendChild(bg);
    const input = document.getElementById('modalPromptInput');
    const cleanup = (result) => { bg.remove(); document.removeEventListener('keydown', onKey); resolve(result); };
    document.getElementById('modalPromptCancelBtn').onclick = () => cleanup(null);
    document.getElementById('modalPromptOkBtn').onclick = () => { const v = input.value.trim(); cleanup(v ? v : null); };
    bg.onclick = (e) => { if(e.target === bg) cleanup(null); };
    function onKey(e){
      if(e.key==='Escape') cleanup(null);
      if(e.key==='Enter'){ e.preventDefault(); const v = input.value.trim(); cleanup(v ? v : null); }
    }
    document.addEventListener('keydown', onKey);
    setTimeout(()=>{ input.focus(); if(type==='text') input.select(); }, 50);
  });
}


function uid(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}

function buildWhatsappLink(raw){
  let digits = (raw||'').replace(/[^0-9]/g, '');
  if(!digits) return '#';
  // Egyptian local numbers (01xxxxxxxxx) -> country code 20, drop leading 0
  if(digits.length === 11 && digits.startsWith('0')){
    digits = '20' + digits.slice(1);
  }
  return 'https://wa.me/' + digits;
}

