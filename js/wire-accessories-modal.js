// wire-accessories-modal.js — نافذة اختيار الواير (فوق/تحت) والإيلاستيك والأكسسوارات لتسجيلات
// المتابعة الشهرية، بدل كتابتهم كنص حر واستنى الكود يتعرف عليهم. بيحل مشكلة إن كل دكتور بيكتب
// بصياغة مختلفة (wire 14 / سلك 16 / NiTi...) فيفشل الخصم بصمت — هنا الاختيار من قايمة فعلية،
// مضمون 100%. الصنف اللي خلص من المخزن يفضل ظاهر في القايمة لكن مش قابل للاختيار (disabled)،
// مش بيختفي، عشان الدكتور يعرف إنه موجود بس محتاج توريد.
// باقي أنواع الخصم (bonding upper/lower، rebonding/فص، tube، bracket) تفضل زي ما هي بالـ
// keyword في keyword-deduction.js — الملف ده بيغطي الواير والإيلاستيك والأكسسوارات بس.

function wamOptionsHtml(items){
  return items.map(i => {
    const qty = parseFloat(i.qty) || 0;
    const typeLabel = i.type ? ` (${i.type})` : '';
    return `<option value="${i.id}" ${qty <= 0 ? 'disabled' : ''}>${escapeHtml(i.name)}${typeLabel} — متاح: ${qty}</option>`;
  }).join('');
}

// returns { wireUpperId, wireLowerId, elastics:[itemId,...], accessories:[itemId,...] } or null
function openWireAccessoriesModal(){
  const wireItems = (state.inventory || []).filter(i => i.category === 'wires').sort((a,b) => a.name.localeCompare(b.name));
  const elasticItems = (state.inventory || []).filter(i => i.category === 'elastics').sort((a,b) => a.name.localeCompare(b.name));
  const accessoryItems = (state.inventory || []).filter(i => i.category === 'accessories').sort((a,b) => a.name.localeCompare(b.name));
  const pickedElastics = []; // [{itemId, name}]
  const pickedAccessories = []; // [{itemId, name}]

  return new Promise(resolve => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `
      <div class="modal" style="max-width:420px;">
        <h3>واير وإيلاستيك وأكسسوارات — المتابعة دي</h3>
        <div style="max-height:60vh;overflow-y:auto;padding-inline-end:4px;">
          <div class="field">
            <label>واير فوق (Upper)</label>
            <select id="wamWireUpper">
              <option value="">— من غير تغيير —</option>
              ${wamOptionsHtml(wireItems)}
            </select>
          </div>
          <div class="field" style="margin-top:12px;">
            <label>واير تحت (Lower)</label>
            <select id="wamWireLower">
              <option value="">— من غير تغيير —</option>
              ${wamOptionsHtml(wireItems)}
            </select>
          </div>
          <div class="field" style="margin-top:16px;">
            <label>إضافة إيلاستيك</label>
            <div class="row" style="gap:6px;">
              <select id="wamElasticSelect" style="flex:1;">
                <option value="">— اختار صنف —</option>
                ${wamOptionsHtml(elasticItems)}
              </select>
              <button type="button" class="secondary small" id="wamAddElasticBtn">+ إضافة</button>
            </div>
            <div id="wamElasticList" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;"></div>
          </div>
          <div class="field" style="margin-top:16px;">
            <label>إضافة أكسسوار</label>
            <div class="row" style="gap:6px;">
              <select id="wamAccessorySelect" style="flex:1;">
                <option value="">— اختار صنف —</option>
                ${wamOptionsHtml(accessoryItems)}
              </select>
              <button type="button" class="secondary small" id="wamAddAccessoryBtn">+ إضافة</button>
            </div>
            <div id="wamAccessoryList" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;"></div>
          </div>
          ${(!wireItems.length && !elasticItems.length && !accessoryItems.length) ? `<div class="placeholder" style="margin-top:10px;">مفيش أصناف مسجلة في قسم "وايرز" أو "إيلاستيك" أو "أكسسوريز" بالمخزون — ضيفهم الأول من شاشة المخزون.</div>` : ''}
        </div>
        <div class="modal-actions">
          <button class="secondary" id="wamCancelBtn">إلغاء</button>
          <button id="wamConfirmBtn">تأكيد الخصم</button>
        </div>
      </div>
    `;
    document.body.appendChild(bg);

    function renderChipList(listElId, picked, rerender){
      const listEl = document.getElementById(listElId);
      listEl.innerHTML = picked.map((a, idx) => `
        <span class="stage-date-chip">
          ${escapeHtml(a.name)}
          <button type="button" class="stage-date-remove" data-idx="${idx}">×</button>
        </span>
      `).join('');
      listEl.querySelectorAll('[data-idx]').forEach(btn => {
        btn.onclick = () => { picked.splice(parseInt(btn.dataset.idx, 10), 1); rerender(); };
      });
    }
    const renderElasticChips = () => renderChipList('wamElasticList', pickedElastics, renderElasticChips);
    const renderAccessoryChips = () => renderChipList('wamAccessoryList', pickedAccessories, renderAccessoryChips);

    document.getElementById('wamAddElasticBtn').onclick = () => {
      const sel = document.getElementById('wamElasticSelect');
      const id = sel.value;
      if(!id) return;
      const item = elasticItems.find(i => i.id === id);
      if(!item) return;
      pickedElastics.push({ itemId: item.id, name: item.name });
      sel.value = '';
      renderElasticChips();
    };

    document.getElementById('wamAddAccessoryBtn').onclick = () => {
      const sel = document.getElementById('wamAccessorySelect');
      const id = sel.value;
      if(!id) return;
      const item = accessoryItems.find(i => i.id === id);
      if(!item) return;
      pickedAccessories.push({ itemId: item.id, name: item.name });
      sel.value = '';
      renderAccessoryChips();
    };

    let done = false;
    const cleanup = (result) => { if(done) return; done = true; bg.remove(); resolve(result); };
    document.getElementById('wamCancelBtn').onclick = () => cleanup(null);
    bg.onclick = (e) => { if(e.target === bg) cleanup(null); };
    document.getElementById('wamConfirmBtn').onclick = () => {
      const wireUpperId = document.getElementById('wamWireUpper').value || null;
      const wireLowerId = document.getElementById('wamWireLower').value || null;
      if(!wireUpperId && !wireLowerId && !pickedElastics.length && !pickedAccessories.length){ cleanup(null); return; }
      cleanup({
        wireUpperId, wireLowerId,
        elastics: pickedElastics.map(a => a.itemId),
        accessories: pickedAccessories.map(a => a.itemId)
      });
    };
  });
}

