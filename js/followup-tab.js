// followup-tab.js — تبويب المتابعة الشهرية
// ============ MONTHLY FOLLOW-UP TAB ============
// Each of these (except derotation/impacted canine) is now split by direction, because they're
// auto-detected and auto-counted from what you type in "اللي اتعمل" (see advanced-stage-keywords.js)
// instead of being ticked by hand — upper and lower (or right/left) need separate counters so the
// "stage dragging on" alert is meaningful per side, not blended together.
const TREATMENT_STAGES = [
  {id:'canine_retraction_upper', label:'Retraction Upper Canine'},
  {id:'canine_retraction_lower', label:'Retraction Lower Canine'},
  {id:'incisors_retraction_upper', label:'Retraction Upper Incisors'},
  {id:'incisors_retraction_lower', label:'Retraction Lower Incisors'},
  {id:'distalization_right', label:'Distalization Right'},
  {id:'distalization_left', label:'Distalization Left'},
  {id:'distalization_both', label:'Distalization (Both Sides)'},
  {id:'intrusion_upper', label:'Intrusion Upper'},
  {id:'intrusion_lower', label:'Intrusion Lower'},
  {id:'derotation', label:'De-rotation'},
  {id:'impacted_canine_retraction', label:'Retraction of Impacted Canine'},
  {id:'midline_upper', label:'Midline Correction Upper'},
  {id:'midline_lower', label:'Midline Correction Lower'},
  {id:'firing_upper', label:'Firing Upper'},
  {id:'firing_lower', label:'Firing Lower'}
];
const MIDLINE_STAGE_IDS = ['midline_upper', 'midline_lower'];
const MIDLINE_ALERT_MONTHS = 2;
// stages where each occurrence is tied to a specific tooth (canines + de-rotation) — the Stages
// tab shows a per-tooth breakdown for these (see advanced-stage-keywords.js)
const TOOTH_LEVEL_STAGE_IDS = ['canine_retraction_upper', 'canine_retraction_lower', 'derotation'];
// stages whose id itself already says which arch (…_upper/…_lower) — the note line is appended to
// that field directly with no need to ask. Everything else (derotation is tooth-level and derives
// its arch from the picked tooth instead; distalization has no arch concept at all; impacted-canine
// and any custom stage type ask via pickMonthlyFieldTarget) is handled case by case below.
function stageArchField(stageId){
  if(stageId.endsWith('_upper')) return 'doneUpper';
  if(stageId.endsWith('_lower')) return 'doneLower';
  return null;
}
// the full set of checkable stages — the fixed list plus any global custom ones the doctor added
// (see the "⚙ إدارة المراحل المخصصة" button below) — so a custom type behaves identically to a
// built-in one everywhere stages are counted, alerted on, or displayed (Stages tab, Overview's
// "last stage" summary, this checklist).
function allTreatmentStages(){
  return [...TREATMENT_STAGES, ...(state.customStageTypes||[])];
}

// ============ CURRENT-MONTH DRAFT (main form loads straight into it — no "+ إضافة" first) ============
// A draft is a plain in-memory entry that is NEVER saved until the user actually types/changes
// something in it. It lives here (not in `state`) exactly like diagPhotoDock's module vars in
// diagnosis-photo-dock.js — reset whenever we land on a different patient, discarded the moment
// it gets written for real into file.monthlyLog.
let monthlyDraftEntry = null; // {id, patientId, date, done, plan} | null

// the entry the main form should show for "this month" — a real logged entry if one already
// exists for the current month, otherwise null (caller falls back to the draft)
function getCurrentMonthEntry(file){
  const cm = currentMonthStr();
  const matches = (file.monthlyLog || []).filter(e => (e.date || '').slice(0, 7) === cm);
  if(!matches.length) return null;
  return matches.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
}

function getOrCreateMonthlyDraft(patientId){
  if(!monthlyDraftEntry || monthlyDraftEntry.patientId !== patientId){
    monthlyDraftEntry = { id: uid(), patientId, date: todayStr(), done: '', plan: '' };
  }
  return monthlyDraftEntry;
}

