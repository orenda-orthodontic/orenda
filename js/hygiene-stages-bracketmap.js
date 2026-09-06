// hygiene-stages-bracketmap.js — تبويبات: النظافة، مراحل العلاج، خريطة البراكيت
// ============ HYGIENE TAB ============
const HYGIENE_LABELS = {excellent:'ممتازة', good:'جيدة', fair:'متوسطة', poor:'ضعيفة'};
const HYGIENE_CLASS = {excellent:'hyg-excellent', good:'hyg-good', fair:'hyg-fair', poor:'hyg-poor'};

function renderHygieneTab(){
  const file = state.currentPatientFile;
  const log = file.monthlyLog || [];
  const rated = log.filter(e=>e.hygieneRating).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const lastTwo = rated.slice(0,2);
  const concerning = lastTwo.length === 2 && lastTwo.every(e => e.hygieneRating==='poor' || e.hygieneRating==='fair');

  const rows = rated.map(e => `
    <div class="hygiene-row">
      <span class="hygiene-date">${escapeHtml(e.date||'')}</span>
      <span class="hygiene-chip ${HYGIENE_CLASS[e.hygieneRating]}">${HYGIENE_LABELS[e.hygieneRating]}</span>
    </div>
  `).join('');

  return `
    <div class="section-title">نظافة الأسنان</div>
    <div class="placeholder" style="text-align:right;padding:10px;margin-bottom:14px;">التقييم بيتسجل من تبويب المتابعة الشهرية لكل شهر</div>
    ${concerning ? `<div class="bracket-alert">⚠ آخر تقييمين لنظافة الأسنان متوسطة/ضعيفة — يستحق التنبيه على المريض</div>` : ''}
    <div class="hygiene-list">
      ${rows || '<div class="placeholder">لسه مفيش تقييم نظافة مسجل</div>'}
    </div>
  `;
}

// ============ TREATMENT STAGES TAB ============
function computeStageCounts(file){
  const counts = {};
  TREATMENT_STAGES.forEach(st => counts[st.id] = []);
  (file.monthlyLog||[]).forEach(e=>{
    (e.stages||[]).forEach(sid=>{
      if(counts[sid]) counts[sid].push(e);
    });
  });
  return counts;
}

