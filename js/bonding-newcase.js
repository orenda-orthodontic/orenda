// bonding-newcase.js — تسجيل حالة جديدة (Bonding Upper/Lower) + اكتشاف كلمة New Case
// ============ BONDING UPPER/LOWER (new-case setup) ============
// Triggered by a button (🦴 Bonding Upper/Lower في المتابعة الشهرية) instead of typing a phrase —
// walks the user through picking a bracket type (ROTH/MBT, upper only) then what's on the first
// molars: Tube (the arch's two default first-molar positions, 16/26 upper or 36/46 lower) or a
// named Appliance. Always deducts a 0.012 wire for Upper, and auto-registers the case as "new
// case" for this month. Lower does NOT touch bracket type, wire, or new-case status — same as
// before. On success, a short descriptive line is appended into the doneUpper/doneLower field.
//
// P0-4: كل خصم من المخزون هنا بيعدي أول على validateAndDeductBatch (inventory-deduct.js) —
// تحقق من التوفر لكل الأصناف المطلوبة دفعة واحدة قبل ما يتخصم أي حاجة، بدل الخصم المباشر
// (Math.max(0, qty-1)) اللي كان بينزّل الكمية صفر بصمت لو مكنش فيه مخزون كافي.
const BONDING_TUBE_TEETH = { upper: [16, 26], lower: [36, 46] };

// looks up an inventory item (outside the specialized wire/elastic/bracket/reveal/tube categories)
// by exact name match, case/space-insensitive — used to try to auto-deduct a named appliance.
function findGenericItemByExactName(name){
  return state.inventory.find(i=>{
    if(GENERIC_EXCLUDED_CATEGORIES.has(i.category)) return false;
    return normalizeForMatch(i.name) === normalizeForMatch(name);
  });
}

// asks which first-molar attachment was used (Tube on the arch's default pair, or a named
// Appliance) — no Palmer option. Returns null if the user cancelled.
async function resolveBondingAttachment(arch, teethLabel){
  const attachPick = await askChoice('التيوب / الجهاز', `استخدمت إيه في الضروس الطواحن (${teethLabel})؟`, [
    { value:'tube', label:'Tube (' + teethLabel + ')' },
    { value:'appliance', label:'Appliance تاني' }
  ]);
  if(!attachPick) return null;
  if(attachPick === 'tube'){
    const fdiNums = BONDING_TUBE_TEETH[arch];
    const missing = fdiNums.filter(n => !findTubeItemByFDI(n));
    if(missing.length){
      await alertModal('مفيش صنف Tube ' + missing.join(' / ') + ' مسجل في المخزون — ضيفه الأول.');
      return null;
    }
    return { kind:'tube', tubeItems: fdiNums.map(findTubeItemByFDI) };
  }
  const applianceName = await promptModal('اسم الـ Appliance', '', { label:'الاسم' });
  if(!applianceName) return null;
  return { kind:'appliance', applianceName, applianceItem: findGenericItemByExactName(applianceName) };
}

function bondingAttachmentLine(attachment){
  if(attachment.kind === 'tube') return attachment.tubeItems.map(i=>i.name).join(' + ');
  return `Appliance: ${attachment.applianceName}` + (attachment.applianceItem ? ` — ${attachment.applianceItem.name} (هيتخصم من المخزن)` : ' (تسجيل بس — الاسم مش موجود في المخزون)');
}

// يرجّع مصفوفة الأصناف المطلوب التحقق منها/خصمها لأي attachment (tube أو appliance) — منفصلة
// عن pushBondingAttachmentMaterials تحت عشان نقدر نتحقق من كل الكميات المطلوبة في العملية
// كلها (براكيت + attachment + واير) دفعة واحدة قبل ما نخصم أي حاجة (all-or-nothing).
function bondingAttachmentItemsToDeduct(attachment){
  if(attachment.kind === 'tube'){
    return attachment.tubeItems.map(item => ({ item, qty: 1, label: item.name }));
  }
  if(attachment.applianceItem){
    return [{ item: attachment.applianceItem, qty: 1, label: attachment.applianceItem.name }];
  }
  return []; // اسم بس مش موجود في المخزون — تسجيل بدون خصم
}