// called at the top of every function that mutates an entry by id — turns the draft into a real
// file.monthlyLog entry the first time it's actually touched. A no-op once the entry is real.
function materializeMonthlyDraft(id){
  const file = state.currentPatientFile;
  if(!file) return;
  if(!file.monthlyLog) file.monthlyLog = [];
  if(file.monthlyLog.find(x => x.id === id)) return; // already real
  if(monthlyDraftEntry && monthlyDraftEntry.id === id){
    const { patientId, ...clean } = monthlyDraftEntry;
    file.monthlyLog.push(clean);
    monthlyDraftEntry = null;
  }
}

function renderMonthEntry(e, opts={}){
  const isDraft = !!opts.isDraft;
  const stages = e.stages || [];
  const stagesOpen = !!state.monthlyStagesOpen; // قايمة التيكات مقفولة لحد ما تدوس عليها
  const checkedStageLabels = allTreatmentStages().filter(st => stages.includes(st.id)).map(st => st.label);
  const stageTags = allTreatmentStages().map(st => `
    <label class="stage-tag ${stages.includes(st.id)?'checked':''}">
      <input type="checkbox" class="monthly-stage-cb" data-id="${e.id}" data-stage="${st.id}" ${stages.includes(st.id)?'checked':''}>
      ${st.label}
    </label>
  `).join('');

  const usedList = (e.materialsUsed || []).map(u => `
    <span class="stage-date-chip">
      ${escapeHtml(u.itemName)}${u.itemType ? ' (' + escapeHtml(u.itemType) + ')' : ''} × ${u.qty}
      <button class="stage-date-remove" data-remove-material="${e.id}|${u.id}" title="إلغاء وإرجاع للمخزن">×</button>
    </span>
  `).join('');

  return `
    <div class="month-entry" data-entry-id="${e.id}">
      <div class="month-entry-head">
        <input type="date" class="monthly-date" data-id="${e.id}" value="${escapeHtml(e.date||'')}">
        ${isDraft ? '' : `<button class="danger small monthly-delete" data-id="${e.id}">حذف</button>`}
      </div>
      ${e.missed ? `
        <div class="row" style="justify-content:space-between;align-items:center;background:#fff3f3;border:1px solid #f3b8b8;border-radius:8px;padding:8px 10px;margin-bottom:10px;">
          <span style="font-size:13px;">❌ العيان مجاش الشهر ده${e.missedReason ? ' — ' + escapeHtml(e.missedReason) : ''}</span>
          <button class="secondary small" data-unmark-missed="${e.id}">تراجع</button>
        </div>
      ` : `
        <div class="row" style="margin-bottom:10px;">
          <button class="danger small" data-mark-missed="${e.id}">❌ العيان مجاش الشهر ده</button>
        </div>
      `}
      <div class="lbl">اللي اتعمل الشهر ده</div>
      <table class="diag-table" style="margin-bottom:10px;">
        <tbody>
          <tr>
            <td style="width:70px;font-weight:700;color:var(--muted);">upper</td>
            <td><textarea class="monthly-done-upper" data-id="${e.id}" placeholder="...">${escapeHtml(e.doneUpper||'')}</textarea></td>
          </tr>
          <tr>
            <td style="width:70px;font-weight:700;color:var(--muted);">lower</td>
            <td><textarea class="monthly-done-lower" data-id="${e.id}" placeholder="...">${escapeHtml(e.doneLower||'')}</textarea></td>
          </tr>
          <tr>
            <td style="width:70px;font-weight:700;color:var(--muted);">both</td>
            <td><textarea class="monthly-done-both" data-id="${e.id}" placeholder="...">${escapeHtml(e.doneBoth !== undefined ? e.doneBoth : (e.done||''))}</textarea></td>
          </tr>
        </tbody>
      </table>
      <div class="lbl">الخطة للشهر الجاي</div>
      <table class="diag-table" style="margin-bottom:10px;">
        <tbody>
          <tr>
            <td style="width:70px;font-weight:700;color:var(--muted);">upper</td>
            <td><textarea class="monthly-plan-upper" data-id="${e.id}" placeholder="...">${escapeHtml(e.planUpper||'')}</textarea></td>
          </tr>
          <tr>
            <td style="width:70px;font-weight:700;color:var(--muted);">lower</td>
            <td><textarea class="monthly-plan-lower" data-id="${e.id}" placeholder="...">${escapeHtml(e.planLower||'')}</textarea></td>
          </tr>
          <tr>
            <td style="width:70px;font-weight:700;color:var(--muted);">both</td>
            <td><textarea class="monthly-plan-both" data-id="${e.id}" placeholder="...">${escapeHtml(e.planBoth !== undefined ? e.planBoth : (e.plan||''))}</textarea></td>
          </tr>
        </tbody>
      </table>
      <div class="lbl">مراحل العلاج المسجلة الشهر ده</div>
      <div class="row" style="margin:4px 0 8px;gap:6px;flex-wrap:wrap;">
        <button type="button" class="secondary small toggle-stages-btn">${stagesOpen ? '▾' : '▸'} مراحل العلاج${stages.length ? ' (' + stages.length + ' متسجلة)' : ''}</button>
      </div>
      ${stagesOpen ? `
        <div class="stage-tags">${stageTags}</div>
        <div class="row" style="margin:8px 0;">
          <button type="button" class="secondary small manage-custom-stages-btn">⚙ إدارة المراحل المخصصة</button>
        </div>
      ` : (checkedStageLabels.length ? `<div class="stage-tags" style="margin-bottom:8px;">${checkedStageLabels.map(l => `<span class="stage-date-chip">${escapeHtml(l)}</span>`).join('')}</div>` : '')}
      <div class="lbl">تقييم نظافة الأسنان الشهر ده</div>
      <div class="hygiene-select-row">
        <select class="monthly-hygiene" data-id="${e.id}">
          <option value="">— لم يتم التقييم —</option>
          <option value="excellent" ${e.hygieneRating==='excellent'?'selected':''}>ممتازة</option>
          <option value="good" ${e.hygieneRating==='good'?'selected':''}>جيدة</option>
          <option value="fair" ${e.hygieneRating==='fair'?'selected':''}>متوسطة</option>
          <option value="poor" ${e.hygieneRating==='poor'?'selected':''}>ضعيفة</option>
        </select>
      </div>
      <div class="lbl">خامات اتخصمت من المخزن</div>
      <div class="row" style="margin-bottom:8px;flex-wrap:wrap;gap:6px;">
        <button type="button" class="secondary small wire-accessories-btn" data-id="${e.id}">🔧 واير / إيلاستيك / أكسسوارات</button>
        <button type="button" class="secondary small rebonding-action-btn" data-id="${e.id}">🦷 Rebonding / فص</button>
        <button type="button" class="secondary small bonding-action-btn" data-id="${e.id}">🆕 Bonding</button>
        ${(state.inventoryCategories||[]).filter(c => !GENERIC_EXCLUDED_CATEGORIES.has(c.id)).map(c => `
          <button type="button" class="secondary small category-action-btn" data-id="${e.id}" data-cat="${c.id}" data-cat-label="${escapeHtml(c.label)}">➕ ${escapeHtml(c.label)}</button>
        `).join('')}
      </div>
      ${usedList ? `<div class="stage-tags" style="margin-bottom:8px;">${usedList}</div>` : `<div class="placeholder" style="padding:8px;">لسه مفيش خصم — دوس أي زرار فوق حسب نوع الخصم</div>`}
    </div>
  `;
}

