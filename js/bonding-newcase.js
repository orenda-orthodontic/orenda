// bonding-newcase.js — تسجيل حالة جديدة (Bonding Upper/Lower) + اكتشاف كلمة New Case
// ============ BONDING UPPER/LOWER (new-case setup) ============
// Typing "bonding upper" (any case/spacing — "BondingUpper", "bonding upper", "BONDING  UPPER"...)
// walks the user through picking a bracket type (ROTH/MBT) — deducted from stock and saved as the
// patient's registered bracket type — then figures out what's on the first molars:
//   - if the same line already mentions tooth 16 and/or 26 (bare FDI, e.g. "16") or their Palmer
//     form (UR6 / UL6), it deducts exactly those tube(s) automatically — no dialog at all.
//   - if the line mentions "Palmer" (بالمر) instead, it's logged as Palmer with no stock deduction.
//   - only if neither is mentioned does it ask (Tube / Palmer / Appliance) via a dialog.
// It always deducts a 0.012 wire, and auto-registers the case as "new case" for this month.
// "bonding lower" works the same way for the lower arch (teeth 36/46 or Palmer LR6/LL6) but does
// NOT touch bracket type, wire, or new-case status.
// Each is handled once per monthly entry — re-editing the same entry's text won't re-trigger it;
// if a modal is cancelled partway through, nothing is saved and it will ask again on the next edit.
const BONDING_TUBE_TEETH = { upper: [16, 26], lower: [36, 46] };
// real anatomical Palmer <-> FDI for first molars specifically (independent of the app's internal
// mirrored bracket-map/reveal convention, since Tube items are matched directly by real FDI number)
const BONDING_PALMER_TO_FDI = { UR6:16, UL6:26, LR6:46, LL6:36 };
const BONDING_PALMER_WORD_RE = /\bpalmer\b|بالمر|بالمير/i;

// pulls out just the line containing the bonding-upper/lower keyword, so tooth numbers typed
// elsewhere in the note (a date, a different arch's line) can't be picked up by mistake.
function extractBondingLine(text, keywordRe){
  const m = keywordRe.exec(text);
  if(!m) return '';
  const before = text.lastIndexOf('\n', m.index);
  const afterIdx = text.indexOf('\n', m.index);
  const start = before === -1 ? 0 : before + 1;
  const end = afterIdx === -1 ? text.length : afterIdx;
  return text.slice(start, end);
}

// finds which of the arch's two first-molar tube teeth (by FDI number) are mentioned in the line,
// as a bare FDI number (e.g. "16", not glued to other digits or part of a decimal/fraction) or as
// Palmer notation (e.g. "UR6", "LL 6"). Returns only the ones actually mentioned.
function extractBondingTubeTeeth(line, arch){
  const fdiNums = BONDING_TUBE_TEETH[arch];
  const found = new Set();
  const palmerRe = /\b(UR|UL|LR|LL)\s?6\b/gi;
  let pm;
  while((pm = palmerRe.exec(line))){
    const fdi = BONDING_PALMER_TO_FDI[pm[1].toUpperCase() + '6'];
    if(fdi && fdiNums.includes(fdi)) found.add(fdi);
  }
  fdiNums.forEach(num=>{
    const re = new RegExp('(?<![\\d./])' + num + '(?!\\d)');
    if(re.test(line)) found.add(num);
  });
  return [...found];
}

async function scanBondingKeyword(entryId, text){
  const file = state.currentPatientFile;
  const e = (file.monthlyLog||[]).find(x=>x.id===entryId);
  if(!e || !text) return;
  if(!e.materialsUsed) e.materialsUsed = [];

  if(BONDING_UPPER_RE.test(text) && !e.bondingUpperHandled){
    await handleBondingUpper(file, e, entryId, text);
  }
  if(BONDING_LOWER_RE.test(text) && !e.bondingLowerHandled){
    await handleBondingLower(file, e, entryId, text);
  }
}

// looks up an inventory item (outside the specialized wire/elastic/bracket/reveal/tube categories)
// by exact name match, case/space-insensitive — used to try to auto-deduct a named appliance.
function findGenericItemByExactName(name){
  return state.inventory.find(i=>{
    if(GENERIC_EXCLUDED_CATEGORIES.has(i.category)) return false;
    return normalizeForMatch(i.name) === normalizeForMatch(name);
  });
}