// بيسجل سطور materialsUsed المناسبة للـ attachment — بيُستدعى بعد ما الخصم يكون اتعمل بنجاح
// (مفيهوش أي تعديل على item.qty، ده شغل validateAndDeductBatch).
function pushBondingAttachmentMaterials(e, attachment, entryId, archTag){
  if(attachment.kind === 'tube'){
    attachment.tubeItems.forEach(item=>{
      e.materialsUsed.push({ id: uid(), itemId: item.id, itemName: item.name, itemType: item.type || '', qty: 1, matchKey: 'bonding:'+archTag+':'+item.id+':'+entryId, source:'action' });
    });
  } else if(attachment.applianceItem){
    e.materialsUsed.push({ id: uid(), itemId: attachment.applianceItem.id, itemName: attachment.applianceItem.name, itemType: attachment.applianceItem.type || '', qty: 1, matchKey: 'bonding:'+archTag+':appliance:'+entryId, source:'action' });
  } else {
    e.materialsUsed.push({ id: uid(), itemId: null, itemName: 'Appliance: ' + attachment.applianceName, qty: 1, matchKey: 'bonding:'+archTag+':appliance:'+entryId, source:'action' });
  }
}

// single entry point behind the one "🆕 Bonding" button (replaces the separate Bonding Upper /
// Bonding Lower buttons) — asks which one, then runs that flow exactly as it was before.
async function handleBondingAction(entryId){
  const pick = await askChoice('Bonding', 'إيه اللي هتسجله؟', [
    { value:'upper', label:'🆕 Bonding Upper' },
    { value:'lower', label:'🆕 Bonding Lower' }
  ]);
  if(!pick) return;
  if(pick === 'upper') return handleBondingUpperAction(entryId);
  return handleBondingLowerAction(entryId);
}

async function handleBondingUpperAction(entryId){
  const bracketPick = await askChoice('نوع البراكيت', 'هتستخدم أي نوع براكيت؟', [
    { value:'roth', label:'ROTH' },
    { value:'mbt', label:'MBT' }
  ]);
  if(!bracketPick) return;

  const bracketItem = findBracketItemByType(bracketPick);
  if(!bracketItem){
    await alertModal(`مفيش صنف "براكيت" ${bracketSystemLabel(bracketPick)} في المخزون — ضيفه الأول.`);
    return;
  }

  const attachment = await resolveBondingAttachment('upper', '16 و26');
  if(!attachment) return;

  const wireItem = await resolveWireItemBySize('012', 'bonding upper');
  if(!wireItem) return;

  const msg = 'هيتسجل ويتخصم من المخزن:\n- براكيت ' + bracketSystemLabel(bracketPick) + ' — ' + bracketItem.name
    + '\n- ' + bondingAttachmentLine(attachment)
    + '\n- سلك 0.012 — ' + wireItem.name
    + '\n\nوهتتسجل "حالة جديدة" للمريض ده الشهر ده. موافق؟';
  if(!(await confirmModal(msg))) return;

  // P0-4: تحقق من توفر كل الأصناف الثلاثة دفعة واحدة قبل ما نخصم أي حاجة
  const deductList = [
    { item: bracketItem, qty: 1, label: 'براكيت ' + bracketSystemLabel(bracketPick) },
    ...bondingAttachmentItemsToDeduct(attachment),
    { item: wireItem, qty: 1, label: 'سلك 0.012' }
  ];
  if(!(await validateAndDeductBatch(deductList))) return;

  materializeMonthlyDraft(entryId);
  const file = state.currentPatientFile;
  const e = (file.monthlyLog||[]).find(x=>x.id===entryId);
  if(!e) return;
  if(!e.materialsUsed) e.materialsUsed = [];

  file.bracketSystem = bracketPick;

  e.materialsUsed.push({ id: uid(), itemId: bracketItem.id, itemName: bracketItem.name, itemType: bracketItem.type || '', qty: 1, matchKey: 'bonding:upper:bracket:'+entryId, source:'action' });
  pushBondingAttachmentMaterials(e, attachment, entryId, 'upper');
  e.materialsUsed.push({ id: uid(), itemId: wireItem.id, itemName: wireItem.name, itemType: wireItem.type || '', qty: 1, matchKey: 'bonding:upper:wire:'+entryId, source:'action' });

  if(!file.newCaseEvents) file.newCaseEvents = [];
  file.newCaseEvents.push({ id: uid(), date: e.date || todayStr(), source:'bonding', entryId });

  const okInv = await saveInventory();
  if(!okInv){
    // فشل الحفظ أو تعارض — setData بيبقى وضح السبب في التوست بتاعه، فمنكملش نحفظ ملف المريض
    // بحالة جديدة/مواد مستخدمة مبنية على خصم اتلغى
    render();
    return;
  }

  appendToMonthlyField(e, 'doneUpper', 'Bonding Upper — ' + bracketSystemLabel(bracketPick) + ' — ' + bondingAttachmentLine(attachment));

  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('🆕 اتسجلت حالة جديدة واتخصم من المخزن');
  render();
}

