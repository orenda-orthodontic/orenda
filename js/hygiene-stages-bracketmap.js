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

  // registered stages (at least one entry) float to the top; stages with nothing recorded yet
  // sink to the bottom. Array.sort is stable, so within each group the original TREATMENT_STAGES
  // order is preserved.
  const orderedStages = [...TREATMENT_STAGES].sort((a, b) => {
    const aHas = (counts[a.id] || []).length > 0 ? 0 : 1;
    const bHas = (counts[b.id] || []).length > 0 ? 0 : 1;
    return aHas - bHas;
  });

  const cards = orderedStages.map(st=>{
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

// Bracket Map only — ضروس العقل (18/28/38/48) اتشالت من العرض لأنها مش بتتركب عليها فصوص.
// FDI_TEETH_ROWS نفسها سايبها زي ما هي لأن ملفات تانية بتعتمد عليها (شارت الـ de-rotation،
// واشتقاق أسنان شارت الريفيل في data-loading.js) — التقسيمة دي للعرض بس.
const WISDOM_TEETH = ['18','28','38','48'];
const BRACKET_MAP_TEETH_ROWS = {
  upper: FDI_TEETH_ROWS.upper.filter(n => !WISDOM_TEETH.includes(n)),
  lower: FDI_TEETH_ROWS.lower.filter(n => !WISDOM_TEETH.includes(n))
};

// ============ TOOTH SHAPES (SVG) ============
// أشكال أسنان حقيقية بدل المربعات. الشكل بيتحدد من آخر رقم في الـ FDI:
// 1،2 = قواطع | 3 = ناب | 4،5 = ضواحك | 6،7،8 = طواحن
// الرسمة متعملة والحافة القاطعة/السطح الطاحن لتحت (فك علوي)، والفك السفلي بيتقلب 180°
// عشان الأسطح تبقى مواجهة بعض زي الفم الحقيقي.
const TOOTH_SHAPE_PATHS = {
  incisor:  'M8,7 Q6,26 7,39 Q20,45 33,39 Q34,26 32,7 Q20,3 8,7 Z',
  canine:   'M9,7 Q7,27 10,37 L20,46 L30,37 Q33,27 31,7 Q20,3 9,7 Z',
  premolar: 'M8,8 Q5,26 8,37 Q13,43 20,39 Q27,43 32,37 Q35,26 32,8 Q20,3 8,8 Z',
  molar:    'M5,8 Q2,26 6,37 Q11,43 15,38 Q20,43 25,38 Q29,43 34,37 Q38,26 35,8 Q20,3 5,8 Z'
};
function toothShapeKey(fdiNum){
  const pos = String(fdiNum).slice(-1);
  if(pos === '1' || pos === '2') return 'incisor';
  if(pos === '3') return 'canine';
  if(pos === '4' || pos === '5') return 'premolar';
  return 'molar';
}
function isUpperFdi(fdiNum){
  const q = String(fdiNum).charAt(0);
  return q === '1' || q === '2';
}
function toothShapeSvg(fdiNum){
  const d = TOOTH_SHAPE_PATHS[toothShapeKey(fdiNum)];
  const flip = isUpperFdi(fdiNum) ? '' : ' transform="rotate(180 20 25)"';
  return `<svg class="tsvg" viewBox="0 0 40 50" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path d="${d}"${flip}/></svg>`;
}

// الاستايلات بتتحقن من الجافاسكريبت مرة واحدة بدل ما نعدّل ملف الـ CSS الأساسي، عشان تفضل
// جنب الكود اللي بيستخدمها. بتيجي بعد الاستايل شيت الأساسي فبتكسب في التعارض.
function ensureToothShapeStyles(){
  if(document.getElementById('toothShapeStyles')) return;
  const st = document.createElement('style');
  st.id = 'toothShapeStyles';
  st.textContent = `
    .tooth.tooth-shaped{background:transparent!important;border:none!important;box-shadow:none!important;
      padding:0!important;width:34px;flex:0 0 auto;display:flex;flex-direction:column;align-items:center;
      gap:1px;position:relative;cursor:pointer;line-height:1;}
    .tooth.tooth-shaped .tsvg{width:100%;height:auto;display:block;overflow:visible;}
    .tooth.tooth-shaped .tsvg path{fill:#ffffff;stroke:#b9b3a3;stroke-width:2;
      stroke-linejoin:round;transition:fill .15s,stroke .15s;}
    .tooth.tooth-shaped:hover .tsvg path{fill:#f2eee2;}
    .tooth.tooth-shaped.broken .tsvg path{fill:#e05c50;stroke:#a83227;}
    .tooth.tooth-shaped.repeat .tsvg path{stroke:#a83227;stroke-width:3;stroke-dasharray:4 3;}
    .tooth.tooth-shaped.low-refill .tsvg path{fill:#f3c969;stroke:#c2951f;}
    .tooth.tooth-shaped .tnum{font-size:9.5px;font-weight:700;color:var(--muted);white-space:nowrap;}
    .tooth.tooth-shaped .badge{position:absolute;top:-3px;inset-inline-end:-3px;background:#a83227;color:#fff;
      font-size:9px;min-width:14px;height:14px;border-radius:7px;display:flex;align-items:center;
      justify-content:center;padding:0 3px;font-weight:700;}

    /* الشاشة المدموجة: متابعة شهرية (الأكبر) + خريطة الفصوص كبانل جنبها */
    .monthly-split{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:16px;align-items:start;}
    .monthly-split-main{min-width:0;}
    .monthly-split-side{min-width:0;position:sticky;top:110px;max-height:calc(100vh - 130px);overflow-y:auto;
      border-inline-start:1px solid var(--border);padding-inline-start:14px;}
    .monthly-split-side .tooth-row{gap:2px;}
    .monthly-split-side .tooth.tooth-shaped{flex:1 1 0;width:auto;min-width:0;max-width:30px;}
    .monthly-split-side .quad-gap{flex:0 0 7px;}
    .monthly-split-side table{font-size:12px;}
    @media (max-width:900px){
      .monthly-split{grid-template-columns:1fr;}
      .monthly-split-side{position:static;max-height:none;overflow:visible;border-inline-start:none;
        border-top:1px solid var(--border);padding-inline-start:0;padding-top:14px;}
    }
  `;
  document.head.appendChild(st);
}

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
    <div class="tooth tooth-shaped ${broken?'broken':''} ${repeat?'repeat':''}" data-tooth="${num}" title="${broken?'مكسور':'سليم'} — عدد مرات الكسر: ${count}">
      ${count>0 ? `<span class="badge">${count}</span>` : ''}
      ${toothShapeSvg(num)}
      <span class="tnum">${fdiToPalmer(num)}</span>
    </div>
  `;
}

function renderBracketsTab(opts){
  const compact = !!(opts && opts.compact);
  ensureToothShapeStyles();
  const file = state.currentPatientFile;
  const bm = ensureBracketMap(file);
  const teeth = bm.teeth;
  // الإحصائيات والسجل بيتحسبوا على كل الأسنان (بما فيها العقل) عشان أي بيانات قديمة اتسجلت
  // على ضرس عقل قبل ما يتشال من الشارت متختفيش من السجل — الرسمة نفسها بس هي اللي بتستثنيه
  const allNums = [...FDI_TEETH_ROWS.upper, ...FDI_TEETH_ROWS.lower];
  const brokenNow = allNums.filter(n=>teeth[n].status==='broken').length;
  const totalBreaks = allNums.reduce((s,n)=>s+teeth[n].breaks.length,0);
  const repeatTeeth = allNums.filter(n=>teeth[n].breaks.length>=2);

  const upperNums = BRACKET_MAP_TEETH_ROWS.upper;
  const lowerNums = BRACKET_MAP_TEETH_ROWS.lower;
  const gapIdx = upperNums.length/2; // الخط المنصّف — بين 11 و21 فوق، و41 و31 تحت
  const upperRow = upperNums.map((n,i)=> (i===gapIdx?'<div class="quad-gap"></div>':'') + renderToothBox(n, teeth[n])).join('');
  const lowerRow = lowerNums.map((n,i)=> (i===gapIdx?'<div class="quad-gap"></div>':'') + renderToothBox(n, teeth[n])).join('');

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
    ${compact ? '<div class="section-title">خريطة الفصوص</div>' : ''}
    <div class="bracket-summary">
      <div class="bracket-stat"><div class="num">${brokenNow}</div><div class="lbl">مكسور حاليًا</div></div>
      <div class="bracket-stat"><div class="num">${totalBreaks}</div><div class="lbl">إجمالي مرات الكسر</div></div>
      <div class="bracket-stat"><div class="num">${repeatTeeth.length}</div><div class="lbl">أسنان بتتكسر بتكرار</div></div>
    </div>
    ${repeatTeeth.length ? `<div class="bracket-alert">⚠ تنبيه: السن رقم ${repeatTeeth.map(fdiToPalmer).join('، ')} بيتكسر بشكل متكرر</div>` : ''}
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
  if(inventoryChanged){
    const okInv = await saveInventory();
    if(!okInv){
      // فشل الحفظ أو تعارض — setData بيبقى وضح السبب في التوست بتاعه، فمنكملش نحذف سجل الكسر
      // وسجل الحسابات بناءً على إرجاع مخزون اتلغى
      render();
      return;
    }
  }

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
