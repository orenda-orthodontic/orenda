// trash.js — سلة محذوفات عامة لكل زراير الحذف في البرنامج (مريض، دفعة، رسوم، متابعة شهرية،
// سجل كسر/استخدام مادة، صورة، زيارة، ملاحظة، صنف/فص مخزون، مرحلة علاج مخصصة...).
//
// الفكرة: بدل ما أي حذف يكون نهائي على طول، بيترحّل لمصفوفة واحدة تحت مفتاح 'trash' (نفس فكرة
// orthoNotes/customStageTypes — مصفوفة واحدة محمية بحماية التعارض بين الأجهزة). كل عنصر فيها
// بيفضل قابل للاسترجاع TRASH_RETENTION_DAYS يوم، وبعدها بيتشال نهائي أوتوماتيك عند أول boot بعد
// انتهاء المهلة (purgeOldTrash — بتتنادى من main.js زي maybeRunAutoBackup بالظبط).
//
// مهم جدًا: أي حذف بيرجّع مخزون (كسر بريكت / استخدام مادة) أو بيمسح صورة من التخزين، الأثر الجانبي
// ده بيتأجل لحد الـpurge الفعلي (أو بيتراجع وقت الاسترجاع لو اتسحب من المخزون فعلاً) — مش بيحصل
// وقت الحذف الأول — عشان الصورة/الكمية تفضل "زي ما هي" طول ما العنصر لسه قابل للرجوع.

const TRASH_KEY = 'trash';
const TRASH_RETENTION_DAYS = 10;

function ensureTrashLoaded(){
  if(!Array.isArray(state.trash)) state.trash = [];
}

async function loadTrash(){
  state.trash = await getData(TRASH_KEY, []);
}

async function saveTrash(){
  return await setData(TRASH_KEY, state.trash);
}

// entry = { kind, label, restore } — id/deletedAt بيتحطوا هنا. بترجع true/false حسب نجاح الحفظ
// (زي باقي دوال save في البرنامج) عشان المستدعي يقدر يوقف باقي خطوات الحذف لو الحفظ فشل.
async function addToTrash(entry){
  ensureTrashLoaded();
  state.trash.push({
    id: uid(),
    deletedAt: new Date().toISOString(),
    kind: entry.kind,
    label: entry.label,
    restore: entry.restore
  });
  return await saveTrash();
}

function daysLeftInTrash(entry){
  const ageMs = Date.now() - new Date(entry.deletedAt).getTime();
  return Math.max(0, Math.ceil(TRASH_RETENTION_DAYS - ageMs / 86400000));
}

// ============ الاسترجاع — حسب نوع العنصر ============
// كل restorer بياخد restore (اللي اتخزن وقت الحذف) وبيرجّعه بالظبط لمكانه، وبيرجع true لو نجح،
// أو يرمي Error برسالة واضحة (بتتعرض في alertModal) لو فشل — من غير ما يلمس أي حاجة تانية.

