// advanced-stage-keywords.js — اكتشاف كلمات مراحل العلاج (Canine/Incisors Retraction, Distalization,
// Intrusion, De-rotation, Midline Correction) في "اللي اتعمل" بالمتابعة الشهرية، وتسجيلها تلقائي
// في تبويب "مراحل العلاج" — بنفس أسلوب bonding-newcase.js / keyword-deduction.js: كل نوع كلمة له
// "handled flag" خاص بكل تسجيل شهري (entry) عشان تعديل نفس النص تاني ما يسألش/يسجلش مرة تانية.
const CANINE_RETRACTION_RE = /canine\s*retraction/i;
const INCISORS_RETRACTION_RE = /incisors?\s*retraction/i;
const DISTALIZATION_RE = /distali[sz]ation/i;
const INTRUSION_RE = /\bintrusion\b/i;
const DEROTATION_RE = /de-?\s*rotation/i;
const MIDLINE_RE = /midline(\s*correction)?/i;
const UPPER_WORD_RE = /\bupper\b/i;
const LOWER_WORD_RE = /\blower\b/i;
 
// same idea as extractBondingLine() in bonding-newcase.js — isolates just the line containing the
// keyword, so an unrelated "upper"/"lower" typed elsewhere in the note isn't picked up by mistake.
function extractKeywordLine(text, keywordRe){
  const m = keywordRe.exec(text);
  if(!m) return '';
  const before = text.lastIndexOf('\n', m.index);
  const afterIdx = text.indexOf('\n', m.index);
  const start = before === -1 ? 0 : before + 1;
  const end = afterIdx === -1 ? text.length : afterIdx;
  return text.slice(start, end);
}
 
// same as extractKeywordLine but returns EVERY line that mentions the keyword, not just the
// first — needed for keywords (Incisors Retraction / Midline) that can be typed once per arch
// on separate lines in the same monthly note (e.g. "upper incisors retraction" on one line and
// "lower incisors retraction" on another), so each arch's "upper"/"lower" word is picked up
// from its own line instead of only ever looking at the first matching line.
function extractAllKeywordLines(text, keywordRe){
  if(!text) return [];
  return text.split('\n').filter(line => keywordRe.test(line));
}
 
function addStageTag(e, stageId){
  if(!e.stages) e.stages = [];
  if(!e.stages.includes(stageId)) e.stages.push(stageId);
}
 
// ---- per-tooth occurrence log (canine retraction + de-rotation), same spirit as bracketMap.teeth[n].breaks
function stageToothLogArr(file, stageId){
  if(!file.stageTeeth) file.stageTeeth = {};
  if(!file.stageTeeth[stageId]) file.stageTeeth[stageId] = [];
  return file.stageTeeth[stageId];
}
function logStageTooth(file, stageId, tooth, date, entryId){
  const arr = stageToothLogArr(file, stageId);
  arr.push({ id: uid(), tooth: String(tooth), date: date || todayStr(), entryId });
}
function renderStageToothBreakdown(file, stageId){
  const arr = (file.stageTeeth && file.stageTeeth[stageId]) || [];
  if(!arr.length) return '';
  const counts = {};
  arr.forEach(o=>{ counts[o.tooth] = (counts[o.tooth]||0) + 1; });
  const teeth = Object.keys(counts).sort();
  return `
    <div class="stage-dates" style="margin-top:8px;">
      ${teeth.map(t=>`<span class="stage-date-chip" style="padding:4px 10px;">${fdiToPalmer(t)} × ${counts[t]}</span>`).join('')}
    </div>
  `;
}
 
// ---- tiny tooth-picker modal (multi-select), visually reusing the .tooth boxes from the bracket map
function pickTeethModal(title, subtitle, teethNums){
  return new Promise(resolve=>{
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    const selected = new Set();
    const upperTeeth = teethNums.filter(n => FDI_TEETH_ROWS.upper.includes(n));
    const lowerTeeth = teethNums.filter(n => FDI_TEETH_ROWS.lower.includes(n));
    const toothHtml = (n) => `<div class="tooth pick-tooth" data-tooth="${n}">${fdiToPalmer(n)}</div>`;
    bg.innerHTML = `
      <div class="modal">
        <h3>${escapeHtml(title)}</h3>
        ${subtitle ? `<div class="placeholder" style="text-align:right;padding:10px;margin-bottom:14px;">${escapeHtml(subtitle)}</div>` : ''}
        ${upperTeeth.length ? `<div class="tooth-row" style="margin-bottom:10px;">${upperTeeth.map(toothHtml).join('')}</div>` : ''}
        ${lowerTeeth.length ? `<div class="tooth-row">${lowerTeeth.map(toothHtml).join('')}</div>` : ''}
        <div class="modal-actions">
          <button class="secondary" id="pickTeethCancelBtn">إلغاء</button>
          <button id="pickTeethOkBtn">تأكيد</button>
        </div>
      </div>
    `;
    document.body.appendChild(bg);
    bg.querySelectorAll('.pick-tooth').forEach(el=>{
      el.onclick = () => {
        const n = el.dataset.tooth;
        if(selected.has(n)){ selected.delete(n); el.classList.remove('selected'); }
        else { selected.add(n); el.classList.add('selected'); }
      };
    });
    let done = false;
    const finish = (result) => { if(done) return; done = true; bg.remove(); resolve(result); };
    document.getElementById('pickTeethCancelBtn').onclick = () => finish(null);
    document.getElementById('pickTeethOkBtn').onclick = () => finish(selected.size ? [...selected] : null);
    bg.onclick = (e) => { if(e.target === bg) finish(null); };
  });
}
 