function renderMonthlyTab(){
  const file = state.currentPatientFile;
  const log = file.monthlyLog || [];
  const currentEntry = getCurrentMonthEntry(file);
  const mainEntry = currentEntry || getOrCreateMonthlyDraft(state.currentPatientId);
  const mainRow = renderMonthEntry(mainEntry, { isDraft: !currentEntry });
  const pastCount = log.filter(e => (e.date||'').slice(0,7) !== currentMonthStr()).length;
  // الشاشة دي بقت مدموجة: المتابعة الشهرية (الجزء الأكبر) + خريطة الفصوص كبانل ثابت جنبها،
  // بدل ما خريطة الفصوص تبقى تبويب مستقل. على الموبايل الاتنين بيترتبوا فوق بعض (CSS).
  return `
    <div class="monthly-split">
      <div class="monthly-split-main">
        <div class="section-title">المتابعة الشهرية — ${monthLabelAr(currentMonthStr())}</div>
        <div class="row" style="margin-bottom:14px;gap:8px;">
          <button class="secondary small" id="openMonthlyHistoryBtn">📖 سجل${pastCount ? ' (' + pastCount + ')' : ''}</button>
        </div>
        <div class="month-list">
          ${mainRow}
        </div>
      </div>
      <div class="monthly-split-side">
        ${renderBracketsTab({compact:true})}
      </div>
    </div>
  `;
}

