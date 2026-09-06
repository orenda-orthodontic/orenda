// inventory-view.js — شاشة المخزون: الأقسام، شارت الريفيل، التيوب
// ============ INVENTORY VIEW ============
const DEFAULT_INVENTORY_CATEGORIES = [
  { id: 'wires', label: 'وايرز' },
  { id: 'accessories', label: 'أكسسوريز' },
  { id: 'elastics', label: 'إيلاستيك' },
  { id: 'otie', label: 'أوتاي' }
];
const BRACKET_CATEGORY_ID = 'bracket';
const REVEAL_CATEGORY_ID = 'reveal';
const REVEAL_MBT_CATEGORY_ID = 'reveal_mbt';
const TUBE_CATEGORY_ID = 'tube';
const TUBE_TEETH = [16, 26, 36, 46]; // FDI numbers of the 4 first-molar tube positions (legacy default seeding — more can be added from the Tube category itself)
const REFILL_ALERT_THRESHOLD = 2; // refill (reveal) items alert when qty drops below this

// Reveal/refill (ROTH/MBT) charts only cover teeth 1-5 in each quadrant (incisors/canine/premolars) —
// molars (positions 6/7/8: first molar, second molar, third molar) use tubes/bands, not rebonded
// brackets, so they're excluded from both reveal charts.
function isRevealChartTooth(fdiNum){
  const last = String(fdiNum).slice(-1);
  return last !== '6' && last !== '7' && last !== '8';
}

// Unified low-stock check: refill (per-tooth) items alert below REFILL_ALERT_THRESHOLD,
// everything else alerts using its own "threshold" field.
function revealCategoryThreshold(catId){
  const cat = state.inventoryCategories.find(c=>c.id === catId);
  const th = cat ? parseFloat(cat.threshold) : NaN;
  return isNaN(th) ? REFILL_ALERT_THRESHOLD : th;
}
function isLowStockItem(item){
  const qty = parseFloat(item.qty) || 0;
  if(item.category === REVEAL_CATEGORY_ID || item.category === REVEAL_MBT_CATEGORY_ID) return qty < revealCategoryThreshold(item.category);
  const th = parseFloat(item.threshold) || 0;
  return qty <= th;
}

