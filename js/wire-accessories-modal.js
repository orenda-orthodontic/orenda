// wire-accessories-modal.js — نافذة اختيار الواير (فوق/تحت) والإيلاستيك والأكسسوارات والتيوبات (الضروس 7) لتسجيلات
// المتابعة الشهرية، بدل كتابتهم كنص حر واستنى الكود يتعرف عليهم. بيحل مشكلة إن كل دكتور بيكتب
// بصياغة مختلفة (wire 14 / سلك 16 / NiTi...) فيفشل الخصم بصمت — هنا الاختيار من قايمة فعلية،
// مضمون 100%. الصنف اللي خلص من المخزن يفضل ظاهر في القايمة لكن مش قابل للاختيار (disabled)،
// مش بيختفي، عشان الدكتور يعرف إنه موجود بس محتاج توريد.
// باقي أنواع الخصم (bonding upper/lower، rebonding/فص، tube، bracket) تفضل زي ما هي بالـ
// keyword في keyword-deduction.js — الملف ده بيغطي الواير والإيلاستيك والأكسسوارات بس.


// ---- Tubes (الضروس 7): أرقام FDI الحقيقية (نفس ترقيم تيوبات المخزن). الخصم بيتم بنفس خطوات الواير،
// ومفيش أي علاقة بالـ Rebond ولا بالـ 300 جنيه — ده تركيب تيوب متأخر عادي، وممكن يتكرر في أي زيارة.
const WAM_TUBE_TEETH = { upper: ['27', '17'], lower: ['37', '47'] }; // الصفحة RTL: أول عنصر على يمين الشاشة. نفس اتجاه تاب الـ Brackets: يمين المريض (UR/LR) على شمال الشاشة، وشمال المريض (UL/LL) على يمينها
function wamTubeChartHtml(){
  const tooth = (n) => {
    const it = findTubeItemByFDI(n);
    const qty = it ? (parseFloat(it.qty) || 0) : 0;
    const cls = (!it || qty <= 0) ? ' low-refill' : '';
    const tip = !it ? 'مفيش صنف Tube للسن ده في المخزن' : ('متاح: ' + qty);
    return `<div class="tooth tooth-shaped wam-tube-tooth${cls}" data-tooth="${n}" title="${escapeHtml(tip)}">${toothShapeSvg(n)}<span class="tnum">${realFdiToPalmer(n)}</span></div>`;
  };
  const row = (arr) => `<div class="tooth-row" style="justify-content:center;gap:10px;">${tooth(arr[0])}<div class="quad-gap" style="flex:0 0 18px;"></div>${tooth(arr[1])}</div>`;
  return `
    <div class="tooth-arch" style="margin:6px 0 4px;"><div class="arch-label">الفك العلوي (Upper)</div>${row(WAM_TUBE_TEETH.upper)}</div>
    <div class="tooth-arch" style="margin:0;"><div class="arch-label">الفك السفلي (Lower)</div>${row(WAM_TUBE_TEETH.lower)}</div>
  `;
}

function wamOptionsHtml(items){
  return items.map(i => {
    const qty = parseFloat(i.qty) || 0;
    const typeLabel = i.type ? ` (${i.type})` : '';
    return `<option value="${i.id}" ${qty <= 0 ? 'disabled' : ''}>${escapeHtml(i.name)}${typeLabel} — متاح: ${qty}</option>`;
  }).join('');
}