// figures out the first-molar attachment (tube teeth / palmer / appliance) for one arch, asking
// via dialog only when the line itself doesn't already say which. Returns null if the user
// cancelled a needed dialog (appliance name or the fallback choice).
async function resolveBondingAttachment(line, arch, teethLabel){
  const mentionedTeeth = extractBondingTubeTeeth(line, arch);
  if(mentionedTeeth.length){
    const missing = mentionedTeeth.filter(n => !findTubeItemByFDI(n));
    if(missing.length){
      await alertModal('مفيش صنف Tube ' + missing.join(' / ') + ' مسجل في المخزون — ضيفه الأول وبعدين اكتب النص تاني.');
      return null;
    }
    return { kind:'tube', tubeItems: mentionedTeeth.map(findTubeItemByFDI) };
  }
  if(BONDING_PALMER_WORD_RE.test(line)){
    return { kind:'palmer' };
  }
  const attachPick = await askChoice('التيوب / الجهاز', `استخدمت إيه في الضروس الطواحن (${teethLabel})؟`, [
    { value:'tube', label:'Tube (' + teethLabel + ')' },
    { value:'palmer', label:'Palmer' },
    { value:'appliance', label:'Appliance تاني' }
  ]);
  if(!attachPick) return null;
  if(attachPick === 'tube'){
    const fdiNums = BONDING_TUBE_TEETH[arch];
    const missing = fdiNums.filter(n => !findTubeItemByFDI(n));
    if(missing.length){
      await alertModal('مفيش صنف Tube ' + missing.join(' / ') + ' مسجل في المخزون — ضيفه الأول وبعدين اكتب النص تاني.');
      return null;
    }
    return { kind:'tube', tubeItems: fdiNums.map(findTubeItemByFDI) };
  }
  if(attachPick === 'palmer') return { kind:'palmer' };
  const applianceName = await promptModal('اسم الـ Appliance', '', { label:'الاسم' });
  if(!applianceName) return null;
  return { kind:'appliance', applianceName, applianceItem: findGenericItemByExactName(applianceName) };
}

function bondingAttachmentLine(attachment){
  if(attachment.kind === 'tube') return attachment.tubeItems.map(i=>i.name).join(' + ');
  if(attachment.kind === 'palmer') return 'Palmer (من غير خصم من المخزن)';
  return `Appliance: ${attachment.applianceName}` + (attachment.applianceItem ? ` — ${attachment.applianceItem.name} (هيتخصم من المخزن)` : ' (تسجيل بس — الاسم مش موجود في المخزون)');
}

function applyBondingAttachment(e, attachment, entryId, archTag){
  if(attachment.kind === 'tube'){
    attachment.tubeItems.forEach(item=>{
      item.qty = Math.max(0, (parseFloat(item.qty)||0) - 1);
      e.materialsUsed.push({ id: uid(), itemId: item.id, itemName: item.name, qty: 1, matchKey: 'bonding:'+archTag+':'+item.id+':'+entryId, source:'keyword' });
    });
  } else if(attachment.kind === 'palmer'){
    e.materialsUsed.push({ id: uid(), itemId: null, itemName: 'Palmer (' + (archTag==='upper'?'Upper':'Lower') + ')', qty: 1, matchKey: 'bonding:'+archTag+':palmer:'+entryId, source:'keyword' });
  } else if(attachment.applianceItem){
    attachment.applianceItem.qty = Math.max(0, (parseFloat(attachment.applianceItem.qty)||0) - 1);
    e.materialsUsed.push({ id: uid(), itemId: attachment.applianceItem.id, itemName: attachment.applianceItem.name, qty: 1, matchKey: 'bonding:'+archTag+':appliance:'+entryId, source:'keyword' });
  } else {
    e.materialsUsed.push({ id: uid(), itemId: null, itemName: 'Appliance: ' + attachment.applianceName, qty: 1, matchKey: 'bonding:'+archTag+':appliance:'+entryId, source:'keyword' });
  }
}

