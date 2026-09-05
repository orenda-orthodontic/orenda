// diagnosis-tab.js — تبويب التشخيص
// ============ DIAGNOSIS TAB ============
function renderFieldTableRow(secId, groupId, f, showFlag, showTPFlag){
  const flagBtn = showFlag ? `<button class="danger diag-flag" data-id="${f.id}" title="نقل إلى Problem List">🚩</button>` : '';
  const tpFlagBtn = showTPFlag ? `<button class="danger diag-flag-tp" data-id="${f.id}" title="نقل إلى Treatment Plan">🚩</button>` : '';
  const optBtn = (f.options && f.options.length) ? `<button class="secondary diag-edit-options" data-sec="${secId}" data-group="${groupId||''}" data-id="${f.id}" title="تعديل الاختيارات">⚙</button>` : '';
  return `
    <tr data-field-id="${f.id}">
      <td class="lbl"><input type="text" class="diag-field-label" data-sec="${secId}" data-group="${groupId||''}" data-id="${f.id}" value="${escapeHtml(f.label)}"></td>
      <td class="val">${f.options && f.options.length ? `
        <input type="text" class="diag-field-value" list="dl-${f.id}" data-sec="${secId}" data-group="${groupId||''}" data-id="${f.id}" value="${escapeHtml(f.value)}" placeholder="اختار أو اكتب...">
        <datalist id="dl-${f.id}">${f.options.map(o=>`<option value="${escapeHtml(o)}"></option>`).join('')}</datalist>
      ` : `<textarea class="diag-field-value" data-sec="${secId}" data-group="${groupId||''}" data-id="${f.id}" placeholder="...">${escapeHtml(f.value)}</textarea>`}</td>
      <td class="act"><div class="act-buttons">${optBtn}${flagBtn}${tpFlagBtn}<button class="danger diag-field-delete" data-sec="${secId}" data-group="${groupId||''}" data-id="${f.id}">×</button></div></td>
    </tr>
  `;
}

function renderDiagnosisTab(){
  const file = state.currentPatientFile;
  const sections = file.diagnosisSections || [];
  const problemListIndex = sections.findIndex(s => s.title.trim().toLowerCase() === 'problem list and mechanics');

  function buildAccordion(s, idx){
    const groups = s.groups || [];
    const fields = s.fields || [];
    const isOpen = state.expandedDiagSections[s.id] !== false; // default open

    const showFlag = problemListIndex === -1 ? true : idx < problemListIndex;
    const isProblemSection = s.title.trim().toLowerCase() === 'problem list and mechanics';

    const groupRows = groups.map(g => `
      <tr class="diag-group-row">
        <td colspan="2"><input type="text" class="diag-group-title gname" data-sec="${s.id}" data-group="${g.id}" value="${escapeHtml(g.title)}"></td>
        <td></td>
      </tr>
      ${(g.fields||[]).map(f => renderFieldTableRow(s.id, g.id, f, showFlag, isProblemSection)).join('')}
    `).join('');

    const fieldRows = fields.map(f => renderFieldTableRow(s.id, null, f, showFlag, isProblemSection)).join('');

    const bodyHtml = isOpen ? `
      <div class="diag-acc-body">
        <table class="diag-table">
          <thead><tr><th>${escapeHtml(s.col1 || 'العنصر')}</th><th>${escapeHtml(s.col2 || 'القيمة')}</th><th></th></tr></thead>
          <tbody>
            ${groupRows}
            ${fieldRows}
          </tbody>
        </table>
        <div class="row" style="flex-wrap:wrap;margin-top:10px;">
          <button class="secondary small diag-custom-field" data-sec="${s.id}" data-group="">+ حقل</button>
          <button class="secondary small diag-custom-group" data-sec="${s.id}">+ مجموعة (زي Frontal/Lateral)</button>
          <button class="secondary small diag-rename" data-id="${s.id}">✎ تعديل اسم القسم</button>
          <button class="danger small diag-delete" data-id="${s.id}">حذف القسم</button>
        </div>
        <textarea class="diag-content" data-id="${s.id}" placeholder="ملاحظات عامة..." style="margin-top:10px;">${escapeHtml(s.content||'')}</textarea>
      </div>
    ` : '';

    return `
    <div class="diag-accordion" data-section-id="${s.id}">
      <div class="diag-acc-head ${isOpen?'open':''}" data-toggle="${s.id}">
        <span class="t">${escapeHtml(s.title)}</span>
        <span class="arrow">›</span>
      </div>
      ${bodyHtml}
    </div>
  `;
  }

  let extraHtml = null, introHtml = null;
  const othersHtml = [];
  sections.forEach((s, idx) => {
    const html = buildAccordion(s, idx);
    if(s.title === 'Extra-oral') extraHtml = html;
    else if(s.title === 'Intra-oral') introHtml = html;
    else othersHtml.push(html);
  });

  const topRow = (extraHtml || introHtml) ? `<div class="diag-side-by-side">${extraHtml||''}${introHtml||''}</div>` : '';
  const sectionsHtml = topRow + othersHtml.join('');

  return `
    <div class="section-title">شيت التشخيص وخطة العلاج</div>
    <div class="row" style="margin-bottom:14px;">
      <button class="secondary small" id="customAddBtn">+ قسم إضافي</button>
      <button class="secondary small" id="resetTemplateBtn">إعادة تعيين الشيت الافتراضي</button>
    </div>
    ${sectionsHtml}
  `;
}

