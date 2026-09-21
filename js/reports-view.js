// reports-view.js — شاشة "التقارير": اختيار عيادة واحدة أو كل العيادات مجمعة، وعرض تحليل شامل
// (دخل، حالات نشطة/جديدة/فكت، نسبة خلع/بدون خلع، إلخ). التحليل نفسه بيستخدم نفس المنطق
// الموجود في clinic-features.js وpatients-view.js (buildClinicAnalysisBodyHtml /
// buildAllClinicsAnalysisBodyHtml) بدل ما يتكرر هنا — الشاشة دي بس بتضيف اختيار العيادة
// وتربطهم ببعض تحت خانة "التقارير" في الشريط العلوي.

// thin wrapper: renderReportsViewInner() does the real work below, but ANYTHING unexpected it
// throws is caught here instead of escaping into render()'s own catch, which used to take the
// WHOLE app down to "تعذر تحميل النظام" over a problem that only affected the Reports screen.
function renderReportsView(){
  try{
    return renderReportsViewInner();
  }catch(e){
    console.error('renderReportsView failed', e);
    return `
      <div class="card">
        <div class="empty-state" style="padding:24px;">
          <div style="font-weight:700;margin-bottom:8px;">حصلت مشكلة في شاشة التقارير</div>
          <div style="color:var(--muted);font-size:13px;">${escapeHtml(e && e.message ? e.message : '')}</div>
        </div>
      </div>
    `;
  }
}

