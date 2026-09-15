// reports-view.js — شاشة "التقارير": اختيار عيادة واحدة أو كل العيادات مجمعة، وعرض تحليل شامل
// (دخل، حالات نشطة/جديدة/فكت، نسبة خلع/بدون خلع، إلخ). التحليل نفسه بيستخدم نفس المنطق
// الموجود في clinic-features.js وpatients-view.js (buildClinicAnalysisBodyHtml /
// buildAllClinicsAnalysisBodyHtml) بدل ما يتكرر هنا — الشاشة دي بس بتضيف اختيار العيادة
// وتربطهم ببعض تحت خانة "التقارير" في الشريط العلوي.

function renderReportsView(){
  const selectedId = state.reportsSelectedClinicId || '';
  const isAll = !selectedId;
  const month = state.reportsMonth || currentMonthStr();
  const clinicName = isAll ? 'كل العيادات مجمعة' : ((state.clinics.find(c => c.id === selectedId) || {}).name || '');

  const bodyHtml = isAll ? buildAllClinicsAnalysisBodyHtml() : buildClinicAnalysisBodyHtml(selectedId);

  return `
    <div class="card">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div class="section-title" style="margin:0;">📊 التقارير — ${escapeHtml(clinicName)} — ${monthLabelAr(month)}</div>
        <div class="row" style="gap:8px;flex-wrap:wrap;">
          <select id="reportsClinicSelect">
            <option value="" ${isAll ? 'selected' : ''}>كل العيادات مجمعة</option>
            ${state.clinics.map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
          </select>
          <input type="month" id="reportsMonthInput" value="${escapeHtml(month)}">
        </div>
      </div>
    </div>
    ${bodyHtml}
  `;
}

// fetches whichever dataset the current selection needs, showing the "جارِ التحليل" placeholder
// via a render() in between (same pattern as the rest of the app's async loads)
async function loadReportsData(){
  if(!state.reportsMonth) state.reportsMonth = currentMonthStr();
  const selectedId = state.reportsSelectedClinicId || '';
  if(!selectedId){
    state.allClinicsAnalysisMonth = state.reportsMonth;
    state.allClinicsAnalysisLoading = true;
    render();
    await loadAllClinicsAnalysisData(state.reportsMonth);
  } else {
    state.clinicAnalysisMonth = state.reportsMonth;
    state.clinicAnalysisLoading = true;
    render();
    await loadClinicAnalysisData(selectedId, state.reportsMonth);
  }
  render();
}

function attachReportsHandlers(){
  const sel = document.getElementById('reportsClinicSelect');
  if(sel) sel.onchange = async () => {
    state.reportsSelectedClinicId = sel.value;
    await loadReportsData();
  };
  const monthInput = document.getElementById('reportsMonthInput');
  if(monthInput) monthInput.onchange = async () => {
    state.reportsMonth = monthInput.value;
    await loadReportsData();
  };
  // clicking a clinic's row inside the "all clinics" comparison table drills straight into
  // that clinic's own report, same month
  document.querySelectorAll('.reports-clinic-row').forEach(row => {
    row.onclick = async () => {
      state.reportsSelectedClinicId = row.dataset.clinicId;
      await loadReportsData();
    };
  });
}
