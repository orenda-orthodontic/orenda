// ortho-notes.js — "ملاحظاتي": مكتبة ملاحظات أرثودونتيا عامة (مش مربوطة بمريض) — عصارة خبرتك
// وتجربتك مع الحالات: اللي نجح، اللي فشل، اللي لازم تاخد بالك منه، واللي محتاج تعديل. بتتخزن
// كلها تحت مفتاح واحد في kv_store اسمه 'orthoNotes' (مصفوفة ملاحظات)، ومحمية من تعارض الحفظ بين
// الأجهزة (CONCURRENCY_KEYS في auth.js) زي المخزون والعيادات. وبتتضمن تلقائي في النسخ الاحتياطية.
//
// كل ملاحظة: { id, createdAt, updatedAt, date, title, type, category, body, caseRef }
//   type     = watch | worked | failed | tweak | note   (ORTHO_NOTE_TYPES تحت)
//   category = نص حر (فيه اقتراحات جاهزة + أي تصنيف استخدمته قبل كده)
//   caseRef  = مرجع خاص بيك (رقم/اسم حالة) — بيظهر في البرنامج بس ومابيتطبعش في الـ PDF أبدًا،
//              عشان لو شاركت الملف مع حد مايبقاش فيه أي هوية مريض.
//
// التصدير: PDF عن طريق نافذة طباعة المتصفح (window.print → Save as PDF) بنفس أسلوب كشف الحساب
// في finance-tab.js — العربي والاتجاه من اليمين لليسار بيطلعوا مظبوطين من غير أي مكتبة.

const ORTHO_NOTES_KEY = 'orthoNotes';

const ORTHO_NOTE_TYPES = {
  watch:  { label: '⚠️ خد بالك',      bg: '#fff3e0', fg: '#e65100' },
  worked: { label: '✅ نجح',           bg: '#e8f5e9', fg: '#2e7d32' },
  failed: { label: '❌ فشل',           bg: '#fdecea', fg: '#c62828' },
  tweak:  { label: '🔧 محتاج تعديل',   bg: '#e3f2fd', fg: '#1565c0' },
  note:   { label: '📝 ملاحظة',        bg: '#eeeeee', fg: '#555555' }
};
const ORTHO_NOTE_TYPE_ORDER = ['watch', 'worked', 'failed', 'tweak', 'note'];

// اقتراحات بس (datalist) — تقدر تكتب أي تصنيف تاني
const ORTHO_NOTE_DEFAULT_CATEGORIES = [
  'Diagnosis & Treatment Planning',
  'Bonding / Brackets',
  'Wires & Sequence',
  'Extraction Cases',
  'Canine Retraction',
  'Space Closure',
  'Anchorage / TADs',
  'Elastics',
  'Deep Bite / Open Bite',
  'Crowding / Expansion',
  'Class II / Class III',
  'Hygiene & Decalcification',
  'Retention',
  'Patient Management',
  'Other'
];

function ensureOrthoNotesState(){
  if(!Array.isArray(state.orthoNotes)) state.orthoNotes = [];
  if(!state.orthoNotesFilter) state.orthoNotesFilter = { q: '', type: '', category: '' };
}