// ============ SEGL (سجل) — HISTORY MODAL FOR PAST MONTHS ============
// lives outside #app (like the diagnosis photo dock), so it isn't touched when render()
// rebuilds the main screen — refreshMonthlyHistoryModalIfOpen() (called from render-core.js on
// every render) keeps its contents in sync instead.
function pastMonthlyEntries(file){
  const cm = currentMonthStr();
  return [...(file.monthlyLog||[])]
    .filter(e => (e.date||'').slice(0,7) !== cm)
    .sort((a,b)=>(b.date||'').localeCompare(a.date||''));
}

function renderMonthlyHistoryModalBody(){
  const body = document.getElementById('monthlyHistoryBody');
  if(!body) return;
  const file = state.currentPatientFile;
  const rowsHtml = pastMonthlyEntries(file).map(e => renderMonthEntry(e)).join('');
  body.innerHTML = rowsHtml || '<div class="placeholder">لسه مفيش متابعات قديمة مسجلة</div>';
  attachMonthlyHandlers(); // idempotent — rewires both the modal's fields and the main form's
}

function openMonthlyHistoryModal(){
  if(document.getElementById('monthlyHistoryModalBg')) return;
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.id = 'monthlyHistoryModalBg';
  bg.innerHTML = `
    <div class="modal" style="max-width:640px;width:95%;max-height:88vh;display:flex;flex-direction:column;">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h3 style="margin:0;">سجل المتابعات</h3>
        <button type="button" class="secondary small" id="addOldMonthlyBtn">+ إضافة تسجيل قديم</button>
      </div>
      <div id="monthlyHistoryBody" style="overflow-y:auto;flex:1;padding-inline-end:4px;"></div>
      <div class="modal-actions">
        <button id="closeMonthlyHistoryBtn">تمام</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('closeMonthlyHistoryBtn').onclick = () => bg.remove();
  document.getElementById('addOldMonthlyBtn').onclick = () => addOldMonthlyEntry();
  renderMonthlyHistoryModalBody();
}

// called from render() (render-core.js) after every re-render, so edits made inside the modal
// (delete / add / stage toggle / material use — anything that calls render()) don't leave it
// showing stale data. Closes it automatically if we've navigated away from this patient/tab.
function refreshMonthlyHistoryModalIfOpen(){
  const bg = document.getElementById('monthlyHistoryModalBg');
  if(!bg) return;
  if(state.view !== 'patient' || state.activeTab !== 'monthly'){ bg.remove(); return; }
  renderMonthlyHistoryModalBody();
}

// "+ إضافة تسجيل قديم" inside السجل — unlike the old top-level "+ إضافة متابعة جديدة" this must
// NOT default to today's date, or the new entry would land back in the current-month bucket
// (i.e. hijack the main form) instead of staying in the history list. Date starts blank; the
// user picks the right month via the date field like before.
async function addOldMonthlyEntry(){
  const file = state.currentPatientFile;
  if(!file.monthlyLog) file.monthlyLog = [];
  file.monthlyLog.push({ id: uid(), date: '', done:'', plan:'' });
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  render();
}

async function updateMonthlyEntry(id, changes){
  materializeMonthlyDraft(id);
  const file = state.currentPatientFile;
  const e = (file.monthlyLog||[]).find(x=>x.id===id);
  if(!e) return;
  Object.assign(e, changes);
  // typing real content into a month that was explicitly marked "مجاش" means the patient did
  // come after all — clear the missed mark automatically instead of leaving a stale, contradictory
  // "❌ مجاش" banner sitting above real notes for that same month
  const doneFieldsChanged = ['doneUpper','doneLower','doneBoth'].some(f => changes[f] !== undefined && changes[f].trim());
  if(e.missed && doneFieldsChanged){
    e.missed = false;
    e.missedReason = '';
  }
  // keep any "new case" events tied to this entry (from NEW CASE keyword / bonding) in sync
  // with the entry's date — otherwise they'd stay frozen on whatever date the entry had
  // at the moment they were logged, even after you correct the entry's date afterwards.
  if(changes.date){
    (file.newCaseEvents||[]).forEach(ev=>{ if(ev.entryId === id) ev.date = changes.date; });
  }
  const ok = await savePatientFile(state.currentPatientId, stripHelperFields(file));
  if(ok) toast('اتحفظ');
}

async function markMonthMissed(entryId){
  if(!(await confirmModal('تأكيد إن العيان مجاش الشهر ده؟'))) return;
  materializeMonthlyDraft(entryId);
  const file = state.currentPatientFile;
  const e = (file.monthlyLog||[]).find(x=>x.id===entryId);
  if(!e) return;
  const reason = await promptModal('السبب (اختياري)', '', { label: 'ليه العيان مجاش؟ (سيبها فاضية لو مش عارف)', placeholder: 'مثلاً: سفر، ظروف صحية، نسي الميعاد...' });
  e.missed = true;
  e.missedReason = reason || '';
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('اتسجل إن العيان مجاش الشهر ده');
  render();
}

async function unmarkMonthMissed(entryId){
  const file = state.currentPatientFile;
  const e = (file.monthlyLog||[]).find(x=>x.id===entryId);
  if(!e) return;
  e.missed = false;
  e.missedReason = '';
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('اتلغى تسجيل الغياب');
  render();
}

async function deleteMonthlyEntry(id){
  if(!(await confirmModal('حذف المتابعة دي؟', {danger:true}))) return;
  const file = state.currentPatientFile;
  file.monthlyLog = (file.monthlyLog||[]).filter(x=>x.id!==id);
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  render();
}

// checking a stage tag off now does three things where relevant: (1) for the two tooth-level
// stages (Canine Retraction upper/lower, De-rotation) it opens the same tooth picker as before
// and logs each pick for the Stages tab's per-tooth breakdown; (2) tags e.stages, same as always;
// (3) appends a short descriptive line into the note field so the monthly log still reads
// naturally — the field is auto-picked from the stage id (…_upper/…_lower) or the picked tooth's
// arch, and only asked (فوق/تحت/الاتنين) when neither applies (impacted canine, a custom type).
// Unchecking just removes the tag — any text already appended stays, editable like any note.
async function toggleMonthlyStage(entryId, stageId, checked){
  if(!checked){
    materializeMonthlyDraft(entryId);
    const file = state.currentPatientFile;
    const e = (file.monthlyLog||[]).find(x=>x.id===entryId);
    if(!e) return;
    e.stages = (e.stages||[]).filter(s=>s!==stageId);
    await savePatientFile(state.currentPatientId, stripHelperFields(file));
    render();
    return;
  }

  const allStages = allTreatmentStages();
  const stageDef = allStages.find(s=>s.id===stageId);
  const stageLabel = stageDef ? stageDef.label : stageId;

  if(TOOTH_LEVEL_STAGE_IDS.includes(stageId)){
    let teethPool, title;
    if(stageId === 'canine_retraction_upper'){ teethPool = CANINE_TEETH_UPPER; title = 'Retraction Upper Canine'; }
    else if(stageId === 'canine_retraction_lower'){ teethPool = CANINE_TEETH_LOWER; title = 'Retraction Lower Canine'; }
    else { teethPool = [...FDI_TEETH_ROWS.upper, ...FDI_TEETH_ROWS.lower]; title = 'De-rotation'; }

    const picked = await pickTeethModal(title, 'اختار السن (تقدر تختار أكتر من واحد)', teethPool);
    if(!picked){ render(); return; } // cancelled — re-render so the checkbox visually reverts to unchecked

    materializeMonthlyDraft(entryId);
    const file = state.currentPatientFile;
    const e = (file.monthlyLog||[]).find(x=>x.id===entryId);
    if(!e) return;
    addStageTag(e, stageId);
    picked.forEach(tooth => logStageTooth(file, stageId, tooth, e.date, entryId));

    const teethLabel = picked.map(fdiToPalmer).join(', ');
    const archField = stageArchField(stageId); // canine_retraction_* already knows its arch
    if(archField){
      appendToMonthlyField(e, archField, stageLabel + ' — ' + teethLabel);
    } else {
      // derotation: split the picked teeth themselves by arch, same as Rebonding
      const upperTeeth = picked.filter(t => FDI_TEETH_ROWS.upper.includes(String(t))).map(fdiToPalmer);
      const lowerTeeth = picked.filter(t => FDI_TEETH_ROWS.lower.includes(String(t))).map(fdiToPalmer);
      if(upperTeeth.length) appendToMonthlyField(e, 'doneUpper', stageLabel + ' — ' + upperTeeth.join(', '));
      if(lowerTeeth.length) appendToMonthlyField(e, 'doneLower', stageLabel + ' — ' + lowerTeeth.join(', '));
    }
    await savePatientFile(state.currentPatientId, stripHelperFields(file));
    render();
    return;
  }

  // not tooth-level: figure out the field from the id, or ask when the stage has no arch concept
  const archField = stageArchField(stageId);
  const fieldPick = archField || await pickMonthlyFieldTarget();
  if(!archField && !fieldPick){ render(); return; } // asked and cancelled — revert checkbox visually

  materializeMonthlyDraft(entryId);
  const file = state.currentPatientFile;
  const e = (file.monthlyLog||[]).find(x=>x.id===entryId);
  if(!e) return;
  addStageTag(e, stageId);
  appendToMonthlyField(e, fieldPick, stageLabel);
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  render();
}

// ============ CUSTOM STAGE TYPES (global — shared across every patient/clinic) ============
async function addCustomStageType(){
  const label = await promptModal('اسم مرحلة العلاج الجديدة', '', { label: 'الاسم' });
  if(!label) return;
  if(allTreatmentStages().some(s => normalizeForMatch(s.label) === normalizeForMatch(label))){
    await alertModal('في مرحلة بنفس الاسم ده مسجلة بالفعل.');
    return;
  }
  if(!state.customStageTypes) state.customStageTypes = [];
  state.customStageTypes.push({ id: 'custom_' + uid(), label });
  const ok = await saveCustomStageTypes();
  if(!ok) return; // setData شرح السبب في التوست بتاعه
  toast('اتضافت مرحلة "' + label + '" — متاحة دلوقتي لكل المرضى');
  render();
}

async function deleteCustomStageType(stageId){
  if(!(await confirmModal('مسح مرحلة العلاج المخصصة دي؟ هتتشال من زرايير كل المرضى، بس أي تسجيل قديم ليها في مرضى فاتوا هيفضل زي ما هو.', {danger:true}))) return;
  state.customStageTypes = (state.customStageTypes||[]).filter(s => s.id !== stageId);
  const ok = await saveCustomStageTypes();
  if(!ok) return;
  toast('اتمسحت');
  openManageCustomStagesModal();
}

function openManageCustomStagesModal(){
  const existing = document.getElementById('customStagesModalBg');
  if(existing) existing.remove();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.id = 'customStagesModalBg';
  const list = state.customStageTypes || [];
  bg.innerHTML = `
    <div class="modal">
      <h3>إدارة المراحل المخصصة</h3>
      <div class="placeholder" style="text-align:right;padding:10px;margin-bottom:10px;">أي مرحلة تضيفها هنا بتبقى متاحة كزرار/تيك لكل مريض في كل العيادات، مش بس المريض ده.</div>
      ${list.length ? list.map(s => `
        <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:13px;">${escapeHtml(s.label)}</span>
          <button class="secondary small" data-del-custom-stage="${s.id}">🗑 مسح</button>
        </div>
      `).join('') : `<div class="placeholder">لسه مفيش مراحل مخصصة</div>`}
      <div class="modal-actions">
        <button class="secondary" id="closeCustomStagesModalBtn">قفل</button>
        <button id="addCustomStageBtn">+ إضافة مرحلة جديدة</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('closeCustomStagesModalBtn').onclick = () => bg.remove();
  document.getElementById('addCustomStageBtn').onclick = async () => { bg.remove(); await addCustomStageType(); };
  bg.querySelectorAll('[data-del-custom-stage]').forEach(el=>{
    el.onclick = () => deleteCustomStageType(el.dataset.delCustomStage);
  });
}

