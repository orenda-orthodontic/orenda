// advanced-stage-keywords.js — أدوات مراحل العلاج المشتركة: تسجيل حدوث لكل سن (Canine
// Retraction / De-rotation)، ونافذة اختيار الأسنان. الاكتشاف من كلمات في النص اتشال —
// التسجيل بقى بزراير/تيكات في تبويب المتابعة الشهرية (followup-tab.js: toggleMonthlyStage).

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

// ---- tooth-picker modal (multi-select) — same look as the inventory reveal chart: real tooth
// shapes (toothShapeSvg), the midline gap between the two sides of each arch, and no wisdom
// teeth (chart stops at position 7). Used by Rebonding / Canine Retraction / De-rotation.
function pickTeethModal(title, subtitle, teethNums){
  return new Promise(resolve=>{
    ensureToothShapeStyles();
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    const selected = new Set();
    const pool = teethNums.map(String).filter(n => !WISDOM_TEETH.includes(n));
    // keep the same left-to-right order the inventory chart uses, whatever order the caller passed
    const upperTeeth = FDI_TEETH_ROWS.upper.filter(n => pool.includes(n));
    const lowerTeeth = FDI_TEETH_ROWS.lower.filter(n => pool.includes(n));
    const toothHtml = (n) => `<div class="tooth tooth-shaped pick-tooth" data-tooth="${n}" title="${fdiToPalmer(n)}">${toothShapeSvg(n)}<span class="tnum">${fdiToPalmer(n)}</span></div>`;
    // midline gap wherever the row switches from one side (quadrant) to the other
    const rowHtml = (list) => list.map((n,i)=> (i>0 && n[0] !== list[i-1][0] ? '<div class="quad-gap"></div>' : '') + toothHtml(n)).join('');
    bg.innerHTML = `
      <div class="modal pick-teeth" style="max-width:560px;width:95%;">
        <h3>${escapeHtml(title)}</h3>
        ${subtitle ? `<div class="placeholder" style="text-align:right;padding:10px;margin-bottom:14px;">${escapeHtml(subtitle)}</div>` : ''}
        ${upperTeeth.length ? `<div class="tooth-arch"><div class="arch-label">الفك العلوي (Upper)</div><div class="tooth-row">${rowHtml(upperTeeth)}</div></div>` : ''}
        ${lowerTeeth.length ? `<div class="tooth-arch"><div class="arch-label">الفك السفلي (Lower)</div><div class="tooth-row">${rowHtml(lowerTeeth)}</div></div>` : ''}
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
const CANINE_TEETH_UPPER = ['13','23'];
const CANINE_TEETH_LOWER = ['33','43'];
function isUpperTooth(fdi){ return FDI_TEETH_ROWS.upper.includes(String(fdi)); }