function attachDiagnosisHandlers(){
  document.querySelectorAll('.diag-acc-head').forEach(el=>{
    el.onclick = () => {
      const id = el.dataset.toggle;
      const currentlyOpen = state.expandedDiagSections[id] !== false;
      state.expandedDiagSections[id] = !currentlyOpen;
      render();
    };
  });
  const resetBtn = document.getElementById('resetTemplateBtn');
  if(resetBtn) resetBtn.onclick = async () => {
    if(!(await confirmModal('هيتمسح أي حاجة كتبتها في الشيت ده وهيترجع للشيت الافتراضي الفاضي. متأكد؟', {danger:true}))) return;
    const file = state.currentPatientFile;
    file.diagnosisSections = buildDefaultDiagnosisSections();
    await savePatientFile(state.currentPatientId, stripHelperFields(file));
    render();
  };
  const customBtn = document.getElementById('customAddBtn');
  if(customBtn) customBtn.onclick = async () => {
    const title = await promptModal('اسم القسم؟', '', {label:'اسم القسم'});
    if(title && title.trim()) addDiagnosisSection(title.trim());
  };
  document.querySelectorAll('.diag-title').forEach(el=>{
    el.onchange = () => updateDiagnosisSection(el.dataset.id, {title: el.value});
  });
  document.querySelectorAll('.diag-rename').forEach(el=>{
    el.onclick = async () => {
      const s = (state.currentPatientFile.diagnosisSections||[]).find(x=>x.id===el.dataset.id);
      const title = await promptModal('اسم القسم الجديد؟', s ? s.title : '', {label:'اسم القسم'});
      if(title && title.trim()) updateDiagnosisSection(el.dataset.id, {title: title.trim()}).then(render);
    };
  });
  document.querySelectorAll('.diag-content').forEach(el=>{
    el.onchange = () => updateDiagnosisSection(el.dataset.id, {content: el.value});
  });
  document.querySelectorAll('.diag-delete').forEach(el=>{
    el.onclick = () => deleteDiagnosisSection(el.dataset.id);
  });
  document.querySelectorAll('.diag-custom-group').forEach(el=>{
    el.onclick = async () => {
      const title = await promptModal('اسم المجموعة؟', '', {label:'مثلاً Frontal', placeholder:'Frontal'});
      if(title && title.trim()) addDiagnosisGroup(el.dataset.sec, title.trim());
    };
  });
  document.querySelectorAll('.diag-group-title').forEach(el=>{
    el.onchange = () => updateDiagnosisGroup(el.dataset.sec, el.dataset.group, {title: el.value});
  });
  document.querySelectorAll('.diag-custom-field').forEach(el=>{
    el.onclick = async () => {
      const label = await promptModal('اسم الحقل؟', '', {label:'اسم الحقل'});
      if(label && label.trim()) addDiagnosisField(el.dataset.sec, el.dataset.group || null, label.trim());
    };
  });
  document.querySelectorAll('.diag-field-label').forEach(el=>{
    el.onchange = () => updateDiagnosisField(el.dataset.sec, el.dataset.group || null, el.dataset.id, {label: el.value});
  });
  document.querySelectorAll('.diag-field-value').forEach(el=>{
    el.onchange = () => updateDiagnosisField(el.dataset.sec, el.dataset.group || null, el.dataset.id, {value: el.value});
  });
  document.querySelectorAll('.diag-field-delete').forEach(el=>{
    el.onclick = () => deleteDiagnosisField(el.dataset.sec, el.dataset.group || null, el.dataset.id);
  });
  document.querySelectorAll('.diag-edit-options').forEach(el=>{
    el.onclick = () => openEditOptionsModal(el.dataset.sec, el.dataset.group || null, el.dataset.id);
  });
  document.querySelectorAll('.diag-flag').forEach(el=>{
    el.onclick = () => flagToProblemList(el.dataset.id);
  });
  document.querySelectorAll('.diag-flag-tp').forEach(el=>{
    el.onclick = () => flagToTreatmentPlan(el.dataset.id);
  });
}