function renderReportsViewInner(){
  const kind = state.reportsKind || 'cases';
  const selectedId = state.reportsSelectedClinicId || '';
  const isAll = !selectedId;
  const month = state.reportsMonth || currentMonthStr();
  const clinicName = isAll ? 'كل العيادات مجمعة' : ((state.clinics.find(c => c.id === selectedId) || {}).name || '');

  let bodyHtml;
  if(state.reportsError){
    bodyHtml = `
      <div class="card">
        <div class="empty-state" style="padding:24px;">
          <div style="font-weight:700;margin-bottom:8px;">حصلت مشكلة في تحميل التقرير</div>
          <div style="color:var(--muted);font-size:13px;margin-bottom:14px;">${escapeHtml(state.reportsError)}</div>
          <button id="retryReportsBtn">حاول تاني</button>
        </div>
      </div>
    `;
  } else {
    // مغلّفة في try/catch — لو فيه بيانات مريض شكلها مش متوقع (مثلاً صنف في المخزون من غير
    // اسم)، المفروض يظهر خطأ في التقرير ده بس، مش يوقع الشاشة كلها زي ما كان بيحصل قبل كده
    try{
      bodyHtml = kind === 'inventory'
        ? (state.inventoryUsageReportData ? buildInventoryUsageReportHtml(state.inventoryUsageReportData) : `<div class="card"><div class="placeholder">جارِ التحليل...</div></div>`)
        : (isAll ? buildAllClinicsAnalysisBodyHtml() : buildClinicAnalysisBodyHtml(selectedId));
    }catch(e){
      console.error('report body build failed', e);
      bodyHtml = `
        <div class="card">
          <div class="empty-state" style="padding:24px;">
            <div style="font-weight:700;margin-bottom:8px;">حصلت مشكلة في عرض التقرير ده</div>
            <div style="color:var(--muted);font-size:13px;">${escapeHtml(e && e.message ? e.message : '')}</div>
          </div>
        </div>
      `;
    }
  }

  // نُقلت هنا من الشاشة الرئيسية (عدد العيادات + المخزون المحتاج توريد) عشان متبقاش ظاهرة
  // لأي حد بيفتح البرنامج — التقارير هي الشاشة اللي فيها بس. أيام الشغل بتتحسب لنفس الشهر
  // المختار تحت.
  const lowStockCount = (state.inventory || []).filter(isLowStockItem).length;
  const workDaysCount = state.reportsWorkDays !== null && state.reportsWorkDays !== undefined ? state.reportsWorkDays.count : null;
  const workDaysDates = (state.reportsWorkDays && state.reportsWorkDays.dates) || [];
  const overviewStripHtml = `
    <div class="card">
      <div class="dash-pulse">
        <div class="dash-pulse-item">
          <div class="dash-pulse-num">${workDaysCount === null ? '…' : workDaysCount}</div>
          <div class="dash-pulse-lbl">يوم شغل — ${monthLabelAr(month)}</div>
        </div>
        <div class="dash-pulse-item">
          <div class="dash-pulse-num">${state.clinics.length}</div>
          <div class="dash-pulse-lbl">عيادة بتشتغل فيها</div>
        </div>
        <div class="dash-pulse-item">
          <div class="dash-pulse-num${lowStockCount > 0 ? ' dash-pulse-alert stock-alert-blink' : ''}">${lowStockCount}</div>
          <div class="dash-pulse-lbl">صنف محتاج توريد</div>
        </div>
      </div>
      ${workDaysDates.length ? `
        <details style="margin-top:8px;">
          <summary style="cursor:pointer;font-size:12px;color:var(--muted);">عرض الأيام (${workDaysDates.length}) — للتأكد إن العدد مظبوط</summary>
          <div style="font-size:12px;color:var(--muted);line-height:1.9;margin-top:6px;">${workDaysDates.map(d=>escapeHtml(formatDateAr(d))).join('، ')}</div>
        </details>
      ` : ''}
    </div>
  `;

  return `
    ${overviewStripHtml}
    <div class="card">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div class="section-title" style="margin:0;">📊 التقارير — ${kind === 'inventory' ? 'المخزون' : escapeHtml(clinicName)} — ${monthLabelAr(month)}</div>
        <div class="row" style="gap:8px;flex-wrap:wrap;">
          <select id="reportsKindSelect">
            <option value="cases" ${kind==='cases'?'selected':''}>تحليل الحالات</option>
            <option value="inventory" ${kind==='inventory'?'selected':''}>تقرير المخزون</option>
          </select>
          ${kind === 'cases' ? `
            <select id="reportsClinicSelect">
              <option value="" ${isAll ? 'selected' : ''}>كل العيادات مجمعة</option>
              ${state.clinics.map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
            </select>
          ` : ''}
          <input type="month" id="reportsMonthInput" value="${escapeHtml(month)}">
        </div>
      </div>
    </div>
    ${bodyHtml}
  `;
}

// fetches whichever dataset the current selection needs, showing the "جارِ التحليل" placeholder
// via a render() in between (same pattern as the rest of the app's async loads). Wrapped in its
// own try/catch — an exception here used to propagate up into render()'s catch and take the
// WHOLE app down to the "تعذر تحميل النظام" screen over a problem in just the Reports data,
// instead of showing an error only where the problem actually is.
async function loadReportsData(){
  if(!state.reportsMonth) state.reportsMonth = currentMonthStr();
  state.reportsError = null;
  try{
    // Reports can be opened directly from the top nav without ever visiting Clinics/Inventory
    // this session, so state.inventory might still be empty — load it here so the low-stock
    // count in the overview strip (and the inventory report itself) is accurate instead of
    // silently showing 0.
    await loadInventory();
    state.reportsWorkDays = null;
    computeWorkDaysThisMonth(state.reportsMonth).then(n => { state.reportsWorkDays = n; render(); }).catch(e=>console.error('work days calc failed', e));

    if((state.reportsKind || 'cases') === 'inventory'){
      state.inventoryUsageReportData = null;
      render();
      state.inventoryUsageReportData = await computeInventoryUsageReport(state.reportsMonth);
      render();
      return;
    }
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
  }catch(e){
    console.error('loadReportsData failed', e);
    state.reportsError = (e && e.message) ? e.message : 'حصل خطأ غير متوقع';
    render();
  }
}

function attachReportsHandlers(){
  const retryBtn = document.getElementById('retryReportsBtn');
  if(retryBtn) retryBtn.onclick = () => loadReportsData();
  const kindSel = document.getElementById('reportsKindSelect');
  if(kindSel) kindSel.onchange = async () => {
    state.reportsKind = kindSel.value;
    await loadReportsData();
  };
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
