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
const TUBE_TEETH = [16, 26, 36, 46]; // legacy first-molar tube positions used by new-case bonding
const FOLLOWUP_TUBE_TEETH = [17, 27, 37, 47]; // second-molar tube positions selectable in monthly follow-up
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
  const invTab = state.inventoryTab || 'all';
  return state.inventoryCategories.filter(cat => invTab === 'all' || invTab === cat.id).map(cat=>{
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

    const bodyHtml = items.length ? `
      <div class="inv-list">
        ${items.map(i=>{
          const qty = parseFloat(i.qty) || 0;
          const th = parseFloat(i.threshold) || 0;
          const low = isLowStockItem(i);
          const price = parseFloat(i.price) || 0;
          const pct = Math.max(4, Math.min(100, Math.round(qty / (th > 0 ? th * 2 : Math.max(qty, 1)) * 100)));
          const supplierHtml = i.supplierWhatsapp
            ? `<a href="${buildWhatsappLink(i.supplierWhatsapp)}" target="_blank" rel="noopener">${escapeHtml(i.supplier||'واتساب')} 💬</a>`
            : escapeHtml(i.supplier||'');
          const subParts = [supplierHtml, price ? price.toLocaleString() + ' جنيه' : ''].filter(Boolean);
          const mainBtn = low
            ? `<button class="inv-main-btn" data-restock="${i.id}">+ توريد</button>`
            : `<button class="secondary inv-main-btn" data-use="${i.id}">− استخدام</button>`;
          const otherBtn = low
            ? `<button class="secondary small" data-use="${i.id}">− استخدام</button>`
            : `<button class="secondary small" data-restock="${i.id}">+ توريد</button>`;
          return `
            <div class="inv-item${low ? ' low' : ''}">
              <div class="inv-main">
                <div class="inv-name">${escapeHtml(i.name)}${i.type ? ` <span class="inv-tag">${escapeHtml(i.type)}</span>` : ''}${(isTubeCat && i.toothNum) ? ` <span class="inv-tag">${escapeHtml(realFdiToPalmer(i.toothNum))}</span>` : ''}${low ? ' <span class="inv-tag bad">ناقص</span>' : ''}</div>
                ${subParts.length ? `<div class="inv-sub">${subParts.join(' · ')}</div>` : ''}
              </div>
              <div class="inv-qty-actions">
                <div class="inv-qty">
                  <div><b>${qty}</b> <small>من حد ${th}</small></div>
                  <div class="inv-bar"><i style="width:${pct}%"></i></div>
                </div>
                <div class="inv-actions">
                  ${mainBtn}
                  ${otherBtn}
                  <button class="secondary small" data-edit-item="${i.id}">تعديل</button>
                  <button class="danger small" data-del-item="${i.id}">حذف</button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
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

function ensureInventoryStyles(){
  if(document.getElementById('invProStyles')) return;
  const s = document.createElement('style');
  s.id = 'invProStyles';
  s.textContent = `
    .inv-summary{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
    .inv-summary h2{margin:0;font-size:18px;font-weight:700;}
    .inv-summary .inv-low-names{font-size:12.5px;color:var(--muted);margin-top:4px;}
    .inv-tabs{position:sticky;top:56px;z-index:35;display:flex;gap:6px;flex-wrap:wrap;margin:0 0 14px;padding:10px 8px;background:var(--bg);border:1px solid var(--border);border-radius:12px;box-shadow:0 4px 12px rgba(42,32,28,.06);}
    .inv-tab{background:var(--panel) !important;color:var(--text) !important;border:1px solid var(--border) !important;border-radius:20px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;}
    .inv-tab.active{background:var(--accent) !important;color:#fff !important;border-color:var(--accent) !important;}
    .inv-tab em{font-style:normal;background:var(--red);color:#fff;border-radius:10px;padding:0 6px;font-size:11px;margin-inline-start:6px;}
    .inv-list{display:flex;flex-direction:column;gap:8px;margin-top:12px;}
    .inv-item{display:flex;align-items:center;gap:14px;padding:12px 14px;border:1px solid var(--border);border-radius:12px;background:var(--panel);}
    .inv-item.low{border-color:#e7b9ad;background:#fff8f6;}
    .inv-main{flex:1;min-width:0;}
    .inv-name{font-weight:700;font-size:14.5px;}
    .inv-sub{font-size:12px;color:var(--muted);margin-top:3px;}
    .inv-sub a{color:var(--green);text-decoration:none;}
    .inv-tag{font-size:11px;font-weight:600;padding:1px 8px;border-radius:12px;background:var(--panel2);color:var(--muted);margin-inline-start:4px;}
    .inv-tag.bad{background:#fdeee9;color:#9a3a29;}
    .inv-qty{width:130px;flex:none;}
    .inv-qty b{font-size:20px;}
    .inv-qty small{color:var(--muted);font-size:11.5px;}
    .inv-item.low .inv-qty b{color:var(--red);}
    .inv-bar{height:6px;border-radius:4px;background:var(--border);overflow:hidden;margin-top:6px;}
    .inv-bar i{display:block;height:100%;border-radius:4px;background:var(--green);}
    .inv-item.low .inv-bar i{background:var(--red);}
    .inv-actions{display:flex;align-items:center;gap:5px;flex:none;flex-wrap:wrap;}
    .inv-actions button{padding:6px 8px;font-size:11px;min-width:0;}
    .inv-qty-actions{display:flex;align-items:center;gap:8px;flex:none;}
    .inv-actions .inv-more-list{inset-inline-end:0;}
    .inv-item .inv-sub{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
    .inv-main-btn{min-width:96px;}
    .inv-more{position:relative;}
    .inv-qty-actions{display:flex;align-items:center;gap:8px;flex:none;}
    .inv-actions{flex-wrap:wrap;}
    .inv-actions button{padding:6px 8px;font-size:11px;min-width:0;}
    .inv-more summary{list-style:none;cursor:pointer;width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:10px;border:1px solid var(--border);background:var(--panel2);font-size:18px;line-height:1;user-select:none;}
    .inv-more summary::-webkit-details-marker{display:none;}
    .inv-more-list{position:absolute;inset-inline-end:0;top:calc(100% + 4px);z-index:20;min-width:130px;display:flex;flex-direction:column;gap:4px;padding:6px;background:var(--panel);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 22px rgba(0,0,0,.14);}
    .inv-more-list button{width:100%;text-align:start;}
    @media (max-width:560px){
      .inv-item{flex-wrap:wrap;}
      .inv-main{flex:1 1 100%;}
      .inv-qty{flex:1;width:auto;}
      .inv-qty-actions{width:100%;justify-content:space-between;flex-wrap:wrap;}
      .inv-actions{flex:1;justify-content:flex-end;}
      .inv-qty-actions{width:100%;justify-content:space-between;flex-wrap:wrap;}
      .inv-actions{flex:1;justify-content:flex-end;}
      .inv-qty-actions{width:100%;justify-content:space-between;}
    }
  `;
  document.head.appendChild(s);
}

function inventoryTabsHtml(){
  const cur = state.inventoryTab || 'all';
  const lowAll = state.inventory.filter(i => isLowStockItem(i)).length;
  const tab = (id, label, low) => `<button type="button" class="inv-tab${cur === id ? ' active' : ''}" data-inv-tab="${escapeHtml(id)}">${escapeHtml(label)}${low ? `<em>${low}</em>` : ''}</button>`;
  return `<div class="inv-tabs">${tab('all', 'الكل', lowAll)}${state.inventoryCategories.map(c => tab(c.id, c.label, state.inventory.filter(i => i.category === c.id && isLowStockItem(i)).length)).join('')}</div>`;
}

// groups low-stock items by supplier and builds a ready WhatsApp order message per supplier
function openSupplierOrderModal(){
  const low = state.inventory.filter(i => isLowStockItem(i));
  const groups = {};
  low.forEach(i => {
    const key = (i.supplier || '').trim() + '|' + (i.supplierWhatsapp || '').trim();
    if(!groups[key]) groups[key] = { supplier: (i.supplier || '').trim(), whatsapp: (i.supplierWhatsapp || '').trim(), items: [] };
    groups[key].items.push(i);
  });
  const list = Object.values(groups);
  const bodyHtml = list.length ? list.map(g => {
    const msg = 'أهلاً' + (g.supplier ? ' ' + g.supplier : '') + '،\nمحتاج أطلب الأصناف دي:\n' + g.items.map(i => '- ' + i.name + (i.type ? ' (' + i.type + ')' : '') + ' — المتاح عندي ' + (parseFloat(i.qty) || 0)).join('\n') + '\nمتوفرين؟ 🙏';
    return `
      <div class="card" style="margin-bottom:10px;">
        <div class="row" style="justify-content:space-between;align-items:center;">
          <b>${escapeHtml(g.supplier || 'من غير مورد مسجل')}</b>
          ${g.whatsapp ? `<a class="wa-btn small" href="${escapeHtml(buildWhatsappLinkWithText(g.whatsapp, msg))}" target="_blank" rel="noopener">💬 ابعت طلب</a>` : `<span style="font-size:12px;color:var(--muted);">مفيش رقم واتساب</span>`}
        </div>
        <div style="font-size:12.5px;color:var(--muted);margin-top:6px;line-height:1.8;">${g.items.map(i => escapeHtml(i.name) + ' (' + (parseFloat(i.qty) || 0) + ')').join('، ')}</div>
      </div>`;
  }).join('') : `<div class="placeholder">مفيش أصناف محتاجة توريد</div>`;
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" style="max-width:480px;width:95%;max-height:85vh;overflow-y:auto;"><h3>اطلب من المورد</h3>${bodyHtml}<div class="modal-actions"><button id="supOrderCloseBtn">تمام</button></div></div>`;
  document.body.appendChild(bg);
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('supOrderCloseBtn').onclick = () => bg.remove();
}

function renderInventoryView(){
  ensureInventoryStyles();
  const lowItems = state.inventory.filter(i => isLowStockItem(i));
  const summaryHtml = `
    <div class="card inv-summary">
      <div>
        <h2>${lowItems.length ? lowItems.length + ' أصناف محتاجة توريد' : 'كل الأصناف تمام'}</h2>
        ${lowItems.length ? `<div class="inv-low-names">${lowItems.slice(0, 6).map(i => escapeHtml(i.name) + ' (' + (parseFloat(i.qty) || 0) + ')').join('، ')}${lowItems.length > 6 ? ' …' : ''}</div>` : ''}
      </div>
      <div class="row" style="gap:8px;">
        ${lowItems.length ? `<button id="orderFromSupplierBtn">اطلب من المورد</button>` : ''}
        <button class="secondary" id="addMainCategoryBtn">+ إضافة صنف رئيسي</button>
      </div>
    </div>
  `;
  return `
    <div class="breadcrumb">
      <span class="crumb" id="crumbClinics3">العيادات</span>
      <span class="sep">/</span>
      <span>المخزن (كل العيادات)</span>
    </div>
    ${summaryHtml}
    ${inventoryTabsHtml()}
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
  if(!item) return '';
  return `
    <div class="tooth tooth-shaped reveal-tooth ${out?'broken':(low?'low-refill':'')}" data-reveal-item="${item.id}" title="${escapeHtml(item.name)} — الكمية المتاحة: ${qty}${low ? ' ⚠ ناقص' : ''}">
      <span class="badge">${qty}</span>
      ${toothShapeSvg(item.toothNum)}
      <span class="tnum">${fdiToPalmer(item.toothNum)}</span>
    </div>
  `;
}

function renderRevealCategoryBody(cat){
  ensureToothShapeStyles();
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
    const ok = await saveInventory();
    bg.remove();
    render();
    if(ok) toast('اتحدثت الكمية');
  };
  setTimeout(()=>document.getElementById('revealQtyInput').focus(), 50);
}

async function deleteRevealTooth(itemId){
  const item = state.inventory.find(i=>i.id === itemId);
  if(!item) return;
  if(!(await confirmModal(`متأكد إنك عاوز تمسح فص ${fdiToPalmer(item.toothNum)} خالص من شارت ${item.category === REVEAL_MBT_CATEGORY_ID ? 'MBT' : 'ROTH'}؟ (هيتحفظ في سلة المحذوفات 5 أيام)`, {danger:true}))) return;
  const key = item.category + ':' + item.toothNum;
  state.inventory = state.inventory.filter(i=>i.id !== itemId);
  if(!state.deletedRevealTeeth.includes(key)) state.deletedRevealTeeth.push(key);
  const ok = await saveInventory();
  render();
  if(!ok) return; // فشل الحفظ أو تعارض — setData بيبقى وضح السبب في التوست بتاعه
  await saveDeletedRevealTeeth();
  await addToTrash({ kind: 'reveal_tooth', label: `فص ${fdiToPalmer(item.toothNum)} — شارت ${item.category === REVEAL_MBT_CATEGORY_ID ? 'MBT' : 'ROTH'}`, restore: { item, revealKey: key } });
  toast('اتمسح الفص من الشارت');
}

async function quickDeductRevealItem(itemId){
  const item = state.inventory.find(i=>i.id === itemId);
  if(!item) return;
  // P0-4: لو الفص خلص (كمية 0) نرفض بتنبيه واضح بدل ما نسجل خصمة وهمية
  if(!(await validateAndDeductBatch([{ item, qty: 1, label: item.name }]))) return;
  // 'queued' (مفيش نت) = الخصم اتحفظ على الجهاز وهيتبعت — منرجّعوش في الشاشة (كنا بنرجّعه فيظهر
  // غير اللي هيتبعت فعلًا)؛ 'failed' (تعارض) = المخزن اتحمّل من السيرفر
  if((await saveInventoryOutcome()) === 'failed'){ render(); return; }
  render();
  await logActivity('deduct_reveal_item', `خصم وحدة من فص ${fdiToPalmer(item.toothNum)} — "${item.name}" (الكمية بقت ${item.qty})`);
  toast('اتخصمت وحدة من فص ' + fdiToPalmer(item.toothNum));
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
  document.querySelectorAll('.inv-more button').forEach(el=>{
    el.addEventListener('click', () => { const d = el.closest('details'); if(d) d.open = false; });
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
  const orderBtn = document.getElementById('orderFromSupplierBtn');
  if(orderBtn) orderBtn.onclick = () => openSupplierOrderModal();
  document.querySelectorAll('[data-inv-tab]').forEach(el => {
    el.onclick = () => { state.inventoryTab = el.dataset.invTab; render(); };
  });
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
    const ok = await saveInventoryCategories();
    bg.remove();
    render();
    if(ok) toast('اتعدل الصنف الرئيسي');
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
  const removedItems = state.inventory.filter(i=>i.category===catId);
  const itemsCount = removedItems.length;
  const msg = (itemsCount
    ? `حذف "${cat.label}" هيمسح معاه كل الأصناف اللي جواه (${itemsCount} صنف). متأكد؟`
    : `حذف "${cat.label}"؟`) + ' (هيتحفظ في سلة المحذوفات 5 أيام)';
  if(!(await confirmModal(msg, {danger:true}))) return;
  state.inventoryCategories = state.inventoryCategories.filter(c=>c.id !== catId);
  const okCats = await saveInventoryCategories();
  if(!okCats){
    // فشل الحفظ أو تعارض (categories اترجعت لآخر نسخة من السيرفر جوه handleConcurrencyConflict) —
    // متكملش نمسح أصناف المخزون كمان، وإلا الصنف الرئيسي هيفضل موجود من غير أي أصناف جواه
    render();
    return;
  }
  state.inventory = state.inventory.filter(i=>i.category !== catId);
  const okItems = await saveInventory();
  render();
  if(!okItems) return;
  await addToTrash({ kind: 'inventory_category', label: `صنف رئيسي: ${cat.label} (${itemsCount} صنف)`, restore: { category: cat, items: removedItems } });
  toast('اتمسح الصنف الرئيسي');
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
    const ok = await saveInventoryCategories();
    bg.remove();
    render();
    if(ok) toast('اتضاف الصنف الرئيسي');
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
    const ok = await saveInventory();
    bg.remove();
    render();
    if(ok) toast('اتضاف الصنف');
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
    const ok = await saveInventory();
    bg.remove();
    render();
    if(ok) toast('اتحفظ التعديل');
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
    item.lastRestockedAt = todayStr();
    const ok = await saveInventory();
    bg.remove();
    render();
    if(!ok) return; // فشل الحفظ أو تعارض — setData بيبقى وضح السبب في التوست بتاعه
    await logActivity('restock_item', `ورّد ${add} من "${item.name}" (الكمية بقت ${item.qty})`);
    toast('اتحدثت الكمية');
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
    items.forEach(i=>{ i.qty = (parseFloat(i.qty)||0) + add; i.lastRestockedAt = todayStr(); });
    const ok = await saveInventory();
    bg.remove();
    render();
    if(!ok) return; // فشل الحفظ أو تعارض — setData بيبقى وضح السبب في التوست بتاعه
    await logActivity('bulk_restock', `توريد جماعي: أضاف ${add} لكل صنف في "${cat.label}" (${items.length} صنف)`);
    toast(`اتضافت ${add} لكل صنف من "${cat.label}" (${items.length} صنف)`);
  };
  setTimeout(()=>document.getElementById('bulkRestockQty').focus(), 50);
}

async function adjustInventoryQty(itemId, delta){
  const item = state.inventory.find(i=>i.id === itemId);
  if(!item) return;
  const prevQty = parseFloat(item.qty) || 0;
  const prevRestocked = item.lastRestockedAt;
  if(delta < 0){
    // P0-4: النقص اليدوي بيعدي على نفس التحقق — مفيش نزول تحت الصفر بصمت
    if(!(await validateAndDeductBatch([{ item, qty: Math.abs(delta), label: item.name }]))) return;
  } else {
    item.qty = prevQty + delta;
    item.lastRestockedAt = todayStr();
  }
  if((await saveInventoryOutcome()) === 'failed'){
    if(state.inventory.includes(item)){ item.qty = prevQty; item.lastRestockedAt = prevRestocked; }
    render();
    return;
  }
  render();
  await logActivity('adjust_inventory', `${delta < 0 ? 'استخدم' : 'أضاف'} ${Math.abs(delta)} من "${item.name}" (الكمية بقت ${item.qty})`);
  if(isLowStockItem(item)){
    toast('⚠️ ' + item.name + ' وصل لحد الإنذار (' + item.qty + ')');
  }
}

async function deleteInventoryItem(itemId){
  if(!(await confirmModal('حذف الصنف ده؟ (هيتحفظ في سلة المحذوفات 5 أيام)', {danger:true}))) return;
  const item = state.inventory.find(i=>i.id === itemId);
  state.inventory = state.inventory.filter(i=>i.id !== itemId);
  const ok = await saveInventory();
  render();
  if(!ok) return; // فشل الحفظ أو تعارض — setData بيبقى وضح السبب في التوست بتاعه
  if(item) await addToTrash({ kind: 'inventory_item', label: `صنف مخزون: ${item.name}`, restore: { item } });
  await logActivity('delete_inventory_item', `حذف صنف من المخزون: ${item ? item.name : itemId}`);
}