function findFieldContext(file, fieldId){
  for(const s of (file.diagnosisSections||[])){
    for(const f of (s.fields||[])){
      if(f.id === fieldId) return {section: s, group: null, field: f};
    }
    for(const g of (s.groups||[])){
      for(const f of (g.fields||[])){
        if(f.id === fieldId) return {section: s, group: g, field: f};
      }
    }
  }
  return null;
}

async function flagToProblemList(fieldId){
  const valueEl = document.querySelector(`.diag-field-value[data-id="${fieldId}"]`);
  const labelEl = document.querySelector(`.diag-field-label[data-id="${fieldId}"]`);
  const value = valueEl ? valueEl.value.trim() : '';
  if(!value){ toast('اكتب القيمة الأول'); return; }
  const file = state.currentPatientFile;
  const ctx = findFieldContext(file, fieldId);
  if(!ctx) return;
  ctx.field.value = value;
  ctx.field.label = labelEl ? labelEl.value : ctx.field.label;
  const label = ctx.group ? `${ctx.group.title} - ${ctx.field.label}` : ctx.field.label;
  let problemSection = file.diagnosisSections.find(s => s.title.trim().toLowerCase() === 'problem list and mechanics');
  if(!problemSection){
    problemSection = { id: uid(), title: 'Problem List and Mechanics', groups: [], fields: [], content: '', col1: 'Problems', col2: 'Mechanics' };
    file.diagnosisSections.push(problemSection);
  }
  if(!problemSection.fields) problemSection.fields = [];
  const emptyRow = problemSection.fields.find(f => !f.label && !f.value);
  const problemText = `${label}: ${value}`;
  if(emptyRow){
    emptyRow.label = problemText;
  } else {
    problemSection.fields.push({ id: uid(), label: problemText, value: '' });
  }
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('اتضافت في Problem List');
  render();
}

async function flagToTreatmentPlan(fieldId){
  const valueEl = document.querySelector(`.diag-field-value[data-id="${fieldId}"]`);
  const labelEl = document.querySelector(`.diag-field-label[data-id="${fieldId}"]`);
  const value = valueEl ? valueEl.value.trim() : '';
  const label = labelEl ? labelEl.value.trim() : '';
  if(!label && !value){ toast('اكتب المشكلة أو الميكانيزم الأول'); return; }
  const file = state.currentPatientFile;
  const ctx = findFieldContext(file, fieldId);
  if(!ctx) return;
  ctx.field.value = value;
  ctx.field.label = label;
  let tpSection = file.diagnosisSections.find(s => s.title.trim().toLowerCase() === 'treatment plan');
  if(!tpSection){
    tpSection = { id: uid(), title: 'Treatment Plan', groups: [], fields: [], content: '' };
    file.diagnosisSections.push(tpSection);
  }
  if(!tpSection.fields) tpSection.fields = [];
  const planText = value ? `${label}: ${value}` : label;
  const emptyRow = tpSection.fields.find(f => !f.label && !f.value);
  if(emptyRow){
    emptyRow.label = planText;
  } else {
    tpSection.fields.push({ id: uid(), label: planText, value: '' });
  }
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('اتضافت في Treatment Plan');
  render();
}