// opens the picker for one monthly entry and applies the deduction exactly like the rest of the
// keyword-based deductions do: confirm -> deduct inventory (saved first) -> only then record the
// materialsUsed lines on the entry, so a failed/conflicting inventory save never gets recorded
// as if it succeeded.
async function handleWireAccessoriesForEntry(entryId){
  const picked = await openWireAccessoriesModal();
  if(!picked) return;

  // the entry might still be an unsaved draft (main form loaded straight into "this month" with
  // nothing typed yet) — only materialize it into a real monthlyLog entry once the user actually
  // confirmed a deduction, not just for opening/cancelling the picker
  materializeMonthlyDraft(entryId);
  const file = state.currentPatientFile;
  const e = (file.monthlyLog || []).find(x => x.id === entryId);
  if(!e) return;

  const items = [];
  if(picked.wireUpperId){
    const item = state.inventory.find(i => i.id === picked.wireUpperId);
    if(item) items.push({ item, label: item.name + ' (فوق)' });
  }
  if(picked.wireLowerId){
    const item = state.inventory.find(i => i.id === picked.wireLowerId);
    if(item) items.push({ item, label: item.name + ' (تحت)' });
  }
  (picked.elastics || []).forEach(id => {
    const item = state.inventory.find(i => i.id === id);
    if(item) items.push({ item, label: item.name });
  });
  (picked.accessories || []).forEach(id => {
    const item = state.inventory.find(i => i.id === id);
    if(item) items.push({ item, label: item.name });
  });
  if(!items.length) return;

  const msg = 'هيتخصم من المخزن:\n' + items.map(it => '- ' + it.label).join('\n') + '\n\nموافق؟';
  if(!(await confirmModal(msg))) return;

  const stockAlerts = [];
  items.forEach(it => {
    it.item.qty = Math.max(0, (parseFloat(it.item.qty) || 0) - 1);
    if(isLowStockItem(it.item)) stockAlerts.push(it.item.name);
  });
  const okInv = await saveInventory();
  if(!okInv){
    // فشل الحفظ أو تعارض — setData بيبقى وضح السبب في التوست بتاعه، فمنكملش نسجل استخدام
    // مبني على خصم اتلغى
    render();
    return;
  }

  if(!e.materialsUsed) e.materialsUsed = [];
  items.forEach(it => {
    e.materialsUsed.push({ id: uid(), itemId: it.item.id, itemName: it.item.name, qty: 1, source: 'manual' });
  });
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast(stockAlerts.length ? `اتخصم من المخزن — ⚠ ${stockAlerts.join('، ')} وصل لحد الإنذار` : 'اتخصم من المخزن');
  render();
}