// mirrored convention (same as the rest of the app, via FDI_TEETH_ROWS/fdiToPalmer): quadrants
// 1/2 (upper row) vs 3/4 (lower row) — so e.g. '13' displays as UL3, '43' as LL3, matching the
// same notation used everywhere else in the bracket/reveal charts.
const CANINE_TEETH = ['13','23','33','43'];
function isUpperTooth(fdi){ return FDI_TEETH_ROWS.upper.includes(String(fdi)); }
 
async function handleCanineRetraction(file, e, entryId){
  const picked = await pickTeethModal('Canine Retraction', 'اختار أي ناب اتسحب الشهر ده (تقدر تختار أكتر من واحد)', CANINE_TEETH);
  if(!picked) return; // cancelled — will ask again on next edit
  picked.forEach(tooth=>{
    const stageId = isUpperTooth(tooth) ? 'canine_retraction_upper' : 'canine_retraction_lower';
    addStageTag(e, stageId);
    logStageTooth(file, stageId, tooth, e.date, entryId);
  });
  e.canineRetractionHandled = true;
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('اتسجلت Canine Retraction في مراحل العلاج');
  render();
}
 
async function handleIncisorsRetraction(file, e, entryId, text){
  const lines = extractAllKeywordLines(text, INCISORS_RETRACTION_RE);
  let upper = false, lower = false;
  lines.forEach(line=>{
    if(UPPER_WORD_RE.test(line)) upper = true;
    if(LOWER_WORD_RE.test(line)) lower = true;
  });
  if(!upper && !lower) return; // not enough info yet — wait for "upper"/"lower" to be added
  if(upper) addStageTag(e, 'incisors_retraction_upper');
  if(lower) addStageTag(e, 'incisors_retraction_lower');
  e.incisorsRetractionHandled = true;
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('اتسجلت Incisors Retraction في مراحل العلاج');
  render();
}
 
async function handleDistalization(file, e, entryId){
  const pick = await askChoice('Distalization', 'يمين ولا شمال ولا الاتنين؟', [
    { value:'right', label:'يمين (Right)' },
    { value:'left', label:'شمال (Left)' },
    { value:'both', label:'الاتنين (Both)' }
  ]);
  if(!pick) return;
  addStageTag(e, 'distalization_' + pick);
  e.distalizationHandled = true;
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('اتسجلت Distalization في مراحل العلاج');
  render();
}
 
async function handleIntrusion(file, e, entryId){
  const pick = await askChoice('Intrusion', 'فوق ولا تحت؟', [
    { value:'upper', label:'فوق (Upper)' },
    { value:'lower', label:'تحت (Lower)' }
  ]);
  if(!pick) return;
  addStageTag(e, 'intrusion_' + pick);
  e.intrusionHandled = true;
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('اتسجلت Intrusion في مراحل العلاج');
  render();
}
 
async function handleDerotation(file, e, entryId){
  const allTeeth = [...FDI_TEETH_ROWS.upper, ...FDI_TEETH_ROWS.lower];
  const picked = await pickTeethModal('De-rotation', 'اختار أي سن اترتّب الشهر ده (تقدر تختار أكتر من واحد)', allTeeth);
  if(!picked) return;
  addStageTag(e, 'derotation');
  picked.forEach(tooth => logStageTooth(file, 'derotation', tooth, e.date, entryId));
  e.derotationHandled = true;
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('اتسجلت De-rotation في مراحل العلاج');
  render();
}
 
async function handleMidline(file, e, entryId, text){
  const lines = extractAllKeywordLines(text, MIDLINE_RE);
  let upper = false, lower = false;
  lines.forEach(line=>{
    if(UPPER_WORD_RE.test(line)) upper = true;
    if(LOWER_WORD_RE.test(line)) lower = true;
  });
  if(!upper && !lower) return;
  if(upper) addStageTag(e, 'midline_upper');
  if(lower) addStageTag(e, 'midline_lower');
  e.midlineHandled = true;
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('اتسجلت Midline Correction في مراحل العلاج');
  render();
}
 
async function scanAdvancedStages(entryId, text){
  if(!text) return;
  const file = state.currentPatientFile;
  const e = (file.monthlyLog||[]).find(x=>x.id===entryId);
  if(!e) return;
 
  if(CANINE_RETRACTION_RE.test(text) && !e.canineRetractionHandled){
    await handleCanineRetraction(file, e, entryId);
  }
  if(INCISORS_RETRACTION_RE.test(text) && !e.incisorsRetractionHandled){
    await handleIncisorsRetraction(file, e, entryId, text);
  }
  if(DISTALIZATION_RE.test(text) && !e.distalizationHandled){
    await handleDistalization(file, e, entryId);
  }
  if(INTRUSION_RE.test(text) && !e.intrusionHandled){
    await handleIntrusion(file, e, entryId);
  }
  if(DEROTATION_RE.test(text) && !e.derotationHandled){
    await handleDerotation(file, e, entryId);
  }
  if(MIDLINE_RE.test(text) && !e.midlineHandled){
    await handleMidline(file, e, entryId, text);
  }
}
 