// بيقرا المفتاح بـ idbGet مباشرة (مش getData) عشان نفرّق بين "مفيش ملاحظات لسه" و"فشل التحميل":
// getData بيرجّع [] في الحالتين، ولو حفظنا فوق تحميل فاشل كنا هنمسح الملاحظات اللي على السيرفر.
// لو التحميل فشل، الشاشة بتعرض "حاول تاني" وبتقفل الإضافة/التعديل لحد ما يتحمل.
async function loadOrthoNotes(){
  ensureOrthoNotesState();
  try{
    const raw = await idbGet(ORTHO_NOTES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    state.orthoNotes = Array.isArray(parsed) ? parsed : [];
    state.orthoNotesLoadFailed = false;
    _lastKnownValues[ORTHO_NOTES_KEY] = deepClone(state.orthoNotes); // baseline لـ Ctrl+Z، زي getData
  }catch(e){
    console.error('ortho notes load failed', e);
    state.orthoNotesLoadFailed = true;
  }
}

async function saveOrthoNotes(){
  return await setData(ORTHO_NOTES_KEY, state.orthoNotes);
}

function orthoNotesFiltered(){
  ensureOrthoNotesState();
  const f = state.orthoNotesFilter;
  const q = (f.q || '').trim().toLowerCase();
  return state.orthoNotes.filter(n => {
    if(f.type && n.type !== f.type) return false;
    if(f.category && (n.category || '') !== f.category) return false;
    if(q){
      const hay = [n.title, n.body, n.category, n.caseRef].join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function orthoNotesUsedCategories(){
  ensureOrthoNotesState();
  return [...new Set(state.orthoNotes.map(n => (n.category || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// ============ SCREEN ============
function orthoNoteCardHtml(n){
  const t = ORTHO_NOTE_TYPES[n.type] || ORTHO_NOTE_TYPES.note;
  return `
    <div class="card" style="margin-bottom:10px;">
      <div class="row" style="justify-content:space-between;align-items:flex-start;gap:10px;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px;">
            <span class="appt-badge" style="background:${t.bg};color:${t.fg};">${t.label}</span>
            ${n.category ? `<span class="stage-date-chip">${escapeHtml(n.category)}</span>` : ''}
            <span style="font-size:11px;color:var(--muted);">${escapeHtml(formatDateAr(n.date))}</span>
          </div>
          <div style="font-weight:700;font-size:15px;margin-bottom:4px;">${escapeHtml(n.title || '')}</div>
          <div style="white-space:pre-wrap;font-size:13.5px;line-height:1.8;">${escapeHtml(n.body || '')}</div>
          ${n.caseRef ? `<div style="font-size:11px;color:var(--muted);margin-top:8px;">🔒 مرجع الحالة (ليك بس — مابيتطبعش): ${escapeHtml(n.caseRef)}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;">
          <button class="secondary small" data-note-edit="${n.id}" title="تعديل">✏️</button>
          <button class="secondary small" data-note-del="${n.id}" title="حذف">🗑</button>
        </div>
      </div>
    </div>
  `;
}

function orthoNotesListHtml(list){
  if(!state.orthoNotes.length){
    return `
      <div class="card">
        <div class="empty-state" style="padding:24px;line-height:1.9;">
          لسه مفيش ملاحظات. اضغط "+ ملاحظة جديدة" وسجّل أول حاجة اتعلمتها — مثلاً:<br>
          ⚠️ "مع كذا لازم أعمل كذا قبل ما ...", ✅ "الطريقة الفلانية جابت نتيجة في ...", ❌ "جربت كذا وفشل عشان ..."
        </div>
      </div>
    `;
  }
  if(!list.length) return `<div class="card"><div class="placeholder" style="padding:18px;">مفيش ملاحظات بالفلتر ده</div></div>`;
  return list.map(orthoNoteCardHtml).join('');
}

function renderOrthoNotesView(){
  ensureOrthoNotesState();
  if(state.orthoNotesLoadFailed){
    return `
      <div class="card">
        <div class="empty-state" style="padding:24px;">
          <div style="font-weight:700;margin-bottom:8px;">حصلت مشكلة في تحميل الملاحظات</div>
          <div style="color:var(--muted);font-size:13px;margin-bottom:14px;">مقفول الإضافة والتعديل لحد ما تتحمل، عشان مانكتبش فوق ملاحظاتك المحفوظة.</div>
          <button id="orthoNotesRetryBtn">حاول تاني</button>
        </div>
      </div>
    `;
  }
  const f = state.orthoNotesFilter;
  const list = orthoNotesFiltered();
  const cats = orthoNotesUsedCategories();
  const typeCount = t => state.orthoNotes.filter(n => n.type === t).length;
  const chips = ORTHO_NOTE_TYPE_ORDER.map(t => {
    const active = f.type === t;
    return `<button class="${active ? '' : 'secondary'} small" data-otype="${t}">${ORTHO_NOTE_TYPES[t].label} (${typeCount(t)})</button>`;
  }).join('');
  return `
    <div class="card" style="margin-bottom:14px;">
      <div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div>
          <h2 style="margin:0 0 4px;">📓 ملاحظاتي في الأرثودونتيا</h2>
          <div class="placeholder" style="padding:0;font-size:12px;">خبرتك وتجربتك مع الحالات — اللي نجح واللي فشل واللي لازم تاخد بالك منه</div>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap;">
          <button id="orthoNoteAddBtn">+ ملاحظة جديدة</button>
          <button class="secondary" id="orthoNotesExportBtn">📄 تصدير PDF (${list.length})</button>
        </div>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px;">
        <input type="text" id="orthoNotesSearch" placeholder="🔍 دوّر في الملاحظات..." value="${escapeHtml(f.q || '')}" style="flex:1;min-width:180px;">
        <select id="orthoNotesCategoryFilter">
          <option value="">كل التصنيفات</option>
          ${cats.map(c => `<option value="${escapeHtml(c)}" ${c === f.category ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">${chips}</div>
    </div>
    <div id="orthoNotesList">${orthoNotesListHtml(list)}</div>
  `;
}

// بيحدّث القايمة وعداد التصدير بس (من غير render() كامل) — عشان الكتابة في خانة البحث ماتفقدش الفوكس
function refreshOrthoNotesList(){
  const el = document.getElementById('orthoNotesList');
  if(!el) return;
  const list = orthoNotesFiltered();
  el.innerHTML = orthoNotesListHtml(list);
  const exp = document.getElementById('orthoNotesExportBtn');
  if(exp) exp.textContent = `📄 تصدير PDF (${list.length})`;
  attachOrthoNotesListHandlers();
}

function attachOrthoNotesListHandlers(){
  document.querySelectorAll('[data-note-edit]').forEach(b => { b.onclick = () => openOrthoNoteModal(b.dataset.noteEdit); });
  document.querySelectorAll('[data-note-del]').forEach(b => { b.onclick = () => deleteOrthoNote(b.dataset.noteDel); });
}

function attachOrthoNotesHandlers(){
  const retry = document.getElementById('orthoNotesRetryBtn');
  if(retry) retry.onclick = async () => { await loadOrthoNotes(); render(); };
  if(state.orthoNotesLoadFailed) return;
  document.getElementById('orthoNoteAddBtn').onclick = () => openOrthoNoteModal();
  document.getElementById('orthoNotesExportBtn').onclick = () => exportOrthoNotesPdf();
  const f = state.orthoNotesFilter;
  const search = document.getElementById('orthoNotesSearch');
  if(search) search.oninput = () => { f.q = search.value; refreshOrthoNotesList(); };
  const cat = document.getElementById('orthoNotesCategoryFilter');
  if(cat) cat.onchange = () => { f.category = cat.value; render(); };
  document.querySelectorAll('[data-otype]').forEach(b => {
    b.onclick = () => { f.type = (f.type === b.dataset.otype) ? '' : b.dataset.otype; render(); };
  });
  attachOrthoNotesListHandlers();
}

// ============ ADD / EDIT ============
function openOrthoNoteModal(noteId){
  ensureOrthoNotesState();
  if(state.orthoNotesLoadFailed){ toast('الملاحظات لسه ماتحمّلتش — حاول تاني'); return; }
  const existing = noteId ? state.orthoNotes.find(n => n.id === noteId) : null;
  if(noteId && !existing) return;
  const n = existing || { type: 'note', date: todayStr(), title: '', body: '', category: '', caseRef: '' };
  let selectedType = ORTHO_NOTE_TYPES[n.type] ? n.type : 'note';
  const catSuggestions = [...new Set([...orthoNotesUsedCategories(), ...ORTHO_NOTE_DEFAULT_CATEGORIES])];

  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal" style="max-width:560px;width:95%;max-height:90vh;overflow-y:auto;">
      <h3>${existing ? 'تعديل ملاحظة' : 'ملاحظة جديدة'}</h3>
      <div class="field">
        <label>النوع</label>
        <div id="onTypeChips" style="display:flex;gap:6px;flex-wrap:wrap;"></div>
      </div>
      <div class="field" style="margin-top:12px;">
        <label>العنوان</label>
        <input type="text" id="onTitle" value="${escapeHtml(n.title || '')}" placeholder="جملة قصيرة تلخّص الفكرة" style="width:100%;">
      </div>
      <div class="field" style="margin-top:12px;">
        <label>التصنيف</label>
        <input type="text" id="onCategory" list="onCatList" value="${escapeHtml(n.category || '')}" placeholder="اختار أو اكتب تصنيف" style="width:100%;">
        <datalist id="onCatList">${catSuggestions.map(c => `<option value="${escapeHtml(c)}"></option>`).join('')}</datalist>
      </div>
      <div class="field" style="margin-top:12px;">
        <label>التاريخ</label>
        <input type="date" id="onDate" value="${escapeHtml(n.date || todayStr())}">
      </div>
      <div class="field" style="margin-top:12px;">
        <label>التفاصيل (عملت إيه، جاب إيه، وإيه اللي تاخد بالك منه)</label>
        <textarea id="onBody" rows="8" style="width:100%;">${escapeHtml(n.body || '')}</textarea>
      </div>
      <div class="field" style="margin-top:12px;">
        <label>مرجع الحالة — اختياري، ليك بس ومابيتطبعش في الـ PDF</label>
        <input type="text" id="onCaseRef" value="${escapeHtml(n.caseRef || '')}" placeholder="مثلاً: حالة رقم 11" style="width:100%;">
      </div>
      <div class="modal-actions">
        <button class="secondary" id="onCancelBtn">إلغاء</button>
        <button id="onSaveBtn">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);

  const chipsEl = bg.querySelector('#onTypeChips');
  const drawChips = () => {
    chipsEl.innerHTML = ORTHO_NOTE_TYPE_ORDER.map(t =>
      `<button type="button" class="${t === selectedType ? '' : 'secondary'} small" data-t="${t}">${ORTHO_NOTE_TYPES[t].label}</button>`
    ).join('');
    chipsEl.querySelectorAll('[data-t]').forEach(b => { b.onclick = () => { selectedType = b.dataset.t; drawChips(); }; });
  };
  drawChips();

  const close = () => bg.remove();
  bg.querySelector('#onCancelBtn').onclick = close;
  // الضغط بره النافذة بيقفلها بس لو لسه مكتبتش حاجة — عشان ماتضيعش ملاحظة طويلة بضغطة غلط
  bg.onclick = (e) => {
    if(e.target !== bg) return;
    const typed = bg.querySelector('#onTitle').value.trim() || bg.querySelector('#onBody').value.trim();
    if(!typed) close();
  };
  setTimeout(() => { const t = bg.querySelector('#onTitle'); if(t) t.focus(); }, 50);

  bg.querySelector('#onSaveBtn').onclick = async () => {
    const title = bg.querySelector('#onTitle').value.trim();
    if(!title){ toast('اكتب عنوان للملاحظة'); return; }
    const fields = {
      title,
      type: selectedType,
      category: bg.querySelector('#onCategory').value.trim(),
      date: bg.querySelector('#onDate').value || todayStr(),
      body: bg.querySelector('#onBody').value.trim(),
      caseRef: bg.querySelector('#onCaseRef').value.trim()
    };
    const now = new Date().toISOString();
    if(existing){
      Object.assign(existing, fields, { updatedAt: now });
    } else {
      state.orthoNotes.push(Object.assign({ id: uid(), createdAt: now, updatedAt: now }, fields));
    }
    close();
    await saveOrthoNotes();
    await logActivity(existing ? 'ortho_note_edit' : 'ortho_note_add', `${existing ? 'عدّل' : 'أضاف'} ملاحظة أرثو: ${title}`);
    toast(existing ? 'اتحفظ التعديل' : 'اتضافت الملاحظة');
    render();
  };
}

async function deleteOrthoNote(noteId){
  ensureOrthoNotesState();
  const n = state.orthoNotes.find(x => x.id === noteId);
  if(!n) return;
  if(!(await confirmModal(`تمسح الملاحظة دي؟\n"${n.title}"`, { danger: true, confirmLabel: 'مسح' }))) return;
  state.orthoNotes = state.orthoNotes.filter(x => x.id !== noteId);
  await saveOrthoNotes();
  await logActivity('ortho_note_delete', `مسح ملاحظة أرثو: ${n.title}`);
  toast('اتمسحت الملاحظة');
  render();
}

// ============ PDF EXPORT ============
// بيصدّر اللي ظاهر دلوقتي بعد الفلاتر (بحث/تصنيف/نوع) — فتقدر تفلتر "كانين ريتراكشن" مثلاً وتطلّع
// مذكرة صغيرة بيها بس. مجمّع حسب التصنيف، والأحدث الأول جوه كل تصنيف. caseRef مش بيتطبع أبدًا.
function exportOrthoNotesPdf(){
  const list = orthoNotesFiltered();
  if(!list.length){ toast('مفيش ملاحظات تتصدّر'); return; }
  const NO_CAT = 'بدون تصنيف';
  const groups = {};
  list.forEach(n => {
    const c = (n.category || '').trim() || NO_CAT;
    (groups[c] = groups[c] || []).push(n);
  });
  const catNames = Object.keys(groups).sort((a, b) => a === NO_CAT ? 1 : b === NO_CAT ? -1 : a.localeCompare(b));

  const summary = ORTHO_NOTE_TYPE_ORDER
    .map(t => ({ t, c: list.filter(n => n.type === t).length }))
    .filter(x => x.c)
    .map(x => `${ORTHO_NOTE_TYPES[x.t].label} ${x.c}`)
    .join(' · ');

  const groupsHtml = catNames.map(c => `
    <h2>${escapeHtml(c)}</h2>
    ${groups[c].map(n => {
      const t = ORTHO_NOTE_TYPES[n.type] || ORTHO_NOTE_TYPES.note;
      return `
        <div class="note">
          <div class="note-head">
            <span class="badge" style="background:${t.bg};color:${t.fg};">${t.label}</span>
            <span class="date">${escapeHtml(formatDateAr(n.date))}</span>
          </div>
          <div class="note-title">${escapeHtml(n.title || '')}</div>
          ${n.body ? `<div class="note-body">${escapeHtml(n.body)}</div>` : ''}
        </div>
      `;
    }).join('')}
  `).join('');

  const html = `
    <!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
    <title>Orthodontic Notes — ${escapeHtml(formatDateAr(todayStr()))}</title>
    <style>
      @page{margin:16mm;}
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      body{font-family:Tahoma,Arial,sans-serif;padding:24px;color:#222;line-height:1.7;}
      h1{font-size:22px;margin:0 0 4px;}
      .meta{color:#555;font-size:13px;margin-bottom:6px;}
      .summary{color:#555;font-size:12.5px;margin-bottom:18px;padding-bottom:12px;border-bottom:2px solid #ddd;}
      h2{font-size:16px;margin:22px 0 10px;padding:4px 10px;background:#f3f3f3;border-inline-start:4px solid #999;page-break-after:avoid;}
      .note{border:1px solid #ddd;border-radius:8px;padding:10px 14px;margin-bottom:10px;page-break-inside:avoid;}
      .note-head{display:flex;gap:10px;align-items:center;margin-bottom:4px;}
      .badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;}
      .date{color:#777;font-size:12px;}
      .note-title{font-weight:700;font-size:15px;margin-bottom:4px;}
      .note-body{white-space:pre-wrap;font-size:13.5px;}
      @media print{ button{display:none;} }
    </style>
    </head><body>
      <h1>Orthodontic Notes</h1>
      <div class="meta">${escapeHtml(state.doctorName || '')} | ${escapeHtml(formatDateAr(todayStr()))} | ${list.length} ملاحظة</div>
      <div class="summary">${summary}</div>
      ${groupsHtml}
      <button onclick="window.print()" style="margin-top:20px;padding:8px 16px;">طباعة / حفظ PDF</button>
    </body></html>
  `;
  const w = window.open('', '_blank');
  if(!w){ toast('المتصفح منع فتح نافذة جديدة — اسمح بالنوافذ المنبثقة وحاول تاني'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