function attachMonthlyHandlers(){
  const historyBtn = document.getElementById('openMonthlyHistoryBtn');
  if(historyBtn) historyBtn.onclick = () => openMonthlyHistoryModal();
  document.querySelectorAll('.manage-custom-stages-btn').forEach(el=>{
    el.onclick = () => openManageCustomStagesModal();
  });
  document.querySelectorAll('.monthly-date').forEach(el=>{
    el.onchange = () => updateMonthlyEntry(el.dataset.id, {date: el.value});
  });
  const doneFieldMap = {upper:'doneUpper', lower:'doneLower', both:'doneBoth'};
  ['upper','lower','both'].forEach(part=>{
    document.querySelectorAll(`.monthly-done-${part}`).forEach(el=>{
      el.onchange = async () => {
        const id = el.dataset.id;
        await updateMonthlyEntry(id, {[doneFieldMap[part]]: el.value});
        const file = state.currentPatientFile;
        const entry = (file.monthlyLog||[]).find(x=>x.id===id);
        const combined = [entry.doneUpper, entry.doneLower, entry.doneBoth].filter(Boolean).join('\n');
        // no more keyword-based stage detection — stages are tagged directly via the checkboxes
        // below (toggleMonthlyStage), which also append their own descriptive line to the field.
        await scanNewCaseKeyword(id, combined);
      };
    });
  });
  const planFieldMap = {upper:'planUpper', lower:'planLower', both:'planBoth'};
  ['upper','lower','both'].forEach(part=>{
    document.querySelectorAll(`.monthly-plan-${part}`).forEach(el=>{
      el.onchange = () => updateMonthlyEntry(el.dataset.id, {[planFieldMap[part]]: el.value});
    });
  });
  document.querySelectorAll('.monthly-delete').forEach(el=>{
    el.onclick = () => deleteMonthlyEntry(el.dataset.id);
  });
  document.querySelectorAll('[data-mark-missed]').forEach(el=>{
    el.onclick = () => markMonthMissed(el.dataset.markMissed);
  });
  document.querySelectorAll('[data-unmark-missed]').forEach(el=>{
    el.onclick = () => unmarkMonthMissed(el.dataset.unmarkMissed);
  });
  document.querySelectorAll('.monthly-stage-cb').forEach(el=>{
    el.onchange = () => toggleMonthlyStage(el.dataset.id, el.dataset.stage, el.checked);
  });
  document.querySelectorAll('.monthly-hygiene').forEach(el=>{
    el.onchange = () => updateMonthlyEntry(el.dataset.id, {hygieneRating: el.value});
  });
  document.querySelectorAll('[data-remove-material]').forEach(el=>{
    el.onclick = () => {
      const [entryId, useId] = el.dataset.removeMaterial.split('|');
      removeMaterialUse(entryId, useId);
    };
  });
  document.querySelectorAll('.wire-accessories-btn').forEach(el=>{
    el.onclick = () => handleWireAccessoriesForEntry(el.dataset.id);
  });
  document.querySelectorAll('.rebonding-action-btn').forEach(el=>{
    el.onclick = () => handleRebondingAction(el.dataset.id);
  });
  document.querySelectorAll('.bonding-action-btn').forEach(el=>{
    el.onclick = () => handleBondingAction(el.dataset.id);
  });
  document.querySelectorAll('.toggle-stages-btn').forEach(el=>{
    el.onclick = () => { state.monthlyStagesOpen = !state.monthlyStagesOpen; render(); };
  });
  document.querySelectorAll('.category-action-btn').forEach(el=>{
    el.onclick = () => handleCategoryItemAction(el.dataset.id, el.dataset.cat, el.dataset.catLabel);
  });
  // بانل خريطة الفصوص المدموج في نفس الشاشة — نفس الهاندلرز بالظبط (دوسة = كسر، دوسة تاني = اتصلح)
  attachBracketsHandlers();
}