const TRASH_RESTORERS = {
  // مريض كامل — patientfile: أصلاً متمسحش وقت الحذف (يفضل في القاعدة لحد الـpurge)، فالاسترجاع
  // بس بيرجّعه لقايمة مرضى العيادة تاني.
  patient: async (r) => {
    const patients = await getData('patients:' + r.clinicId, []);
    if(!patients.some(p => p.id === r.patient.id)) patients.push(r.patient);
    await setData('patients:' + r.clinicId, patients);
    if(state.currentClinicId === r.clinicId) state.patients = patients;
    return true;
  },

  // عنصر واحد جوه مصفوفة في ملف مريض (دفعة/متابعة شهرية/رسوم إضافية بسيطة) — مع تصحيح "المتبقي"
  // (financeRemaining) لو كان اتغيّر وقت الحذف بسبب حذف الدفعة/الرسوم دي.
  patient_array_item: async (r) => {
    const file = await getData('patientfile:' + r.patientId, null);
    if(!file) throw new Error('ملف المريض مش موجود دلوقتي');
    if(!Array.isArray(file[r.arrayField])) file[r.arrayField] = [];
    const idx = Math.min(r.index, file[r.arrayField].length);
    file[r.arrayField].splice(idx, 0, r.item);
    if(r.remainingCentsDelta){
      writeFinanceRemainingCents(file, centsToEgp(readFinanceRemainingCents(file) - r.remainingCentsDelta));
    }
    const ok = await setData('patientfile:' + r.patientId, file);
    if(ok && state.currentPatientId === r.patientId) state.currentPatientFile = file;
    return ok;
  },

  // كسر بريكت / استخدام مادة (وأي رسوم و"استرداد مخزون" مرتبطين بيه) — بيغطي الحالات التلاتة
  // اللي بترجع مخزون: حذف سجل كسر من خريطة الفصوص، حذف رسوم كسر متكرر من الحسابات، وإلغاء
  // استخدام مادة من المتابعة الشهرية. كل الحقول اختيارية غير materialsUsedRemovals.
  material_deduction_delete: async (r) => {
    let restoreDeductList = []; // الأصناف اللي اتخصمت فعلًا في العملية دي (بترجع لو الحفظ بعدها فشل)
    // تحقق من توفر كل الأصناف المطلوب إعادة خصمها دفعة واحدة الأول (all-or-nothing) — بالظبط
    // زي validateAndDeductBatch، عشان لو صنف واحد مش متاح دلوقتي منرجعش نص العملية بس.
    if(r.inventoryCredits && r.inventoryCredits.length){
      const list = r.inventoryCredits.map(c => {
        const item = state.inventory.find(i => i.id === c.itemId);
        return { item, qty: c.qty, label: item ? item.name : c.itemId };
      });
      if(list.some(x => !x.item)) throw new Error('صنف من المخزون اتمسح خالص من وقتها — مقدرش أرجّع الكمية المطلوبة.');
      if(!(await validateAndDeductBatch(list))) return false; // validateAndDeductBatch بيعرض التنبيه بنفسه
      // 'queued' (مفيش نت) بنكمل؛ 'failed' (تعارض) بس هو اللي بيوقف
      if((await saveInventoryOutcome()) === 'failed') return false;
      restoreDeductList = list;
    }

    const file = await getData('patientfile:' + r.patientId, null);
    if(!file){
      undoDeductBatch(restoreDeductList); await saveInventoryOutcome(); // الخصم اتعمل قبل ما نعرف إن الملف مش موجود
      throw new Error('ملف المريض مش موجود دلوقتي');
    }

    if(r.breakEntry && r.tooth){
      const bm = ensureBracketMap(file);
      const t = bm.teeth[r.tooth];
      if(t && !t.breaks.some(b => b.id === r.breakEntry.id)) t.breaks.push(r.breakEntry);
      if(t) t.status = 'broken';
    }
    if(r.financeExtraItem){
      if(!file.financeExtras) file.financeExtras = [];
      if(!file.financeExtras.some(e => e.id === r.financeExtraItem.id)) file.financeExtras.push(r.financeExtraItem);
      if(r.remainingCentsDelta){
        writeFinanceRemainingCents(file, centsToEgp(readFinanceRemainingCents(file) - r.remainingCentsDelta));
      }
    }
    (r.materialsUsedRemovals || []).forEach(mu => {
      const entry = (file.monthlyLog || []).find(x => x.id === mu.entryId);
      if(entry){
        if(!entry.materialsUsed) entry.materialsUsed = [];
        if(!entry.materialsUsed.some(u => u.id === mu.materialUseItem.id)) entry.materialsUsed.push(mu.materialUseItem);
      }
    });
    // لو حفظ الملف اتلغى بتعارض، الخصم بيتعكس تلقائي (من غير سجل الاستخدام فمفيش حاجة تتخصم لوحدها)
    return await savePatientFileAfterStockChange(r.patientId, file, restoreDeductList, 'deduct');
  },

  // صورة واحدة (before/after/during) — التخزين نفسه (Supabase storage) متمسحش وقت الحذف الأول،
  // فالاسترجاع بس بيرجّع مرجع الصورة لمكانه في الشيت.
  patient_photo: async (r) => {
    const file = await getData('patientfile:' + r.patientId, null);
    if(!file) throw new Error('ملف المريض مش موجود دلوقتي');
    const photos = ensurePhotos(file);
    const slotsObj = r.section === 'before' ? photos.before[r.category]
      : r.section === 'after' ? photos.after[r.category]
      : (photos.during.find(v => v.id === r.visitId) || {})[r.category];
    if(!slotsObj) throw new Error('مكان الصورة مش موجود دلوقتي (ممكن الزيارة اتمسحت)');
    slotsObj[r.slotId] = r.photoObj;
    return await setData('patientfile:' + r.patientId, file);
  },

  // زيارة "أثناء العلاج" كاملة بصورها — نفس مبدأ الصورة المفردة، التخزين متأجل لحد الـpurge.
  patient_visit: async (r) => {
    const file = await getData('patientfile:' + r.patientId, null);
    if(!file) throw new Error('ملف المريض مش موجود دلوقتي');
    const photos = ensurePhotos(file);
    if(!photos.during.some(v => v.id === r.visit.id)){
      photos.during.push(r.visit);
      photos.during.sort((a,b) => (a.date < b.date ? -1 : 1));
    }
    return await setData('patientfile:' + r.patientId, file);
  },

  inventory_item: async (r) => {
    const inv = await getData('inventory', []);
    if(!inv.some(i => i.id === r.item.id)) inv.push(r.item);
    const ok = await setData('inventory', inv);
    if(ok) state.inventory = inv;
    return ok;
  },

  // فص اتمسح من شارت الـ reveal — لازم يترفع من deletedRevealTeeth كمان وإلا الشارت هيستمر
  // يعتبره "متمسح بإيد" ويخفيه تاني.
  reveal_tooth: async (r) => {
    const inv = await getData('inventory', []);
    if(!inv.some(i => i.id === r.item.id)) inv.push(r.item);
    const okInv = await setData('inventory', inv);
    if(!okInv) return false;
    state.inventory = inv;
    const deleted = await getData('deletedRevealTeeth', []);
    const idx = deleted.indexOf(r.revealKey);
    if(idx > -1){
      deleted.splice(idx, 1);
      const okDel = await setData('deletedRevealTeeth', deleted);
      if(okDel) state.deletedRevealTeeth = deleted;
    }
    return true;
  },

  inventory_category: async (r) => {
    const cats = await getData('inventoryCategories', []);
    if(!cats.some(c => c.id === r.category.id)) cats.push(r.category);
    const okCats = await setData('inventoryCategories', cats);
    if(!okCats) return false;
    state.inventoryCategories = cats;
    const inv = await getData('inventory', []);
    r.items.forEach(it => { if(!inv.some(i => i.id === it.id)) inv.push(it); });
    const okInv = await setData('inventory', inv);
    if(okInv) state.inventory = inv;
    return okInv;
  },

  custom_stage_type: async (r) => {
    const list = await getData('customStageTypes', []);
    if(!list.some(s => s.id === r.item.id)) list.push(r.item);
    const ok = await setData('customStageTypes', list);
    if(ok) state.customStageTypes = list;
    return ok;
  },

  ortho_note: async (r) => {
    ensureOrthoNotesState();
    const list = await getData('orthoNotes', []);
    if(!list.some(n => n.id === r.item.id)) list.push(r.item);
    const ok = await setData('orthoNotes', list);
    if(ok) state.orthoNotes = list;
    return ok;
  }
};