// returns { wiresUpper:[itemId,...], wiresLower:[itemId,...], elastics:[itemId,...], accessories:[{itemId, field}], tubes:[fdi,...] } or null
// (الواير بقى متعدد لكل فك — حالات اتنين واير في نفس الفك)
// (field = 'doneUpper' | 'doneLower' | 'doneBoth' — بيتسأل عنه وقت اختيار كل أكسسوار)
function openWireAccessoriesModal(){
  const wireItems = (state.inventory || []).filter(i => i.category === 'wires').sort((a,b) => a.name.localeCompare(b.name));
  const elasticItems = (state.inventory || []).filter(i => i.category === 'elastics').sort((a,b) => a.name.localeCompare(b.name));
  const accessoryItems = (state.inventory || []).filter(i => i.category === 'accessories').sort((a,b) => a.name.localeCompare(b.name));
  const pickedWiresUpper = []; // [{itemId, name}]
  const pickedWiresLower = []; // [{itemId, name}]
  const pickedElastics = []; // [{itemId, name}]
  const pickedAccessories = []; // [{itemId, name}]
  const pickedTubes = new Set(); // FDI strings ('17','27','37','47')

  ensureToothShapeStyles();
  return new Promise(resolve => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `
      <div class="modal" style="max-width:420px;">
        <h3>واير وإيلاستيك وأكسسوارات وتيوبات — المتابعة دي</h3>
        <div style="max-height:60vh;overflow-y:auto;padding-inline-end:4px;">
          <div class="field">
            <label>واير فوق (Upper) — تقدر تختار أكتر من واحد</label>
            <select id="wamWireUpper" style="width:100%;">
              <option value="">— اختار واير (بيتضاف على طول) —</option>
              ${wamOptionsHtml(wireItems)}
            </select>
            <div id="wamWireUpperList" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;"></div>
          </div>
          <div class="field" style="margin-top:12px;">
            <label>واير تحت (Lower) — تقدر تختار أكتر من واحد</label>
            <select id="wamWireLower" style="width:100%;">
              <option value="">— اختار واير (بيتضاف على طول) —</option>
              ${wamOptionsHtml(wireItems)}
            </select>
            <div id="wamWireLowerList" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;"></div>
          </div>
          <div class="field" style="margin-top:16px;">
            <label>إضافة إيلاستيك</label>
            <div class="row" style="gap:6px;">
              <select id="wamElasticSelect" style="flex:1;">
                <option value="">— اختار صنف (بيتضاف على طول) —</option>
                ${wamOptionsHtml(elasticItems)}
              </select>
            </div>
            <div id="wamElasticList" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;"></div>
          </div>
          <div class="field" style="margin-top:16px;">
            <label>إضافة أكسسوار</label>
            <div class="row" style="gap:6px;">
              <select id="wamAccessorySelect" style="flex:1;">
                <option value="">— اختار صنف (بيتضاف على طول) —</option>
                ${wamOptionsHtml(accessoryItems)}
              </select>
            </div>
            <div id="wamAccessoryList" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;"></div>
          </div>
          <div class="field" style="margin-top:16px;">
            <label>تيوبات (الضروس 7) — دوس على السن عشان تختاره، ودوس تاني عشان تشيله</label>
            <div id="wamTubeChart">${wamTubeChartHtml()}</div>
            <div class="placeholder" style="padding:6px;font-size:12px;margin-top:4px;">بيتخصم من المخزن بنفس عدد الأسنان المختارة، وتقدر تعمله في أي زيارة (مش لازم من أول يوم). مش بيتحسب Rebond ومفيش 300 جنيه.</div>
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
          ${escapeHtml(a.name)}${a.fieldLabel ? ' (' + escapeHtml(a.fieldLabel) + ')' : ''}
          <button type="button" class="stage-date-remove" data-idx="${idx}">×</button>
        </span>
      `).join('');
      listEl.querySelectorAll('[data-idx]').forEach(btn => {
        btn.onclick = () => { picked.splice(parseInt(btn.dataset.idx, 10), 1); rerender(); };
      });
    }
    const renderWireUpperChips = () => renderChipList('wamWireUpperList', pickedWiresUpper, renderWireUpperChips);
    const renderWireLowerChips = () => renderChipList('wamWireLowerList', pickedWiresLower, renderWireLowerChips);
    const addWireOnSelect = (selId, picked, rerender) => {
      document.getElementById(selId).onchange = (ev) => {
        const sel = ev.target;
        const id = sel.value;
        sel.value = '';
        if(!id) return;
        const item = wireItems.find(i => i.id === id);
        if(!item) return;
        picked.push({ itemId: item.id, name: item.name + (item.type ? ' (' + item.type + ')' : '') });
        rerender();
      };
    };
    addWireOnSelect('wamWireUpper', pickedWiresUpper, renderWireUpperChips);
    addWireOnSelect('wamWireLower', pickedWiresLower, renderWireLowerChips);
    const renderElasticChips = () => renderChipList('wamElasticList', pickedElastics, renderElasticChips);
    const renderAccessoryChips = () => renderChipList('wamAccessoryList', pickedAccessories, renderAccessoryChips);

    // الاختيار من القايمة بيضيف الصنف على طول (زي الواير) — من غير زرار "إضافة"
    document.getElementById('wamElasticSelect').onchange = (ev) => {
      const sel = ev.target;
      const id = sel.value;
      sel.value = '';
      if(!id) return;
      const item = elasticItems.find(i => i.id === id);
      if(!item) return;
      pickedElastics.push({ itemId: item.id, name: item.name });
      renderElasticChips();
    };

    // الأكسسوار بيتسأل فوق ولا تحت ولا الاتنين أول ما تختاره (لو لغيت السؤال مش بيتضاف)
    document.getElementById('wamAccessorySelect').onchange = async (ev) => {
      const sel = ev.target;
      const id = sel.value;
      sel.value = '';
      if(!id) return;
      const item = accessoryItems.find(i => i.id === id);
      if(!item) return;
      const field = await askChoice('الأكسسوار', `${item.name} — فوق ولا تحت؟`, [
        { value: 'doneUpper', label: 'فوق' },
        { value: 'doneLower', label: 'تحت' },
        { value: 'doneBoth', label: 'الاتنين' }
      ]);
      if(!field) return;
      const fieldLabel = field === 'doneUpper' ? 'فوق' : (field === 'doneLower' ? 'تحت' : 'الاتنين');
      pickedAccessories.push({ itemId: item.id, name: item.name, field, fieldLabel });
      renderAccessoryChips();
    };

    document.querySelectorAll('#wamTubeChart .wam-tube-tooth').forEach(el => {
      el.onclick = () => {
        const n = el.dataset.tooth;
        if(pickedTubes.has(n)){ pickedTubes.delete(n); el.classList.remove('selected'); }
        else { pickedTubes.add(n); el.classList.add('selected'); }
      };
    });

    let done = false;
    const cleanup = (result) => { if(done) return; done = true; bg.remove(); resolve(result); };
    document.getElementById('wamCancelBtn').onclick = () => cleanup(null);
    bg.onclick = (e) => { if(e.target === bg) cleanup(null); };
    document.getElementById('wamConfirmBtn').onclick = () => {
      if(!pickedWiresUpper.length && !pickedWiresLower.length && !pickedElastics.length && !pickedAccessories.length && !pickedTubes.size){ cleanup(null); return; }
      cleanup({
        wiresUpper: pickedWiresUpper.map(a => a.itemId),
        wiresLower: pickedWiresLower.map(a => a.itemId),
        elastics: pickedElastics.map(a => a.itemId),
        accessories: pickedAccessories.map(a => ({ itemId: a.itemId, field: a.field })),
        tubes: [...pickedTubes]
      });
    };
  });
}