async function addMaterialUse(entryId){
  const select = document.querySelector(`.material-use-select[data-id="${entryId}"]`);
  const qtyInput = document.querySelector(`.material-use-qty[data-id="${entryId}"]`);
  const itemId = select.value;
  const qty = parseFloat(qtyInput.value) || 0;
  if(!itemId){ toast('اختار صنف'); return; }
  if(qty <= 0){ toast('اكتب كمية صحيحة'); return; }
  const item = state.inventory.find(i=>i.id === itemId);
  if(!item){ toast('الصنف مش موجود'); return; }

  const file = state.currentPatientFile;
  const e = (file.monthlyLog||[]).find(x=>x.id===entryId);
  if(!e) return;
  if(!e.materialsUsed) e.materialsUsed = [];
  e.materialsUsed.push({ id: uid(), itemId: item.id, itemName: item.name, itemType: item.type || '', qty });

  item.qty = Math.max(0, (parseFloat(item.qty)||0) - qty);
  const okInv = await saveInventory();
  if(!okInv){
    // فشل الحفظ أو تعارض — رجّع التغيير المحلي في السطر وخلي setData يوضح السبب في التوست بتاعه
    e.materialsUsed.pop();
    item.qty = (parseFloat(item.qty)||0) + qty;
    render();
    return;
  }
  await savePatientFile(state.currentPatientId, stripHelperFields(file));

  const th = parseFloat(item.threshold)||0;
  if((parseFloat(item.qty)||0) <= th){
    toast('⚠️ ' + item.name + ' وصل لحد الإنذار في المخزن (' + item.qty + ')');
  } else {
    toast('اتخصم من المخزن');
  }
  render();
}