function renderStagesTab(){
  const file = state.currentPatientFile;
  const counts = computeStageCounts(file);
  const ALERT_THRESHOLD = 4;

  const cards = TREATMENT_STAGES.map(st=>{
    const entries = [...(counts[st.id]||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    const n = entries.length;
    let dragging, draggingMsg;
    if(MIDLINE_STAGE_IDS.includes(st.id)){
      const dated = entries.map(e=>e.date).filter(Boolean).sort();
      const firstDate = dated[0];
      if(firstDate){
        const months = monthsSince(firstDate);
        dragging = n>0 && months >= MIDLINE_ALERT_MONTHS;
        draggingMsg = `⚠ المرحلة دي مستمرة من ${months} شهر تقريبًا — تستحق مراجعة الخطة`;
      } else {
        dragging = false;
      }
    } else {
      dragging = n >= ALERT_THRESHOLD;
      draggingMsg = `⚠ المرحلة دي طالت (${n} مرات) — تستحق مراجعة الخطة`;
    }
    const chips = entries.map(e => `
      <span class="stage-date-chip">
        <input type="date" class="stage-date-input" data-entry="${e.id}" value="${escapeHtml(e.date||'')}">
        <button class="stage-date-remove" data-entry="${e.id}" data-stage="${st.id}" title="إلغاء تسجيل المرحلة دي">×</button>
      </span>
    `).join('');
    return `
      <div class="stage-card ${dragging?'dragging':''}">
        <div class="stage-card-head">
          <div class="stage-name">${st.label}</div>
          <div class="stage-count">${n}</div>
        </div>
        ${dragging ? `<div class="bracket-alert" style="margin:8px 0 0;">${draggingMsg}</div>` : ''}
        ${TOOTH_LEVEL_STAGE_IDS.includes(st.id) ? renderStageToothBreakdown(file, st.id) : ''}
        ${n ? `<div class="stage-dates">${chips}</div>` : `<div class="placeholder" style="margin-top:8px;">لسه مفيش تسجيل للمرحلة دي</div>`}
        <div class="row" style="margin-top:10px;">
          <button class="secondary small stage-add-btn" data-stage="${st.id}">+ إضافة تسجيل (وعدّل تاريخه)</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="section-title">مراحل العلاج</div>
    <div class="placeholder" style="text-align:right;padding:10px;margin-bottom:14px;">العداد بيتحدث تلقائيًا من تسجيلات المتابعة الشهرية — ممكن كمان تعدّل تاريخ أي تسجيل هنا مباشرة أو تضيف تسجيل قديم/جديد</div>
    <div class="stage-grid">${cards}</div>
  `;
}

async function addStageOccurrence(stageId){
  const file = state.currentPatientFile;
  if(!file.monthlyLog) file.monthlyLog = [];
  const today = todayStr();
  file.monthlyLog.push({ id: uid(), date: today, done:'', plan:'', stages: [stageId] });
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('اتضاف تسجيل — عدّل تاريخه لو محتاج شهر قبل كده');
  render();
}

async function removeStageTag(entryId, stageId){
  const file = state.currentPatientFile;
  const e = (file.monthlyLog||[]).find(x=>x.id===entryId);
  if(!e) return;
  e.stages = (e.stages||[]).filter(s=>s!==stageId);
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  render();
}

function attachStagesHandlers(){
  document.querySelectorAll('.stage-date-input').forEach(el=>{
    el.onchange = async () => {
      await updateMonthlyEntry(el.dataset.entry, {date: el.value});
      render();
    };
  });
  document.querySelectorAll('.stage-date-remove').forEach(el=>{
    el.onclick = () => removeStageTag(el.dataset.entry, el.dataset.stage);
  });
  document.querySelectorAll('.stage-add-btn').forEach(el=>{
    el.onclick = () => addStageOccurrence(el.dataset.stage);
  });
}

// ============ BRACKET MAP TAB ============
const FDI_TEETH_ROWS = {
  upper: ['18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28'],
  lower: ['48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38']
};

function ensureBracketMap(file){
  if(!file.bracketMap) file.bracketMap = { teeth: {} };
  if(!file.bracketMap.teeth) file.bracketMap.teeth = {};
  [...FDI_TEETH_ROWS.upper, ...FDI_TEETH_ROWS.lower].forEach(t=>{
    if(!file.bracketMap.teeth[t]) file.bracketMap.teeth[t] = { status:'green', breaks: [] };
  });
  return file.bracketMap;
}

function renderToothBox(num, data){
  const broken = data.status === 'broken';
  const count = data.breaks.length;
  const repeat = count >= 2;
  return `
    <div class="tooth ${broken?'broken':''} ${repeat?'repeat':''}" data-tooth="${num}" title="${broken?'مكسور':'سليم'} — عدد مرات الكسر: ${count}">
      ${count>0 ? `<span class="badge">${count}</span>` : ''}
      ${fdiToPalmer(num)}
    </div>
  `;
}

function renderBracketsTab(){
  const file = state.currentPatientFile;
  const bm = ensureBracketMap(file);
  const teeth = bm.teeth;
  const allNums = [...FDI_TEETH_ROWS.upper, ...FDI_TEETH_ROWS.lower];
  const brokenNow = allNums.filter(n=>teeth[n].status==='broken').length;
  const totalBreaks = allNums.reduce((s,n)=>s+teeth[n].breaks.length,0);
  const repeatTeeth = allNums.filter(n=>teeth[n].breaks.length>=2);

  const upperRow = FDI_TEETH_ROWS.upper.map((n,i)=> (i===8?'<div class="quad-gap"></div>':'') + renderToothBox(n, teeth[n])).join('');
  const lowerRow = FDI_TEETH_ROWS.lower.map((n,i)=> (i===8?'<div class="quad-gap"></div>':'') + renderToothBox(n, teeth[n])).join('');

  let logRows = [];
  allNums.forEach(n=>{
    teeth[n].breaks.forEach(b=>{ logRows.push({tooth:n, ...b}); });
  });
  logRows.sort((a,b)=> (b.date||'').localeCompare(a.date||''));

  const logHtml = logRows.length ? `
    <table>
      <thead><tr><th>التاريخ</th><th>السن</th><th>الرسوم</th><th></th></tr></thead>
      <tbody>
        ${logRows.map(r=>`
          <tr>
            <td>${escapeHtml(r.date||'')}</td>
            <td>${fdiToPalmer(r.tooth)}</td>
            <td class="${r.charged?'charge-yes':'charge-no'}">${r.charged? '300 جنيه' : '—'}</td>
            <td><button class="danger small" data-del-break="${r.id}" data-tooth="${r.tooth}">حذف</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : `<div class="placeholder" style="margin-top:10px;">لسه مفيش كسور مسجلة</div>`;

  return `
    <div class="bracket-summary">
      <div class="bracket-stat"><div class="num">${brokenNow}</div><div class="lbl">مكسور حاليًا</div></div>
      <div class="bracket-stat"><div class="num">${totalBreaks}</div><div class="lbl">إجمالي مرات الكسر</div></div>
      <div class="bracket-stat"><div class="num">${repeatTeeth.length}</div><div class="lbl">أسنان بتتكسر بتكرار</div></div>
    </div>
    ${repeatTeeth.length ? `<div class="bracket-alert">⚠ تنبيه: السن رقم ${repeatTeeth.join('، ')} بيتكسر بشكل متكرر</div>` : ''}
    <div class="tooth-arch">
      <div class="arch-label">الفك العلوي (Upper)</div>
      <div class="tooth-row">${upperRow}</div>
    </div>
    <div class="tooth-arch">
      <div class="arch-label">الفك السفلي (Lower)</div>
      <div class="tooth-row">${lowerRow}</div>
    </div>
    <div class="placeholder" style="text-align:right;padding:10px;">دوس على السن عشان تسجل كسر، ودوس تاني عشان تسجله سليم بعد الإصلاح</div>
    <div class="break-log">
      <div class="section-title" style="font-size:13px;">سجل الكسور</div>
      ${logHtml}
    </div>
  `;
}

async function toggleTooth(num){
  const file = state.currentPatientFile;
  const bm = ensureBracketMap(file);
  const t = bm.teeth[num];
  if(t.status === 'green'){
    const isFirstBreak = t.breaks.length === 0;
    const charged = !isFirstBreak;
    const breakId = uid();
    const today = todayStr();
    t.breaks.push({ id: breakId, date: today, charged });
    t.status = 'broken';
    if(charged){
      if(!file.financeExtras) file.financeExtras = [];
      file.financeExtras.push({ id: breakId, amount: 300, reason: `كسر بريكت متكرر - سن ${fdiToPalmer(num)}`, date: today });
    }
    await savePatientFile(state.currentPatientId, stripHelperFields(file));
    toast(charged ? `اتسجل كسر السن ${fdiToPalmer(num)} + 300 جنيه` : `اتسجل كسر السن ${fdiToPalmer(num)}`);
  } else {
    if(!(await confirmModal(`تأكيد إن السن ${fdiToPalmer(num)} اتصلح؟`))) return;
    t.status = 'green';
    await savePatientFile(state.currentPatientId, stripHelperFields(file));
    toast(`السن ${fdiToPalmer(num)} رجع سليم`);
  }
  render();
}

async function deleteBreakEntry(tooth, breakId){
  if(!(await confirmModal('حذف سجل الكسر ده؟ ده هيشيل معاه أي رسوم مرتبطة في الحسابات، ولو الكسر ده كان جاي من "rebonding" في المتابعة الشهرية هيرجع الكمية المخصومة للمخزن تلقائي.', {danger:true}))) return;
  const file = state.currentPatientFile;
  const bm = ensureBracketMap(file);
  const t = bm.teeth[tooth];
  const idx = t.breaks.findIndex(b=>b.id===breakId);
  if(idx>-1) t.breaks.splice(idx,1);
  if(file.financeExtras) file.financeExtras = file.financeExtras.filter(e=>e.id !== breakId);

  // if this break was created via a "rebonding" keyword match in Monthly Follow-up, undo that side too:
  // restore the stock it deducted and remove the tag from that entry's materials-used list
  let inventoryChanged = false;
  (file.monthlyLog||[]).forEach(entry=>{
    if(!entry.materialsUsed) return;
    const linked = entry.materialsUsed.find(u=>u.linkedBreakId === breakId);
    if(linked){
      const item = state.inventory.find(i=>i.id === linked.itemId);
      if(item){ item.qty = (parseFloat(item.qty)||0) + (parseFloat(linked.qty)||0); inventoryChanged = true; }
      entry.materialsUsed = entry.materialsUsed.filter(u=>u.linkedBreakId !== breakId);
    }
  });
  if(inventoryChanged) await saveInventory();

  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('اتحذف السجل');
  render();
}

function attachBracketsHandlers(){
  document.querySelectorAll('.tooth').forEach(el=>{
    el.onclick = () => toggleTooth(el.dataset.tooth);
  });
  document.querySelectorAll('[data-del-break]').forEach(el=>{
    el.onclick = (e) => { e.stopPropagation(); deleteBreakEntry(el.dataset.tooth, el.dataset.delBreak); };
  });
}

