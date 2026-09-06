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
  {id:'midline_lower', label:'Midline Correction Lower'}
];
const MIDLINE_STAGE_IDS = ['midline_upper', 'midline_lower'];
const MIDLINE_ALERT_MONTHS = 2;
// stages where each occurrence is tied to a specific tooth (canines + de-rotation) — the Stages
// tab shows a per-tooth breakdown for these (see advanced-stage-keywords.js)
const TOOTH_LEVEL_STAGE_IDS = ['canine_retraction_upper', 'canine_retraction_lower', 'derotation'];

function renderMonthEntry(e){
  const stages = e.stages || [];
  const stageTags = TREATMENT_STAGES.map(st => `
    <label class="stage-tag ${stages.includes(st.id)?'checked':''}">
      <input type="checkbox" class="monthly-stage-cb" data-id="${e.id}" data-stage="${st.id}" ${stages.includes(st.id)?'checked':''}>
      ${st.label}
    </label>
  `).join('');

  const usedList = (e.materialsUsed || []).map(u => `
    <span class="stage-date-chip">
      ${escapeHtml(u.itemName)} × ${u.qty}
      <button class="stage-date-remove" data-remove-material="${e.id}|${u.id}" title="إلغاء وإرجاع للمخزن">×</button>
    </span>
  `).join('');

  return `
    <div class="month-entry" data-entry-id="${e.id}">
      <div class="month-entry-head">
        <input type="date" class="monthly-date" data-id="${e.id}" value="${escapeHtml(e.date||'')}">
        <button class="danger small monthly-delete" data-id="${e.id}">حذف</button>
      </div>
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
      <div class="stage-tags">${stageTags}</div>
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
      <div class="lbl">خامات اتخصمت من المخزن تلقائي (من الكلمات المفتاحية اللي كتبتها فوق)</div>
      ${usedList ? `<div class="stage-tags" style="margin-bottom:8px;">${usedList}</div>` : `<div class="placeholder" style="padding:8px;">لسه مفيش خصم — اكتب كلمة زي "wire 0.012" أو "rebonding 11" أو "bracket roth" في خانة "اللي اتعمل" وهيتعرف عليها لوحده</div>`}
    </div>
  `;
}

function renderMonthlyTab(){
  const file = state.currentPatientFile;
  const log = file.monthlyLog || [];
  const sorted = [...log].sort((a,b)=> (b.date||'').localeCompare(a.date||''));
  const rows = sorted.map(renderMonthEntry).join('');
  const keywordsBody = `
    <div class="card" style="background:#fafaf5;margin-bottom:14px;">
      <div class="section-title" style="margin:0 0 8px;">Keywords</div>
      <div style="font-size:12.5px;line-height:1.9;color:var(--muted);">
        <div><b>سلك:</b> اكتب المقاس رقمي زي <code>0.012</code>، أو مقاس ملزوق/مسافة بالنوع زي <code>12niti</code> / <code>12 niti</code> / <code>ss16</code>، أو مستطيل زي <code>16x22</code> — مش لازم تكتب upper/lower</div>
        <div><b>ريفيل / رباط (rebonding):</b> اكتب <code>rebonding</code> أو <code>فص</code> وبعدها رقم السن FDI (زي <code>11</code>) أو Palmer (زي <code>LL2</code>) — تقدر تكتب أكتر من سن مع بعض زي <code>rebonding 11,25,LL6</code></div>
        <div><b>براكيت جديد:</b> اكتب <code>bracket roth</code> يخصم من صنف "براكيت" (ROTH) أو <code>bracket mbt</code> يخصم من صنف "براكيت" (MBT) — من غير ما تحدد رقم سن، ومش من مخزون الريفيل</div>
        <div><b>تيوب (Tube):</b> اكتب <code>tube</code> أو <code>تيوب</code> وبعدها رقم السن FDI الحقيقي (زي <code>17</code> = فوق يمين 7) أو Palmer (زي <code>UR7</code>) — لأي سن ليه صنف Tube متسجل في المخزون (مش بس أول ضرس)، وتقدر تكتب أكتر من سن مع بعض زي <code>tube 17,26</code>. برضه <code>rebonding 16</code> أو <code>rebonding 17</code> (كابيتال/سمول، بمسافة أو من غيرها) بيخصم من التيوب المسجل للسن ده تلقائي. لو الصنف مسجل من غير رقم سن، اكتب اسمه زي "أي صنف تاني" تحت</div>
        <div><b>أستك:</b> اكتب المقاس بس زي <code>5/16</code> أو <code>5\\16</code> من غير ما تكتب كلمة "إيلاستيك"</div>
        <div><b>أي صنف تاني (زي ميني سكرو، بوتن...):</b> اكتب اسم الصنف زي ما هو مسجل بالظبط في المخزون — مش فارقة كابيتال/سمول ولا المسافات</div>
        <div><b>حالة جديدة:</b> اكتب <code>NEW CASE</code> بأي شكل (كابيتال/سمول، بسبيس أو من غيره) وهتتسجل تلقائي في تحليل الحالات الجديدة للشهر ده — أو استخدم زرار "🆕 حالة جديدة" اللي فوق اسم المريض يدويًا</div>
        <div><b>Bonding Upper:</b> اكتب <code>bonding upper</code> بأي شكل — هيسألك نوع البراكيت (ROTH/MBT) ويخصمه ويسجله كنوع براكيت المريض. لو كتبت في نفس السطر رقم سن <code>16</code>/<code>26</code> أو Palmer <code>UR6</code>/<code>UL6</code> هيخصم التيوب المناسب أوتوماتيك من غير ما يسألك — لو كتبت <code>palmer</code> هيسجلها Palmer من غير خصم — ولو مكتبتش حاجة هيسألك (Tube/Palmer/Appliance). بيخصم سلك 0.012 تلقائي دايمًا، ويسجل "حالة جديدة" للمريض ده الشهر ده</div>
        <div><b>Bonding Lower:</b> اكتب <code>bonding lower</code> بنفس الطريقة — بيفهم <code>36</code>/<code>46</code> أو Palmer <code>LL6</code>/<code>LR6</code> من نفس السطر ويخصم أوتوماتيك، أو <code>palmer</code>، ولو مفيش حاجة مكتوبة هيسألك — من غير ما يلمس نوع البراكيت أو السلك أو حالة جديدة</div>
        <div style="margin-top:8px;"><b>مراحل العلاج — بتتسجل لوحدها من كلمة في النص:</b></div>
        <div><b>Canine Retraction:</b> بيفتح شارت للأنياب الأربعة بس، تختار أي ناب اتسحب — بيحدد فوق/تحت لوحده من السن</div>
        <div><b>Incisors Retraction:</b> اكتب <code>upper</code> و/أو <code>lower</code> في نفس السطر — كل واحدة بتتعد لوحدها</div>
        <div><b>Distalization:</b> هيسألك يمين/شمال/الاتنين، وكل اختيار بيتعد كنقطة منفصلة</div>
        <div><b>Intrusion:</b> هيسألك فوق/تحت</div>
        <div><b>De-rotation:</b> بيفتح شارت الأسنان كله — تختار أي سن اترتّب</div>
        <div><b>Midline Correction:</b> اكتب <code>upper</code> و/أو <code>lower</code> في نفس السطر زي الـ Incisors بالظبط</div>
      </div>
    </div>
  `;
  return `
    <div class="section-title">المتابعة الشهرية</div>
    <div class="row" style="margin-bottom:14px;gap:8px;">
      <button id="addMonthlyBtn">+ إضافة متابعة جديدة</button>
      <button class="secondary small" id="toggleKeywordsBtn">🔑 Keywords</button>
    </div>
    ${state.monthlyKeywordsOpen ? keywordsBody : ''}
    <div class="month-list">
      ${rows || '<div class="placeholder">لسه مفيش متابعات مسجلة</div>'}
    </div>
  `;
}