async function addDiagnosisSection(title){
  const file = state.currentPatientFile;
  if(!file.diagnosisSections) file.diagnosisSections = [];
  file.diagnosisSections.push({ id: uid(), title, groups: [], fields: [], content: '' });
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  render();
}

async function updateDiagnosisSection(id, changes){
  const file = state.currentPatientFile;
  const s = (file.diagnosisSections || []).find(x=>x.id === id);
  if(!s) return;
  Object.assign(s, changes);
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('اتحفظ');
}

async function deleteDiagnosisSection(id){
  const file = state.currentPatientFile;
  file.diagnosisSections = (file.diagnosisSections || []).filter(x=>x.id !== id);
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  render();
}

async function addDiagnosisGroup(secId, title){
  const file = state.currentPatientFile;
  const s = (file.diagnosisSections || []).find(x=>x.id === secId);
  if(!s) return;
  if(!s.groups) s.groups = [];
  s.groups.push({ id: uid(), title, fields: [] });
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  render();
}

async function updateDiagnosisGroup(secId, groupId, changes){
  const file = state.currentPatientFile;
  const s = (file.diagnosisSections || []).find(x=>x.id === secId);
  if(!s) return;
  const g = (s.groups || []).find(x=>x.id === groupId);
  if(!g) return;
  Object.assign(g, changes);
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('اتحفظ');
}

function getFieldsArray(s, groupId){
  if(groupId){
    const g = (s.groups || []).find(x=>x.id === groupId);
    if(!g) return null;
    if(!g.fields) g.fields = [];
    return g.fields;
  }
  if(!s.fields) s.fields = [];
  return s.fields;
}

async function addDiagnosisField(secId, groupId, label){
  const file = state.currentPatientFile;
  const s = (file.diagnosisSections || []).find(x=>x.id === secId);
  if(!s) return;
  const arr = getFieldsArray(s, groupId);
  if(!arr) return;
  arr.push({ id: uid(), label, value: '' });
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  render();
}

async function updateDiagnosisField(secId, groupId, fieldId, changes){
  const file = state.currentPatientFile;
  const s = (file.diagnosisSections || []).find(x=>x.id === secId);
  if(!s) return;
  const arr = getFieldsArray(s, groupId);
  if(!arr) return;
  const f = arr.find(x=>x.id === fieldId);
  if(!f) return;
  Object.assign(f, changes);
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('اتحفظ');
}

async function deleteDiagnosisField(secId, groupId, fieldId){
  const file = state.currentPatientFile;
  const s = (file.diagnosisSections || []).find(x=>x.id === secId);
  if(!s) return;
  const arr = getFieldsArray(s, groupId);
  if(!arr) return;
  const idx = arr.findIndex(x=>x.id === fieldId);
  if(idx > -1) arr.splice(idx, 1);
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  render();
}

function stripHelperFields(file){
  const copy = {...file};
  delete copy._id;
  return copy;
}