function renderInventoryCategoriesHtml(){
  const term = (state.inventorySearch||'').trim().toLowerCase();
  const PROTECTED_CATEGORY_IDS = new Set([BRACKET_CATEGORY_ID]);
  return state.inventoryCategories.map(cat=>{
    const isProtected = PROTECTED_CATEGORY_IDS.has(cat.id);
    const mainCatActionsHtml = isProtected ? '' : `
      <button class="secondary small" data-edit-main-cat="${cat.id}">تعديل</button>
      <button class="danger small" data-del-main-cat="${cat.id}">حذف</button>
    `;
    if(cat.toothChart){
      return `
        <div class="card">
          <div class="row" style="justify-content:space-between;">
            <div class="section-title" style="margin:0;">${escapeHtml(cat.label)}</div>
            <div class="row" style="gap:6px;">
              <button class="secondary small" data-bulk-restock="${cat.id}">📦 توريد جماعي — ${escapeHtml(cat.label)}</button>
              ${mainCatActionsHtml}
            </div>
          </div>
          ${renderRevealCategoryBody(cat)}
        </div>
      `;
    }
    let items = state.inventory.filter(i => i.category === cat.id);
    if(term) items = items.filter(i => i.name.toLowerCase().includes(term));
    items = [...items].sort((a,b)=> a.name.localeCompare(b.name, 'ar'));

    const isTubeCat = cat.id === TUBE_CATEGORY_ID;
    const toothColHtml = isTubeCat ? '<th>السن</th>' : '';

    const bodyHtml = items.length ? `
      <table class="diag-table" style="margin-top:10px;">
        <thead><tr>
          <th>الصنف</th>${toothColHtml}<th>الكمية</th><th>حد الإنذار</th><th>النوع</th><th>المورد</th><th>السعر</th><th></th>
        </tr></thead>
        <tbody>
          ${items.map(i=>{
            const qty = parseFloat(i.qty) || 0;
            const th = parseFloat(i.threshold) || 0;
            const low = isLowStockItem(i);
            const price = parseFloat(i.price) || 0;
            const toothCellHtml = isTubeCat ? `<td style="color:var(--muted);">${i.toothNum ? escapeHtml(realFdiToPalmer(i.toothNum)) : ''}</td>` : '';
            return `
              <tr${low ? ' class="low-stock-row"' : ''}>
                <td>${escapeHtml(i.name)}${low ? ' <span class="stock-alert-blink" style="color:var(--red);font-size:11px;border:none;background:none;padding:1px 5px;border-radius:6px;">⚠️ ناقص</span>' : ''}</td>
                ${toothCellHtml}
                <td style="font-weight:700;${low ? 'color:var(--red);' : ''}">${qty}</td>
                <td style="color:var(--muted);">${th}</td>
                <td style="color:var(--muted);">${escapeHtml(i.type||'')}</td>
                <td style="color:var(--muted);">
                  ${i.supplierWhatsapp ? `<a href="${buildWhatsappLink(i.supplierWhatsapp)}" target="_blank" rel="noopener" style="color:var(--green);text-decoration:none;">${escapeHtml(i.supplier||'واتساب')} 💬</a>` : escapeHtml(i.supplier||'')}
                </td>
                <td style="color:var(--muted);">${price ? price.toLocaleString() + ' جنيه' : ''}</td>
                <td>
                  <div class="row" style="gap:6px;flex-wrap:nowrap;">
                    <button class="secondary small" data-use="${i.id}">− استخدام</button>
                    <button class="secondary small" data-restock="${i.id}">+ توريد</button>
                    <button class="secondary small" data-edit-item="${i.id}">تعديل</button>
                    <button class="danger small" data-del-item="${i.id}">حذف</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    ` : `<div class="placeholder" style="margin-top:10px;">${term ? 'مفيش نتائج' : 'مفيش أصناف في القسم ده لسه'}</div>`;

    return `
      <div class="card">
        <div class="row" style="justify-content:space-between;">
          <div class="section-title" style="margin:0;">${escapeHtml(cat.label)}</div>
          <div class="row" style="gap:6px;">
            ${cat.id === BRACKET_CATEGORY_ID ? `<button class="secondary small" data-bulk-restock="${cat.id}">📦 توريد جماعي لكل البراكيت</button>` : ''}
            <button class="secondary small" data-add-item="${cat.id}">+ إضافة صنف</button>
            ${mainCatActionsHtml}
          </div>
        </div>
        ${bodyHtml}
      </div>
    `;
  }).join('');
}

function renderInventoryView(){
  const clinic = state.clinics.find(c=>c.id === state.currentClinicId);

  const lowItems = state.inventory.filter(i => isLowStockItem(i));
  const lowHtml = lowItems.length ? `
    <div class="bracket-alert stock-alert-blink">
      ⚠️ خامات وصلت لحد النفاد: ${lowItems.map(i=>escapeHtml(i.name) + ' (' + (parseFloat(i.qty)||0) + ')').join('، ')}
    </div>
  ` : '';

  return `
    <div class="breadcrumb">
      <span class="crumb" id="crumbClinics3">العيادات</span>
      <span class="sep">/</span>
      <span>المخزن (كل العيادات)</span>
    </div>
    ${lowHtml}
    <div class="top-actions">
      <button id="addMainCategoryBtn">+ إضافة صنف رئيسي</button>
    </div>
    <div class="card">
      <input type="text" id="searchInventory" placeholder="بحث عن صنف..." value="${escapeHtml(state.inventorySearch||'')}" style="width:100%;">
    </div>
    <div id="inventoryCategoriesContainer">${renderInventoryCategoriesHtml()}</div>
  `;
}

function renderRevealToothBox(item, categoryThreshold){
  const qty = parseFloat(item && item.qty) || 0;
  const out = qty <= 0;
  const th = categoryThreshold===undefined ? REFILL_ALERT_THRESHOLD : categoryThreshold;
  const low = !out && qty < th;
  return `
    <div class="tooth reveal-tooth ${out?'broken':(low?'low-refill':'')}" data-reveal-item="${item.id}" title="${escapeHtml(item.name)} — الكمية المتاحة: ${qty}${low ? ' ⚠ ناقص' : ''}">
      <span class="badge">${qty}</span>
      ${fdiToPalmer(item.toothNum)}
    </div>
  `;
}

function renderRevealCategoryBody(cat){
  const items = state.inventory.filter(i => i.category === cat.id);
  const byTooth = {};
  items.forEach(i => byTooth[i.toothNum] = i);
  const th = revealCategoryThreshold(cat.id);
  // reveal/refill charts only show teeth 1-5 per quadrant (molars use tubes, not rebonding)
  const revealUpper = FDI_TEETH_ROWS.upper.filter(isRevealChartTooth);
  const revealLower = FDI_TEETH_ROWS.lower.filter(isRevealChartTooth);
  // gap sits at the midline — right between the last right-side tooth (11/41) and the first
  // left-side tooth (21/31), i.e. exactly half-way through the filtered 10-tooth row
  const gapIdx = revealUpper.length/2;
  const upperRow = revealUpper.map((n,i)=> (i===gapIdx?'<div class="quad-gap"></div>':'') + renderRevealToothBox(byTooth[n], th)).join('');
  const lowerRow = revealLower.map((n,i)=> (i===gapIdx?'<div class="quad-gap"></div>':'') + renderRevealToothBox(byTooth[n], th)).join('');
  return `
    <div class="placeholder" style="text-align:right;padding:8px;margin-bottom:4px;">حد الإنذار الحالي لكل الأسنان هنا: <b>${th}</b> — يتغيّر من زرار "تعديل" فوق</div>
    <div class="tooth-arch">
      <div class="arch-label">الفك العلوي (Upper)</div>
      <div class="tooth-row">${upperRow}</div>
    </div>
    <div class="tooth-arch">
      <div class="arch-label">الفك السفلي (Lower)</div>
      <div class="tooth-row">${lowerRow}</div>
    </div>
    <div class="placeholder" style="text-align:right;padding:10px;">دوس على أي فص عشان تعدّل الكمية المتاحة منه، أو دبل كليك عشان تخصم وحدة واحدة منه على طول — والعدد بينقص لوحده كمان لما يتستخدم من تبويب "المتابعة الشهرية" لأي مريض. تقدر كمان تمسح فص معين خالص من الشارت من جوه شاشة تعديل الكمية بتاعته</div>
  `;
}

function openEditRevealQtyModal(itemId){
  const item = state.inventory.find(i=>i.id === itemId);
  if(!item) return;
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <h3>الكمية المتاحة — فص ${escapeHtml(fdiToPalmer(item.toothNum))}</h3>
      <div class="field"><label>الكمية</label><input type="number" id="revealQtyInput" value="${parseFloat(item.qty)||0}" min="0"></div>
      <div class="modal-actions">
        <button class="danger" id="deleteRevealToothBtn">مسح الفص ده من الشارت</button>
        <button class="secondary" id="cancelRevealQtyBtn">إلغاء</button>
        <button id="saveRevealQtyBtn">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  document.getElementById('cancelRevealQtyBtn').onclick = () => bg.remove();
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('deleteRevealToothBtn').onclick = async () => {
    bg.remove();
    await deleteRevealTooth(itemId);
  };
  document.getElementById('saveRevealQtyBtn').onclick = async () => {
    const qty = Math.max(0, parseFloat(document.getElementById('revealQtyInput').value) || 0);
    item.qty = qty;
    await saveInventory();
    bg.remove();
    toast('اتحدثت الكمية');
    render();
  };
  setTimeout(()=>document.getElementById('revealQtyInput').focus(), 50);
}

async function deleteRevealTooth(itemId){
  const item = state.inventory.find(i=>i.id === itemId);
  if(!item) return;
  if(!(await confirmModal(`متأكد إنك عاوز تمسح فص ${fdiToPalmer(item.toothNum)} خالص من شارت ${item.category === REVEAL_MBT_CATEGORY_ID ? 'MBT' : 'ROTH'}؟`, {danger:true}))) return;
  const key = item.category + ':' + item.toothNum;
  state.inventory = state.inventory.filter(i=>i.id !== itemId);
  if(!state.deletedRevealTeeth.includes(key)) state.deletedRevealTeeth.push(key);
  await saveInventory();
  await saveDeletedRevealTeeth();
  toast('اتمسح الفص من الشارت');
  render();
}

async function quickDeductRevealItem(itemId){
  const item = state.inventory.find(i=>i.id === itemId);
  if(!item) return;
  const qty = Math.max(0, (parseFloat(item.qty)||0) - 1);
  item.qty = qty;
  await saveInventory();
  toast('اتخصمت وحدة من فص ' + fdiToPalmer(item.toothNum));
  render();
}

let revealClickTimer = null;
function attachInventoryCategoryHandlers(){
  document.querySelectorAll('[data-reveal-item]').forEach(el=>{
    // single click opens the edit-qty modal; double click deducts one unit immediately.
    // click is delayed briefly so a fast second click (dblclick) can cancel it.
    el.onclick = () => {
      const itemId = el.dataset.revealItem;
      if(revealClickTimer) clearTimeout(revealClickTimer);
      revealClickTimer = setTimeout(() => { revealClickTimer = null; openEditRevealQtyModal(itemId); }, 250);
    };
    el.ondblclick = (e) => {
      e.preventDefault();
      if(revealClickTimer){ clearTimeout(revealClickTimer); revealClickTimer = null; }
      quickDeductRevealItem(el.dataset.revealItem);
    };
  });
  document.querySelectorAll('[data-add-item]').forEach(el=>{
    el.onclick = () => openAddInventoryItemModal(el.dataset.addItem);
  });
  document.querySelectorAll('[data-use]').forEach(el=>{
    el.onclick = () => adjustInventoryQty(el.dataset.use, -1);
  });
  document.querySelectorAll('[data-bulk-restock]').forEach(el=>{
    el.onclick = () => openBulkRestockModal(el.dataset.bulkRestock);
  });
  document.querySelectorAll('[data-restock]').forEach(el=>{
    el.onclick = () => openRestockModal(el.dataset.restock);
  });
  document.querySelectorAll('[data-edit-item]').forEach(el=>{
    el.onclick = () => openEditInventoryItemModal(el.dataset.editItem);
  });
  document.querySelectorAll('[data-del-item]').forEach(el=>{
    el.onclick = () => deleteInventoryItem(el.dataset.delItem);
  });
  document.querySelectorAll('[data-edit-main-cat]').forEach(el=>{
    el.onclick = () => openEditMainCategoryModal(el.dataset.editMainCat);
  });
  document.querySelectorAll('[data-del-main-cat]').forEach(el=>{
    el.onclick = () => deleteMainCategory(el.dataset.delMainCat);
  });
}

function attachInventoryHandlers(){
  document.getElementById('crumbClinics3').onclick = () => { state.view = 'clinics'; render(); };
  document.getElementById('addMainCategoryBtn').onclick = () => openAddMainCategoryModal();
  const search = document.getElementById('searchInventory');
  if(search){
    search.oninput = () => {
      state.inventorySearch = search.value;
      const container = document.getElementById('inventoryCategoriesContainer');
      if(container){
        container.innerHTML = renderInventoryCategoriesHtml();
        attachInventoryCategoryHandlers();
      }
    };
  }
  attachInventoryCategoryHandlers();
}

function openEditMainCategoryModal(catId){
  const cat = state.inventoryCategories.find(c=>c.id === catId);
  if(!cat) return;
  const thresholdFieldHtml = cat.toothChart
    ? `<div class="field"><label>حد الإنذار (لكل الأسنان في القسم ده)</label><input type="number" id="editMainCategoryThreshold" value="${parseFloat(cat.threshold)||REFILL_ALERT_THRESHOLD}" min="0"></div>`
    : '';
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <h3>تعديل الصنف الرئيسي</h3>
      <div class="field"><label>اسم الصنف الرئيسي</label><input type="text" id="editMainCategoryLabel" value="${escapeHtml(cat.label)}"></div>
      ${thresholdFieldHtml}
      <div class="modal-actions">
        <button class="secondary" id="cancelEditMainCategoryBtn">إلغاء</button>
        <button id="saveEditMainCategoryBtn">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  document.getElementById('cancelEditMainCategoryBtn').onclick = () => bg.remove();
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('saveEditMainCategoryBtn').onclick = async () => {
    const label = document.getElementById('editMainCategoryLabel').value.trim();
    if(!label){ toast('اكتب اسم الصنف الرئيسي'); return; }
    cat.label = label;
    if(cat.toothChart){
      const th = document.getElementById('editMainCategoryThreshold');
      if(th) cat.threshold = parseFloat(th.value) || 0;
    }
    await saveInventoryCategories();
    bg.remove();
    toast('اتعدل الصنف الرئيسي');
    render();
  };
  setTimeout(()=>document.getElementById('editMainCategoryLabel').focus(), 50);
}

async function deleteMainCategory(catId){
  const PROTECTED_CATEGORY_IDS = new Set([BRACKET_CATEGORY_ID]);
  if(PROTECTED_CATEGORY_IDS.has(catId)){
    toast('مينفعش تمسح الصنف الرئيسي ده — أساسي في النظام');
    return;
  }
  const cat = state.inventoryCategories.find(c=>c.id === catId);
  if(!cat) return;
  const itemsCount = state.inventory.filter(i=>i.category===catId).length;
  const msg = itemsCount
    ? `حذف "${cat.label}" هيمسح معاه كل الأصناف اللي جواه (${itemsCount} صنف). متأكد؟`
    : `حذف "${cat.label}"؟`;
  if(!(await confirmModal(msg, {danger:true}))) return;
  state.inventoryCategories = state.inventoryCategories.filter(c=>c.id !== catId);
  state.inventory = state.inventory.filter(i=>i.category !== catId);
  await saveInventoryCategories();
  await saveInventory();
  toast('اتمسح الصنف الرئيسي');
  render();
}

function openAddMainCategoryModal(){
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <h3>إضافة صنف رئيسي جديد</h3>
      <div class="field"><label>اسم الصنف الرئيسي (مثلاً: مواد لصق)</label><input type="text" id="newMainCategoryLabel" placeholder="اسم الصنف الرئيسي"></div>
      <div class="modal-actions">
        <button class="secondary" id="cancelMainCategoryBtn">إلغاء</button>
        <button id="saveMainCategoryBtn">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  document.getElementById('cancelMainCategoryBtn').onclick = () => bg.remove();
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('saveMainCategoryBtn').onclick = async () => {
    const label = document.getElementById('newMainCategoryLabel').value.trim();
    if(!label){ toast('اكتب اسم الصنف الرئيسي'); return; }
    state.inventoryCategories.push({ id: uid(), label });
    await saveInventoryCategories();
    bg.remove();
    toast('اتضاف الصنف الرئيسي');
    render();
  };
  setTimeout(()=>document.getElementById('newMainCategoryLabel').focus(), 50);
}

function openAddInventoryItemModal(categoryId){
  const cat = state.inventoryCategories.find(c=>c.id === categoryId) || state.inventoryCategories[0];
  const isWire = cat.id === 'wires';
  const isTube = cat.id === TUBE_CATEGORY_ID;
  const typeFieldHtml = isWire
    ? `<select id="newItemType">
         <option value="">النوع (NITI / SS / TMA)</option>
         <option value="NITI">NITI</option>
         <option value="SS">SS</option>
         <option value="TMA">TMA</option>
       </select>`
    : `<input type="text" id="newItemType" placeholder="مثلاً: مستطيل، دائري">`;
  const toothFieldHtml = isTube ? `
    <div class="field">
      <label>رقم السن (FDI زي 17، أو Palmer زي UR7) — سيبه فاضي لو الصنف مش خاص بسن معين</label>
      <input type="text" id="newItemTooth" placeholder="مثلاً: 17 أو UR7">
    </div>
  ` : '';
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <h3>إضافة صنف — ${escapeHtml(cat.label)}</h3>
      <div class="field"><label>اسم الصنف${isWire ? ' (مثلاً: وير 16*22 نيتي)' : ' (مثلاً: وير 12 اوتاي جولد)'}</label><input type="text" id="newItemName" placeholder="اسم الصنف"></div>
      ${toothFieldHtml}
      <div class="field"><label>الكمية الحالية</label><input type="number" id="newItemQty" value="0"></div>
      <div class="field"><label>حد الإنذار (نبهني لما توصل للرقم ده)</label><input type="number" id="newItemThreshold" value="4"></div>
      <div class="field"><label>النوع</label>${typeFieldHtml}</div>
      <div class="field"><label>المورد</label><input type="text" id="newItemSupplier" placeholder="اسم المورد"></div>
      <div class="field"><label>رقم واتساب المورد</label><input type="text" id="newItemSupplierWhatsapp" placeholder="مثلاً: 01012345678"></div>
      <div class="field"><label>السعر</label><input type="number" id="newItemPrice" placeholder="سعر الصنف"></div>
      <div class="modal-actions">
        <button class="secondary" id="cancelItemBtn">إلغاء</button>
        <button id="saveItemBtn">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  document.getElementById('cancelItemBtn').onclick = () => bg.remove();
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('saveItemBtn').onclick = async () => {
    const name = document.getElementById('newItemName').value.trim();
    const qty = parseFloat(document.getElementById('newItemQty').value) || 0;
    const threshold = parseFloat(document.getElementById('newItemThreshold').value) || 0;
    const type = document.getElementById('newItemType').value.trim();
    const supplier = document.getElementById('newItemSupplier').value.trim();
    const supplierWhatsapp = document.getElementById('newItemSupplierWhatsapp').value.trim();
    const price = parseFloat(document.getElementById('newItemPrice').value) || 0;
    if(!name){ toast('اكتب اسم الصنف'); return; }
    let toothNum = undefined;
    if(isTube){
      const toothRaw = document.getElementById('newItemTooth').value.trim();
      if(toothRaw){
        toothNum = parseRealToothInput(toothRaw);
        if(!toothNum){ toast('رقم السن مش مفهوم — اكتبه FDI زي 17 أو Palmer زي UR7'); return; }
        if(findTubeItemByFDI(toothNum)){ toast('في صنف Tube متسجل بالفعل للسن ده'); return; }
      }
    }
    const item = { id: uid(), name, qty, threshold, category: cat.id, type, supplier, supplierWhatsapp, price };
    if(toothNum) item.toothNum = toothNum;
    state.inventory.push(item);
    await saveInventory();
    bg.remove();
    toast('اتضاف الصنف');
    render();
  };
  setTimeout(()=>document.getElementById('newItemName').focus(), 50);
}

function openEditInventoryItemModal(itemId){
  const item = state.inventory.find(i=>i.id === itemId);
  if(!item) return;
  const isWire = item.category === 'wires';
  const isTube = item.category === TUBE_CATEGORY_ID;
  const typeFieldHtml = isWire
    ? `<select id="editItemType">
         <option value="">النوع (NITI / SS / TMA)</option>
         <option value="NITI"${item.type==='NITI'?' selected':''}>NITI</option>
         <option value="SS"${item.type==='SS'?' selected':''}>SS</option>
         <option value="TMA"${item.type==='TMA'?' selected':''}>TMA</option>
       </select>`
    : `<input type="text" id="editItemType" value="${escapeHtml(item.type||'')}">`;
  const toothFieldHtml = isTube ? `
    <div class="field">
      <label>رقم السن (FDI زي 17، أو Palmer زي UR7) — سيبه فاضي لو الصنف مش خاص بسن معين</label>
      <input type="text" id="editItemTooth" value="${item.toothNum ? escapeHtml(realFdiToPalmer(item.toothNum)) : ''}" placeholder="مثلاً: 17 أو UR7">
    </div>
  ` : '';
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <h3>تعديل: ${escapeHtml(item.name)}</h3>
      <div class="field"><label>اسم الصنف</label><input type="text" id="editItemName" value="${escapeHtml(item.name||'')}"></div>
      ${toothFieldHtml}
      <div class="field"><label>حد الإنذار (نبهني لما توصل للرقم ده)</label><input type="number" id="editItemThreshold" value="${parseFloat(item.threshold)||0}"></div>
      <div class="field"><label>النوع</label>${typeFieldHtml}</div>
      <div class="field"><label>المورد</label><input type="text" id="editItemSupplier" value="${escapeHtml(item.supplier||'')}"></div>
      <div class="field"><label>رقم واتساب المورد</label><input type="text" id="editItemSupplierWhatsapp" value="${escapeHtml(item.supplierWhatsapp||'')}"></div>
      <div class="field"><label>السعر</label><input type="number" id="editItemPrice" value="${parseFloat(item.price)||0}"></div>
      <div class="modal-actions">
        <button class="secondary" id="cancelEditItemBtn">إلغاء</button>
        <button id="saveEditItemBtn">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  document.getElementById('cancelEditItemBtn').onclick = () => bg.remove();
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('saveEditItemBtn').onclick = async () => {
    const name = document.getElementById('editItemName').value.trim();
    if(!name){ toast('اكتب اسم الصنف'); return; }
    if(isTube){
      const toothRaw = document.getElementById('editItemTooth').value.trim();
      if(!toothRaw){
        delete item.toothNum;
      } else {
        const fdi = parseRealToothInput(toothRaw);
        if(!fdi){ toast('رقم السن مش مفهوم — اكتبه FDI زي 17 أو Palmer زي UR7'); return; }
        const clash = findTubeItemByFDI(fdi);
        if(clash && clash.id !== item.id){ toast('في صنف Tube تاني متسجل بالفعل للسن ده'); return; }
        item.toothNum = fdi;
      }
    }
    item.name = name;
    item.threshold = parseFloat(document.getElementById('editItemThreshold').value) || 0;
    item.type = document.getElementById('editItemType').value.trim();
    item.supplier = document.getElementById('editItemSupplier').value.trim();
    item.supplierWhatsapp = document.getElementById('editItemSupplierWhatsapp').value.trim();
    item.price = parseFloat(document.getElementById('editItemPrice').value) || 0;
    await saveInventory();
    bg.remove();
    toast('اتحفظ التعديل');
    render();
  };
  setTimeout(()=>document.getElementById('editItemName').focus(), 50);
}

function openRestockModal(itemId){
  const item = state.inventory.find(i=>i.id === itemId);
  if(!item) return;
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <h3>توريد: ${escapeHtml(item.name)}</h3>
      <div class="field"><label>الكمية المضافة</label><input type="number" id="restockQty" value="1"></div>
      <div class="modal-actions">
        <button class="secondary" id="cancelRestockBtn">إلغاء</button>
        <button id="saveRestockBtn">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  document.getElementById('cancelRestockBtn').onclick = () => bg.remove();
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('saveRestockBtn').onclick = async () => {
    const add = parseFloat(document.getElementById('restockQty').value) || 0;
    item.qty = (parseFloat(item.qty)||0) + add;
    await saveInventory();
    await logActivity('restock_item', `ورّد ${add} من "${item.name}" (الكمية بقت ${item.qty})`);
    bg.remove();
    toast('اتحدثت الكمية');
    render();
  };
  setTimeout(()=>document.getElementById('restockQty').focus(), 50);
}

function openBulkRestockModal(categoryId){
  const cat = state.inventoryCategories.find(c=>c.id === categoryId);
  if(!cat) return;
  const items = state.inventory.filter(i=>i.category === categoryId);
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <h3>توريد جماعي — ${escapeHtml(cat.label)}</h3>
      <div class="placeholder" style="padding:8px;margin-bottom:8px;">هتتضاف نفس الكمية دي لكل أصناف "${escapeHtml(cat.label)}" (${items.length} صنف) دفعة واحدة</div>
      <div class="field"><label>الكمية المضافة لكل صنف</label><input type="number" id="bulkRestockQty" value="1" min="1"></div>
      <div class="modal-actions">
        <button class="secondary" id="cancelBulkRestockBtn">إلغاء</button>
        <button id="saveBulkRestockBtn">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  document.getElementById('cancelBulkRestockBtn').onclick = () => bg.remove();
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('saveBulkRestockBtn').onclick = async () => {
    const add = parseFloat(document.getElementById('bulkRestockQty').value) || 0;
    if(add <= 0){ toast('اكتب كمية صحيحة'); return; }
    items.forEach(i=>{ i.qty = (parseFloat(i.qty)||0) + add; });
    await saveInventory();
    await logActivity('bulk_restock', `توريد جماعي: أضاف ${add} لكل صنف في "${cat.label}" (${items.length} صنف)`);
    bg.remove();
    toast(`اتضافت ${add} لكل صنف من "${cat.label}" (${items.length} صنف)`);
    render();
  };
  setTimeout(()=>document.getElementById('bulkRestockQty').focus(), 50);
}

async function adjustInventoryQty(itemId, delta){
  const item = state.inventory.find(i=>i.id === itemId);
  if(!item) return;
  item.qty = Math.max(0, (parseFloat(item.qty)||0) + delta);
  await saveInventory();
  await logActivity('adjust_inventory', `${delta < 0 ? 'استخدم' : 'أضاف'} ${Math.abs(delta)} من "${item.name}" (الكمية بقت ${item.qty})`);
  render();
  if(isLowStockItem(item)){
    toast('⚠️ ' + item.name + ' وصل لحد الإنذار (' + item.qty + ')');
  }
}

async function deleteInventoryItem(itemId){
  if(!(await confirmModal('حذف الصنف ده؟', {danger:true}))) return;
  const item = state.inventory.find(i=>i.id === itemId);
  state.inventory = state.inventory.filter(i=>i.id !== itemId);
  await saveInventory();
  await logActivity('delete_inventory_item', `حذف صنف من المخزون: ${item ? item.name : itemId}`);
  render();
}