async function handleBondingUpper(file, e, entryId, text){
  const bracketPick = await askChoice('نوع البراكيت', 'كتبت "bonding upper" — هتستخدم أي نوع براكيت؟', [
    { value:'roth', label:'ROTH' },
    { value:'mbt', label:'MBT' }
  ]);
  if(!bracketPick) return; // cancelled — leave unhandled, will ask again on next edit

  const bracketItem = findBracketItemByType(bracketPick);
  if(!bracketItem){
    await alertModal(`مفيش صنف "براكيت" ${bracketSystemLabel(bracketPick)} في المخزون — ضيفه الأول وبعدين اكتب النص تاني.`);
    return;
  }

  const line = extractBondingLine(text, BONDING_UPPER_RE);
  const attachment = await resolveBondingAttachment(line, 'upper', '16 و26');
  if(!attachment) return;

  const wireItem = await resolveWireItemBySize('012', 'bonding upper');
  if(!wireItem) return;

  const msg = 'هيتسجل ويتخصم من المخزن:\n- براكيت ' + bracketSystemLabel(bracketPick) + ' — ' + bracketItem.name
    + '\n- ' + bondingAttachmentLine(attachment)
    + '\n- سلك 0.012 — ' + wireItem.name
    + '\n\nوهتتسجل "حالة جديدة" للمريض ده الشهر ده. موافق؟';
  if(!(await confirmModal(msg))) return;

  file.bracketSystem = bracketPick;

  bracketItem.qty = Math.max(0, (parseFloat(bracketItem.qty)||0) - 1);
  e.materialsUsed.push({ id: uid(), itemId: bracketItem.id, itemName: bracketItem.name, qty: 1, matchKey: 'bonding:upper:bracket:'+entryId, source:'keyword' });

  applyBondingAttachment(e, attachment, entryId, 'upper');

  wireItem.qty = Math.max(0, (parseFloat(wireItem.qty)||0) - 1);
  e.materialsUsed.push({ id: uid(), itemId: wireItem.id, itemName: wireItem.name, qty: 1, matchKey: 'bonding:upper:wire:'+entryId, source:'keyword' });

  e.bondingUpperHandled = true;
  e.bondingUpperInfo = { bracketSystem: bracketPick, attachment: attachment.kind, applianceName: attachment.applianceName || null };

  if(!file.newCaseEvents) file.newCaseEvents = [];
  file.newCaseEvents.push({ id: uid(), date: e.date || todayStr(), source:'bonding', entryId });

  await saveInventory();
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('🆕 اتسجلت حالة جديدة واتخصم من المخزن');
  render();
}

async function handleBondingLower(file, e, entryId, text){
  const line = extractBondingLine(text, BONDING_LOWER_RE);
  const attachment = await resolveBondingAttachment(line, 'lower', '36 و46');
  if(!attachment) return;

  if(!(await confirmModal('هيتسجل ويتخصم من المخزن:\n- ' + bondingAttachmentLine(attachment) + '\n\nموافق؟'))) return;

  applyBondingAttachment(e, attachment, entryId, 'lower');

  e.bondingLowerHandled = true;
  e.bondingLowerInfo = { attachment: attachment.kind, applianceName: attachment.applianceName || null };

  await saveInventory();
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
  const date = await promptModal('تاريخ الحالة الجديدة (لو الحالة جت يوم قبل كده وسجلتها دلوقتي، اكتب تاريخها الصح هنا)', todayStr(), {type:'date', label:'التاريخ'});
  if(!date) return;
  if(!file.newCaseEvents) file.newCaseEvents = [];
  file.newCaseEvents.push({ id: uid(), date, source:'manual' });
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('اتسجلت حالة جديدة بتاريخ ' + formatDateAr(date));
  render();
}

async function markCaseDebonded(){
  const file = state.currentPatientFile;
  const date = await promptModal('تاريخ فك الحالة', todayStr(), {type:'date', label:'التاريخ'});
  if(!date) return;
  file.caseStatus = 'debonded';
  file.debondDate = date;
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('اتسجلت الحالة "فكت"');
  render();
}

async function reactivateCase(){
  const file = state.currentPatientFile;
  if(!(await confirmModal('ترجيع الحالة دي "نشطة" تاني؟'))) return;
  file.caseStatus = 'active';
  file.debondDate = null;
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('الحالة بقت نشطة تاني');
  render();
}

async function editCaseStartDate(){
  const file = state.currentPatientFile;
  const current = computeCaseStartDate(file) || todayStr();
  const date = await promptModal('تاريخ بداية الحالة (بيتحسب تلقائي من أول متابعة، تقدر تعدّله لو مش مضبوط)', current, {type:'date', label:'التاريخ'});
  if(!date) return;
  file.caseStartDateOverride = date;
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('اتحفظ تاريخ بداية الحالة');
  render();
}