async function restoreTrashEntry(trashId){
  ensureTrashLoaded();
  const idx = state.trash.findIndex(t => t.id === trashId);
  if(idx === -1) return;
  const entry = state.trash[idx];
  const restorer = TRASH_RESTORERS[entry.kind];
  if(!restorer){ await alertModal('نوع العنصر ده مش معروف — اتصل بالدعم الفني.'); return; }
  try{
    const ok = await restorer(entry.restore);
    if(!ok) return; // setData/validateAndDeductBatch بيبقوا وضحوا السبب بنفسهم
  }catch(e){
    console.error('trash restore failed', entry, e);
    await alertModal('فشل الاسترجاع: ' + ((e && e.message) || 'خطأ غير معروف'));
    return;
  }
  state.trash.splice(idx, 1);
  await saveTrash();
  await logActivity('trash_restore', `استرجع من السلة: ${entry.label}`);
  toast('اترجع ✓');
  render();
}

// ============ الحذف النهائي بعد انتهاء المهلة (بتتنادى مرة كل boot) ============
// وقت الحذف الأول، الأثر الجانبي "الثقيل" (مسح صورة من التخزين، مسح ملف مريض كامل) بيتأجل —
// هنا بس هو مكانه الحقيقي، لما تنتهي مهلة العشر أيام من غير استرجاع.
async function purgeOldTrash(){
  ensureTrashLoaded();
  const cutoff = Date.now() - TRASH_RETENTION_DAYS * 86400000;
  const toPurge = state.trash.filter(t => new Date(t.deletedAt).getTime() < cutoff);
  if(!toPurge.length) return;
  for(const entry of toPurge){
    try{
      if(entry.kind === 'patient'){
        await idbDelete('patientfile:' + entry.restore.patient.id);
      } else if(entry.kind === 'patient_photo' && entry.restore.photoObj && entry.restore.photoObj.path){
        await deletePhotoFromStorage(entry.restore.photoObj.path);
      } else if(entry.kind === 'patient_visit'){
        const allPaths = [...Object.values(entry.restore.visit.extraoral || {}), ...Object.values(entry.restore.visit.intraoral || {})]
          .map(s => s.path).filter(Boolean);
        for(const p of allPaths) await deletePhotoFromStorage(p);
      }
    }catch(e){
      console.error('purge hard-delete step failed (entry kept out of trash regardless)', entry, e);
    }
  }
  state.trash = state.trash.filter(t => new Date(t.deletedAt).getTime() >= cutoff);
  await saveTrash();
}