async function handleBondingLowerAction(entryId){
  const attachment = await resolveBondingAttachment('lower', '36 و46');
  if(!attachment) return;

  if(!(await confirmModal('هيتسجل ويتخصم من المخزن:\n- ' + bondingAttachmentLine(attachment) + '\n\nموافق؟'))) return;

  // P0-4: تحقق من التوفر قبل الخصم (ممكن تبقى فاضية لو appliance اسم بس مش موجود بالمخزون)
  const deductList = bondingAttachmentItemsToDeduct(attachment);
  if(!(await validateAndDeductBatch(deductList))) return;

  materializeMonthlyDraft(entryId);
  const file = state.currentPatientFile;
  const e = (file.monthlyLog||[]).find(x=>x.id===entryId);
  if(!e) return;
  if(!e.materialsUsed) e.materialsUsed = [];

  pushBondingAttachmentMaterials(e, attachment, entryId, 'lower');

  const okInv = await saveInventory();
  if(!okInv){
    // فشل الحفظ أو تعارض — setData بيبقى وضح السبب في التوست بتاعه
    render();
    return;
  }

  appendToMonthlyField(e, 'doneLower', 'Bonding Lower — ' + bondingAttachmentLine(attachment));

  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('اتخصم من المخزن');
  render();
}

// ============ NEW CASE detection (keyword) ============
// recognizes "NEW CASE" in the monthly-follow-up text regardless of case, spacing, or a missing
// space (NEW CASE / new case / NEWCASE / newcase...) and logs it as a newCaseEvent for this
// patient — separate from (and works alongside) the manual "حالة جديدة" button on the patient card.
const NEW_CASE_REGEX = /new\s*case/i;
async function scanNewCaseKeyword(entryId, text){
  if(!text || !NEW_CASE_REGEX.test(text)) return;
  const file = state.currentPatientFile;
  if(!file.newCaseEvents) file.newCaseEvents = [];
  if(file.newCaseEvents.some(ev=>ev.entryId === entryId)) return; // already logged for this monthly entry
  const e = (file.monthlyLog||[]).find(x=>x.id===entryId);
  const date = (e && e.date) || todayStr();
  file.newCaseEvents.push({ id: uid(), date, source:'keyword', entryId });
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('🆕 اتسجلت "حالة جديدة" للمريض ده الشهر ده (من كلمة NEW CASE)');
}

async function markNewCaseManually(){
  const file = state.currentPatientFile;
  const date = await promptModal('تاريخ الحالة الجديدة (لو الحالة جت يوم قبل كده وسجلتها دلوقتي، اكتب تاريخها الصح هنا)', defaultRecordDate(), {type:'date', label:'التاريخ'});
  if(!date) return;
  if(!file.newCaseEvents) file.newCaseEvents = [];
  file.newCaseEvents.push({ id: uid(), date, source:'manual' });
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  await logActivity('mark_new_case', `سجّل حالة جديدة بتاريخ ${date} لمريض ${patientNameForLog()}`);
  toast('اتسجلت حالة جديدة بتاريخ ' + formatDateAr(date));
  render();
}

async function markCaseDebonded(){
  const file = state.currentPatientFile;
  const date = await promptModal('تاريخ فك الحالة', defaultRecordDate(), {type:'date', label:'التاريخ'});
  if(!date) return;
  file.caseStatus = 'debonded';
  file.debondDate = date;
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  await logActivity('debond_case', `فك الحالة بتاريخ ${date} لمريض ${patientNameForLog()}`);
  toast('اتسجلت الحالة "فكت"');
  render();
}

async function reactivateCase(){
  const file = state.currentPatientFile;
  if(!(await confirmModal('ترجيع الحالة دي "نشطة" تاني؟'))) return;
  file.caseStatus = 'active';
  file.debondDate = null;
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  await logActivity('reactivate_case', `رجّع الحالة نشطة تاني لمريض ${patientNameForLog()}`);
  toast('الحالة بقت نشطة تاني');
  render();
}

async function editCaseStartDate(){
  const file = state.currentPatientFile;
  const current = computeCaseStartDate(file) || todayStr();
  const date = await promptModal('تاريخ بداية الحالة (بيتحسب تلقائي من أول متابعة، تقدر تعدّله لو مش مضبوط)', current, {type:'date', label:'التاريخ'});
  if(!date) return;
  const oldStart = current;
  file.caseStartDateOverride = date;
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  await logActivity('edit_case_start', `غيّر بداية الحالة من ${oldStart} إلى ${date} لمريض ${patientNameForLog()}`);
  toast('اتحفظ تاريخ بداية الحالة');
  render();
}