async function addMonthlyEntry(){
  const file = state.currentPatientFile;
  if(!file.monthlyLog) file.monthlyLog = [];
  const today = todayStr();
  file.monthlyLog.push({ id: uid(), date: today, done:'', plan:'' });
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  render();
}

async function updateMonthlyEntry(id, changes){
  const file = state.currentPatientFile;
  const e = (file.monthlyLog||[]).find(x=>x.id===id);
  if(!e) return;
  Object.assign(e, changes);
  // keep any "new case" events tied to this entry (from NEW CASE keyword / bonding) in sync
  // with the entry's date — otherwise they'd stay frozen on whatever date the entry had
  // at the moment they were logged, even after you correct the entry's date afterwards.
  if(changes.date){
    (file.newCaseEvents||[]).forEach(ev=>{ if(ev.entryId === id) ev.date = changes.date; });
  }
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('اتحفظ');
}

async function deleteMonthlyEntry(id){
  if(!(await confirmModal('حذف المتابعة دي؟', {danger:true}))) return;
  const file = state.currentPatientFile;
  file.monthlyLog = (file.monthlyLog||[]).filter(x=>x.id!==id);
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  render();
}

async function toggleMonthlyStage(entryId, stageId, checked){
  const file = state.currentPatientFile;
  const e = (file.monthlyLog||[]).find(x=>x.id===entryId);
  if(!e) return;
  if(!e.stages) e.stages = [];
  if(checked){ if(!e.stages.includes(stageId)) e.stages.push(stageId); }
  else { e.stages = e.stages.filter(s=>s!==stageId); }
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  render();
}

function attachMonthlyHandlers(){
  const addBtn = document.getElementById('addMonthlyBtn');
  if(addBtn) addBtn.onclick = () => addMonthlyEntry();
  const kwBtn = document.getElementById('toggleKeywordsBtn');
  if(kwBtn) kwBtn.onclick = () => { state.monthlyKeywordsOpen = !state.monthlyKeywordsOpen; render(); };
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
        await scanAndDeductKeywords(id, combined);
        await scanNewCaseKeyword(id, combined);
        await scanBondingKeyword(id, combined);
        await scanAdvancedStages(id, combined);
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
  e.materialsUsed.push({ id: uid(), itemId: item.id, itemName: item.name, qty });

  item.qty = Math.max(0, (parseFloat(item.qty)||0) - qty);
  await saveInventory();
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
    await saveInventory();
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