// السطر اللي بيتكتب في الملاحظة لصنف اتخصم: "Wire 0.012 NiTi" / "Elastic 3/16" / اسم الأكسسوار —
// بيضيف الكلمة التعريفية بس لو اسم الصنف مش فيه كلمة تدل عليه أصلًا (عشان ماتتكررش "Wire Wire ...")
function wamNoteLine(it){
  const name = String((it.item && it.item.name) || '').trim();
  if(!name) return '';
  if(it.role === 'upper' || it.role === 'lower'){
    const type = String((it.item && it.item.type) || '').trim();
    const withType = (type && !name.toLowerCase().includes(type.toLowerCase())) ? name + ' ' + type : name;
    return /wire|سلك|واير/i.test(name) ? withType : 'Wire ' + withType;
  }
  if(it.role === 'tube') return 'Tube ' + realFdiToPalmer(it.fdi);
  if(it.role === 'elastic') return /elastic|ايلاستيك|إيلاستيك/i.test(name) ? name : 'Elastic ' + name;
  return name;
}

// opens the picker for one monthly entry and applies the deduction exactly like the rest of the
// keyword-based deductions do: confirm -> deduct inventory (saved first) -> only then record the
// materialsUsed lines on the entry, so a failed/conflicting inventory save never gets recorded
// as if it succeeded.
async function handleWireAccessoriesForEntry(entryId){
  const picked = await openWireAccessoriesModal();
  if(!picked) return;

  // التيوب لازم يكون له صنف في المخزن — نتأكد قبل ما نعمل أي حاجة (ومن غير ما نفتح تسجيل فاضي)
  const tubeFdis = (picked.tubes || []).slice().sort();
  const missingTubes = tubeFdis.filter(n => !findTubeItemByFDI(n));
  if(missingTubes.length){
    await alertModal('مفيش صنف Tube مسجل في المخزن للأسنان: ' + missingTubes.map(realFdiToPalmer).join('، ') + '\nضيفه الأول من المخزن (قسم تيوبات، وحط رقم السن ' + missingTubes.join(' / ') + ') وبعدين كرر العملية.');
    return;
  }

  // the entry might still be an unsaved draft (main form loaded straight into "this month" with
  // nothing typed yet) — only materialize it into a real monthlyLog entry once the user actually
  // confirmed a deduction, not just for opening/cancelling the picker
  materializeMonthlyDraft(entryId);
  const file = state.currentPatientFile;
  const e = (file.monthlyLog || []).find(x => x.id === entryId);
  if(!e) return;

  const items = [];
  (picked.wiresUpper || []).forEach(id => {
    const item = state.inventory.find(i => i.id === id);
    if(item) items.push({ item, label: item.name + ' (فوق)', role: 'upper' });
  });
  (picked.wiresLower || []).forEach(id => {
    const item = state.inventory.find(i => i.id === id);
    if(item) items.push({ item, label: item.name + ' (تحت)', role: 'lower' });
  });
  (picked.elastics || []).forEach(id => {
    const item = state.inventory.find(i => i.id === id);
    if(item) items.push({ item, label: item.name, role: 'elastic' });
  });
  (picked.accessories || []).forEach(acc => {
    const item = state.inventory.find(i => i.id === acc.itemId);
    if(item){
      const fl = acc.field === 'doneUpper' ? ' (فوق)' : (acc.field === 'doneLower' ? ' (تحت)' : '');
      items.push({ item, label: item.name + fl, role: 'accessory', field: acc.field });
    }
  });
  tubeFdis.forEach(fdi => {
    const item = findTubeItemByFDI(fdi);
    if(item) items.push({ item, label: item.name + ' (' + realFdiToPalmer(fdi) + ')', role: 'tube', fdi });
  });
  if(!items.length) return;

  const msg = 'هيتخصم من المخزن:\n' + items.map(it => '- ' + it.label).join('\n') + '\n\nموافق؟';
  if(!(await confirmModal(msg))) return;

  // P0-4: تحقق من التوفر لكل الأصناف دفعة واحدة (all-or-nothing) — لو صنف واحد ناقص مفيش
  // حاجة بتتخصم خالص، بدل الخصم المباشر اللي كان بينزّل الكمية صفر بصمت
  const deductList = items.map(it => ({ item: it.item, qty: 1, label: it.label }));
  if(!(await validateAndDeductBatch(deductList))) return;

  const stockAlerts = items.filter(it => isLowStockItem(it.item)).map(it => it.item.name);
  // 'queued' (مفيش نت) بنكمل؛ 'failed' (تعارض) بس هو اللي بيوقف — المخزن اتحمّل من السيرفر
  if((await saveInventoryOutcome()) === 'failed'){
    render();
    return;
  }

  if(!e.materialsUsed) e.materialsUsed = [];
  items.forEach(it => {
    e.materialsUsed.push({ id: uid(), itemId: it.item.id, itemName: it.item.name, itemType: it.item.type || '', qty: 1, source: 'manual' });
  });
  // كتابة تلقائية في خانات "اللي اتعمل الشهر ده" (زي Bonding): واير فوق ← خانة فوق، واير تحت ←
  // خانة تحت، إيلاستيك ← خانة الاتنين، أكسسوار ← الخانة اللي اخترتها. بتتحفظ مع نفس الحفظ تحت (مفيش حفظ زيادة).
  items.forEach(it => {
    const line = wamNoteLine(it);
    if(!line) return;
    // واير فوق ← فوق، واير تحت ← تحت، إيلاستيك ← الاتنين دايمًا، أكسسوار ← اللي اخترته وقت الاختيار
    const field = it.role === 'tube' ? ((it.fdi[0] === '1' || it.fdi[0] === '2') ? 'doneUpper' : 'doneLower')
      : it.role === 'upper' ? 'doneUpper'
      : (it.role === 'lower' ? 'doneLower'
      : (it.role === 'accessory' ? (it.field || 'doneBoth') : 'doneBoth'));
    appendToMonthlyField(e, field, line);
  });
  // لو حفظ ملف المريض اتلغى بتعارض، الخصم بيتعكس تلقائي بدل ما يفضل ناقص من غير سجل استخدام
  if(!(await savePatientFileAfterStockChange(state.currentPatientId, file, deductList, 'deduct'))){ render(); return; }
  await logActivity('material_deduct', `خصم واير/إيلاستيك/أكسسوار/تيوب: ${items.map(it=>it.label).join('، ')} — مريض ${patientNameForLog()}`);
  toast(stockAlerts.length ? `اتخصم من المخزن — ⚠ ${stockAlerts.join('، ')} وصل لحد الإنذار` : 'اتخصم من المخزن');
  render();
}