async function removeMaterialUse(entryId, useId){
  const file = state.currentPatientFile;
  const e = (file.monthlyLog||[]).find(x=>x.id===entryId);
  if(!e) return;
  const use = (e.materialsUsed||[]).find(u=>u.id===useId);
  if(!use) return;
  const isLinkedRebond = !!use.linkedBreakId;
  const msg = isLinkedRebond
    ? 'إلغاء الاستخدام ده هيرجع الكمية للمخزن، ويشيل سجل الكسر المرتبط من خريطة الفصوص، ويمسح رسوم الـ300 جنيه المرتبطة بيه من الحسابات (لو موجودة). متأكد؟'
    : 'إلغاء الاستخدام ده وإرجاع الكمية للمخزن؟';
  if(!(await confirmModal(msg, {danger:true}))) return;

  const item = state.inventory.find(i=>i.id === use.itemId);
  if(item){
    item.qty = (parseFloat(item.qty)||0) + (parseFloat(use.qty)||0);
    const okInv = await saveInventory();
    if(!okInv){
      // فشل الحفظ أو تعارض — setData بيبقى وضح السبب في التوست بتاعه، ومتكملش
      render();
      return;
    }
  }
  e.materialsUsed = (e.materialsUsed||[]).filter(u=>u.id!==useId);

  if(isLinkedRebond){
    const bm = ensureBracketMap(file);
    const t = bm.teeth[use.tooth];
    if(t){
      const idx = t.breaks.findIndex(b=>b.id===use.linkedBreakId);
      if(idx>-1) t.breaks.splice(idx,1);
    }
    if(file.financeExtras) file.financeExtras = file.financeExtras.filter(fx=>fx.id !== use.linkedBreakId);
  }

  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast(isLinkedRebond ? 'اترجعت للمخزن واتمسح السجل المرتبط' : 'اترجعت للمخزن');
  render();
}