function openEditOptionsModal(secId, groupId, fieldId){
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <h3>تعديل الاختيارات</h3>
      <div id="optionsListWrap"></div>
      <div class="row" style="margin-top:10px;">
        <input type="text" id="newOptionInput" placeholder="اختيار جديد..." style="flex:1;">
        <button class="secondary small" id="addOptionBtn">+ إضافة</button>
      </div>
      <div class="modal-actions">
        <button id="closeOptionsBtn">تم</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);

  function getField(){
    const file = state.currentPatientFile;
    const s = (file.diagnosisSections || []).find(x=>x.id === secId);
    if(!s) return null;
    const arr = getFieldsArray(s, groupId);
    if(!arr) return null;
    return arr.find(x=>x.id === fieldId) || null;
  }

  function renderOptionsList(){
    const f = getField();
    const wrap = bg.querySelector('#optionsListWrap');
    if(!f || !wrap) return;
    if(!f.options) f.options = [];
    wrap.innerHTML = f.options.length ? f.options.map((o, i) => `
      <div class="row" style="justify-content:space-between;margin-bottom:6px;">
        <span>${escapeHtml(o)}</span>
        <button class="danger small" data-remove-opt="${i}">×</button>
      </div>
    `).join('') : `<div class="placeholder">لسه مفيش اختيارات</div>`;
    wrap.querySelectorAll('[data-remove-opt]').forEach(el=>{
      el.onclick = async () => {
        const f2 = getField();
        if(!f2) return;
        f2.options.splice(parseInt(el.dataset.removeOpt, 10), 1);
        await savePatientFile(state.currentPatientId, stripHelperFields(state.currentPatientFile));
        renderOptionsList();
      };
    });
  }
  renderOptionsList();

  bg.querySelector('#addOptionBtn').onclick = async () => {
    const input = bg.querySelector('#newOptionInput');
    const val = input.value.trim();
    if(!val) return;
    const f = getField();
    if(!f) return;
    if(!f.options) f.options = [];
    f.options.push(val);
    await savePatientFile(state.currentPatientId, stripHelperFields(state.currentPatientFile));
    input.value = '';
    renderOptionsList();
  };
  bg.querySelector('#newOptionInput').onkeydown = (e) => {
    if(e.key === 'Enter'){ e.preventDefault(); bg.querySelector('#addOptionBtn').click(); }
  };
  bg.querySelector('#closeOptionsBtn').onclick = () => { bg.remove(); render(); };
  bg.onclick = (e) => { if(e.target === bg){ bg.remove(); render(); } };
}

function openEditPatientModal(){
  const patient = state.patients.find(p=>p.id === state.currentPatientId);
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <h3>تعديل بيانات المريض</h3>
      <div class="field">
        <label>الاسم</label>
        <input type="text" id="editPatientName" value="${escapeHtml(patient.name)}">
      </div>
      <div class="field">
        <label>رقم الموبايل (لإرسال واتساب)</label>
        <input type="text" id="editPatientPhone" value="${escapeHtml(patient.phone || '')}" placeholder="01xxxxxxxxx">
      </div>
      <div class="field">
        <label>الرقم (تلقائي)</label>
        <input type="text" id="editPatientNumber" value="${escapeHtml(patient.number || '')}" disabled>
      </div>
      <div class="modal-actions">
        <button class="danger" id="deletePatientBtn">حذف المريض</button>
        <button class="secondary" id="cancelEditPatientBtn">إلغاء</button>
        <button id="saveEditPatientBtn">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  document.getElementById('cancelEditPatientBtn').onclick = () => bg.remove();
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('saveEditPatientBtn').onclick = async () => {
    patient.name = document.getElementById('editPatientName').value.trim() || patient.name;
    patient.phone = document.getElementById('editPatientPhone').value.trim();
    await setData('patients:' + state.currentClinicId, state.patients);
    bg.remove();
    toast('اتحدثت البيانات');
    state.view = 'patient';
    render();
  };
  document.getElementById('deletePatientBtn').onclick = async () => {
    if(!(await confirmModal('متأكد إنك عايز تمسح المريض ده؟', {danger:true}))) return;
    state.patients = state.patients.filter(p=>p.id !== patient.id);
    await setData('patients:' + state.currentClinicId, state.patients);
    await logActivity('delete_patient', `حذف مريض: ${patient.name} (رقم ${patient.number||'-'})`);
    bg.remove();
    toast('اتمسح المريض');
    state.view = 'patients';
    render();
  };
}

function escapeHtml(str){
  return (str || '').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