// بيتنادى مرة عند كل فتح للبرنامج (fire-and-forget من main.js، زي maybeRunAutoBackup بالظبط) —
// بيحمّل السلة وبعدين يمسح نهائيًا أي حاجة عدّت عليها الـ10 أيام.
async function runTrashMaintenance(){
  try{
    await loadTrash();
    await purgeOldTrash();
  }catch(e){
    console.error('trash maintenance failed', e);
  }
}

// ============ شاشة السلة ============
function trashTypeLabel(kind){
  const map = {
    patient: 'مريض', patient_array_item: 'عنصر في ملف مريض',
    material_deduction_delete: 'كسر/استخدام مادة', patient_photo: 'صورة',
    patient_visit: 'زيارة بصورها', inventory_item: 'صنف مخزون',
    reveal_tooth: 'فص من الشارت', inventory_category: 'صنف رئيسي بالمخزون',
    custom_stage_type: 'مرحلة علاج مخصصة', ortho_note: 'ملاحظة'
  };
  return map[kind] || kind;
}

async function openTrashModal(){
  await loadTrash();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  document.body.appendChild(bg);
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  render();

  function render(){
    const items = state.trash.slice().sort((a,b) => b.deletedAt.localeCompare(a.deletedAt));
    bg.innerHTML = `
      <div class="modal" style="max-width:560px;width:95%;">
        <h3>🗑️ سلة المحذوفات</h3>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px;">أي حاجة اتمسحت بتفضل هنا ${TRASH_RETENTION_DAYS} أيام تقدر ترجّعها، وبعدها بتتمسح نهائي أوتوماتيك.</div>
        <div style="max-height:55vh;overflow-y:auto;">
          ${items.length ? items.map(t => `
            <div class="row" style="justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);padding:8px 0;">
              <div style="font-size:13px;">
                <div>${escapeHtml(t.label)}</div>
                <div style="font-size:11px;color:var(--muted);">${escapeHtml(trashTypeLabel(t.kind))} — باقي ${daysLeftInTrash(t)} يوم</div>
              </div>
              <button class="secondary small" data-restore="${t.id}">↩ استرجاع</button>
            </div>
          `).join('') : `<div class="placeholder">السلة فاضية</div>`}
        </div>
        <div class="modal-actions"><button class="secondary" id="trashCloseBtn">إغلاق</button></div>
      </div>
    `;
    bg.querySelector('#trashCloseBtn').onclick = () => bg.remove();
    bg.querySelectorAll('[data-restore]').forEach(btn => {
      btn.onclick = async () => { await restoreTrashEntry(btn.dataset.restore); await loadTrash(); render(); };
    });
  }
}
