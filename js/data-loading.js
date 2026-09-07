// data-loading.js — تحميل العيادات/المرضى/المخزون/ملف المريض من السيرفر + الـ migrations
// ============ DATA LOADING ============
async function loadClinics(){
  state.clinics = await getData('clinics', []);
  state.doctorName = await getData('doctorName', 'MAHMOUD NASSAR');
  state.dismissedAlerts = await getData('dismissedAlerts', {});
}

// one-time migration: default every existing patient's bracket type to ROTH (even if MBT was
// already set) — runs once ever, guarded by a flag, so it never re-overwrites later manual edits.
async function runRothDefaultMigration(){
  const done = await getData('migration_bracket_default_roth', false);
  if(done) return;
  try{
    for(const c of state.clinics){
      const patients = await getData('patients:' + c.id, []);
      for(const p of patients){
        const file = await getData('patientfile:' + p.id, null);
        if(file){
          file.bracketSystem = 'roth';
          await setData('patientfile:' + p.id, file);
        }
      }
    }
  }catch(e){
    console.error('roth default migration failed', e);
  }
  await setData('migration_bracket_default_roth', true);
}
async function saveDoctorName(){
  await setData('doctorName', state.doctorName);
}
async function loadPatients(clinicId){
  state.patients = await getData('patients:' + clinicId, []);
}
async function loadInventory(){
  state.inventory = await getData('inventory', []);
  state.deletedRevealTeeth = await getData('deletedRevealTeeth', []);
  let dirty = false;
  if(state.inventory.length === 0 && state.clinics.length){
    // one-time migration from old per-clinic inventory keys
    for(const c of state.clinics){
      const old = await getData('inventory:' + c.id, []);
      if(old && old.length){
        old.forEach(i=>{ if(!i.category) i.category = 'wires'; });
        state.inventory = state.inventory.concat(old);
        dirty = true;
      }
    }
  }
  state.inventory.forEach(i=>{
    if(!i.category){ i.category = 'wires'; dirty = true; }
  });

  state.inventoryCategories = await getData('inventoryCategories', null);
  if(!state.inventoryCategories){
    state.inventoryCategories = DEFAULT_INVENTORY_CATEGORIES.slice();
  }
  let categoriesDirty = false;
  if(!state.inventoryCategories.some(c=>c.id === BRACKET_CATEGORY_ID)){
    state.inventoryCategories.push({ id: BRACKET_CATEGORY_ID, label: 'براكيت' });
    categoriesDirty = true;
  }
  if(!state.inventoryCategories.some(c=>c.id === REVEAL_CATEGORY_ID)){
    state.inventoryCategories.push({ id: REVEAL_CATEGORY_ID, label: 'ريفيل ROTH', toothChart: true });
    categoriesDirty = true;
  } else {
    const rothCat = state.inventoryCategories.find(c=>c.id === REVEAL_CATEGORY_ID);
    if(rothCat && rothCat.label !== 'ريفيل ROTH'){ rothCat.label = 'ريفيل ROTH'; categoriesDirty = true; }
  }
  if(!state.inventoryCategories.some(c=>c.id === REVEAL_MBT_CATEGORY_ID)){
    state.inventoryCategories.push({ id: REVEAL_MBT_CATEGORY_ID, label: 'ريفيل MBT', toothChart: true });
    categoriesDirty = true;
  }
  if(!state.inventoryCategories.some(c=>c.id === TUBE_CATEGORY_ID)){
    state.inventoryCategories.push({ id: TUBE_CATEGORY_ID, label: 'تيوبات' });
    categoriesDirty = true;
  }
  if(categoriesDirty) await saveInventoryCategories();

  // ensure the two bracket sub-items (ROTH / MBT) exist under the main "براكيت" category
  const hasBracketRothItem = state.inventory.some(i=>i.category===BRACKET_CATEGORY_ID && /roth/i.test(i.name||''));
  if(!hasBracketRothItem){
    state.inventory.push({ id: uid(), name: 'Bracket ROTH', qty: 0, threshold: 4, category: BRACKET_CATEGORY_ID, type:'', supplier:'', supplierWhatsapp:'', price:0 });
    dirty = true;
  }
  const hasBracketMbtItem = state.inventory.some(i=>i.category===BRACKET_CATEGORY_ID && /mbt/i.test(i.name||''));
  if(!hasBracketMbtItem){
    state.inventory.push({ id: uid(), name: 'Bracket MBT', qty: 0, threshold: 4, category: BRACKET_CATEGORY_ID, type:'', supplier:'', supplierWhatsapp:'', price:0 });
    dirty = true;
  }
  // ensure the 4 tube items (16/26/36/46 — the "bonding upper/lower" flow deducts these) exist
  TUBE_TEETH.forEach(num=>{
    const has = state.inventory.some(i=>i.category===TUBE_CATEGORY_ID && i.toothNum===num);
    if(!has){
      state.inventory.push({ id: uid(), name: 'Tube ' + num, qty: 0, threshold: 4, category: TUBE_CATEGORY_ID, toothNum: num, type:'', supplier:'', supplierWhatsapp:'', price:0 });
      dirty = true;
    }
  });

  // repair: an earlier version of this seeding set threshold to -1, which silently disabled the
  // low-stock alert for these two items forever — fix any already-created ones back to a real threshold
  state.inventory.forEach(i=>{
    if(i.category === BRACKET_CATEGORY_ID && (/roth/i.test(i.name||'') || /mbt/i.test(i.name||'')) && parseFloat(i.threshold) === -1){
      i.threshold = 4;
      dirty = true;
    }
  });

  // repair: rename any reveal item still using the old FDI-based name (e.g. "فص 28") to Palmer ("فص UL8")
  state.inventory.forEach(i=>{
    if((i.category === REVEAL_CATEGORY_ID || i.category === REVEAL_MBT_CATEGORY_ID) && i.toothNum){
      const expectedName = 'فص ' + fdiToPalmer(i.toothNum);
      if(i.name !== expectedName){ i.name = expectedName; dirty = true; }
    }
  });

  // ensure a stock item exists for every tooth position under each Reveal (tooth-chart) category
  // — skips any tooth the user explicitly deleted, so it doesn't silently come back
  // (molars — positions 6/7/8 — are excluded: those use tubes, not reveal/rebonding)
  const revealNums = [...FDI_TEETH_ROWS.upper, ...FDI_TEETH_ROWS.lower].filter(isRevealChartTooth);
  const deletedSet = new Set(state.deletedRevealTeeth || []);
  [REVEAL_CATEGORY_ID, REVEAL_MBT_CATEGORY_ID].forEach(catId=>{
    const existingRevealNums = new Set(state.inventory.filter(i=>i.category===catId).map(i=>i.toothNum));
    revealNums.forEach(num=>{
      if(deletedSet.has(catId + ':' + num)) return;
      if(!existingRevealNums.has(num)){
        state.inventory.push({ id: uid(), name: 'فص ' + fdiToPalmer(num), qty: 0, threshold: -1, category: catId, toothNum: num, type:'', supplier:'', supplierWhatsapp:'', price:0 });
        dirty = true;
      }
    });
  });

  // migration: molar positions (6/7/8) no longer belong on the reveal/refill charts — remove any
  // that already exist under ROTH/MBT (from before this change)
  [REVEAL_CATEGORY_ID, REVEAL_MBT_CATEGORY_ID].forEach(catId=>{
    const before = state.inventory.length;
    state.inventory = state.inventory.filter(i => !(i.category === catId && i.toothNum && !isRevealChartTooth(i.toothNum)));
    if(state.inventory.length !== before) dirty = true;
  });

  if(dirty) await saveInventory();
}
async function saveInventory(){
  await setData('inventory', state.inventory);
}
async function saveDeletedRevealTeeth(){
  await setData('deletedRevealTeeth', state.deletedRevealTeeth);
}
async function saveInventoryCategories(){
  await setData('inventoryCategories', state.inventoryCategories);
}
async function loadPatientFile(patientId){
  const file = await getData('patientfile:' + patientId, {
    diagnosisSections: null,
    financeTotal: 0,
    financePaid: 0,
    financeExtras: [], // {id, amount, reason, date}
    bracketMap: null,
    monthlyLog: [], // {id, date, done, plan}
    payments: [], // {id, amount, date, note}
    newCaseEvents: [], // {id, date, source:'keyword'|'manual', entryId?} — each time this patient was flagged as a "new case"
    caseStatus: 'active', // 'active' | 'debonded' (فكت الحالة)
    debondDate: null,
    caseStartDateOverride: null // optional manual override of the computed case-start date
  });
  let dirty = false;
  if(!file.diagnosisSections || file.diagnosisSections.length === 0){
    file.diagnosisSections = buildDefaultDiagnosisSections();
    dirty = true;
  } else if(migrateExtraOralFrontalFields(file.diagnosisSections)){
    dirty = true;
  }
  if(!file.financeExtras) file.financeExtras = [];
  if(!file.payments) file.payments = [];
  if(!file.newCaseEvents) file.newCaseEvents = [];
  if(!file.caseStatus) file.caseStatus = 'active';
  if(file.debondDate === undefined) file.debondDate = null;
  if(file.caseStartDateOverride === undefined) file.caseStartDateOverride = null;
  if(!file.bracketMap || !file.bracketMap.teeth){
    ensureBracketMap(file);
    dirty = true;
  }
  if(!file.monthlyLog) file.monthlyLog = [];
  if(dirty) await setData('patientfile:' + patientId, file);
  return file;
}
async function savePatientFile(patientId, file){
  await setData('patientfile:' + patientId, file);
}

// Standard diagnosis sheet — auto-created for every new patient so nothing needs to be added manually
function buildDefaultDiagnosisSections(){
  const mkField = (l, options) => ({ id: uid(), label: l, value: '', options: options || null });
  const mkGroup = (title, labels) => ({ id: uid(), title, fields: labels.map(l => Array.isArray(l) ? mkField(l[0], l[1]) : mkField(l)) });
  const mk = (title, opts) => ({
    id: uid(),
    title,
    groups: opts.groups || [],
    fields: (opts.fields || []).map(l => Array.isArray(l) ? mkField(l[0], l[1]) : mkField(l)),
    content: '',
    col1: opts.col1 || null,
    col2: opts.col2 || null
  });
  return [
    mk('Chief Complaint', {}),
    mk('Extra-oral', {
      groups: [
        mkGroup('Frontal', [
          'At rest',
          'At smile',
          ['Lip line', ['Normal', 'Gummy smile', 'Low smile (canine smile)']],
          ['Lip length', ['Normal', 'Short', 'Long']],
          ['Buccal corridor', ['Normal', 'Narrow', 'Wide']],
          ['Facial height', ['Normal', 'Increased (long face)', 'Decreased (short face)']],
          ['Facial symmetry', ['Symmetric', 'Asymmetric']]
        ]),
        mkGroup('Lateral', [
          ['Nasolabial angle', ['Acute', 'Normal', 'Obtuse']],
          ['Profile', ['Straight', 'Convex', 'Concave']],
          ['Lip competence', ['Competent', 'Incompetent']],
          ['E line', ['Lips within E-line', 'Protrusive', 'Retrusive']],
          ['Lip line', ['Normal', 'Gummy smile', 'Low smile (canine smile)']]
        ])
      ]
    }),
    mk('Intra-oral', {
      groups: [
        mkGroup('Frontal', [
          ['Overjet', ['Normal', 'Increased', 'Reverse (crossbite)']],
          ['Overbite', ['Normal', 'Deep', 'Open']],
          ['Midline', ['Coincident', 'Shifted right', 'Shifted left']]
        ]),
        mkGroup('Upper', [
          ['Arch form', ['U-shaped', 'V-shaped', 'Square', 'Tapered']],
          ['Incisor inclination', ['Proclined', 'Normal', 'Retroclined']],
          ['Midline', ['Coincident', 'Shifted right', 'Shifted left']],
          ['Rotation', ['None', 'Mild', 'Severe']],
          ['Crowding', ['None', 'Mild', 'Moderate', 'Severe']]
        ]),
        mkGroup('Lower', [
          ['Arch form', ['U-shaped', 'V-shaped', 'Square', 'Tapered']],
          ['Incisor inclination', ['Proclined', 'Normal', 'Retroclined']],
          ['Midline', ['Coincident', 'Shifted right', 'Shifted left']],
          ['Rotation', ['None', 'Mild', 'Severe']],
          ['Crowding', ['None', 'Mild', 'Moderate', 'Severe']]
        ])
      ],
      fields: ['Panorama']
    }),
    mk('Cephalometric', {
      fields: ['SNA', 'SNB', 'ANB', 'FMA', 'SN-MAN', 'U1-SN', 'L1-MAN', 'U1-L1', 'Nasolabial angle']
    }),
    mk('Classification', {
      fields: [
        ['Right - Molar', ['Class I', 'Class II full unit', 'Class II 1/2', 'Class II 1/4', 'Class III full unit', 'Class III 1/2', 'Class III 1/4']],
        ['Right - Canine', ['Class I', 'Class II full unit', 'Class II 1/2', 'Class II 1/4', 'Class III full unit', 'Class III 1/2', 'Class III 1/4']],
        ['Right - Buccal', ['Class I', 'Class II full unit', 'Class II 1/2', 'Class II 1/4', 'Class III full unit', 'Class III 1/2', 'Class III 1/4']],
        ['Left - Molar', ['Class I', 'Class II full unit', 'Class II 1/2', 'Class II 1/4', 'Class III full unit', 'Class III 1/2', 'Class III 1/4']],
        ['Left - Canine', ['Class I', 'Class II full unit', 'Class II 1/2', 'Class II 1/4', 'Class III full unit', 'Class III 1/2', 'Class III 1/4']],
        ['Left - Buccal', ['Class I', 'Class II full unit', 'Class II 1/2', 'Class II 1/4', 'Class III full unit', 'Class III 1/2', 'Class III 1/4']]
      ]
    }),
    mk('Problem List and Mechanics', {
      col1: 'Problems', col2: 'Mechanics',
      fields: ['', '', '', '', '', '']
    }),
    mk('Space Management / Anchorage', {
      fields: ['Space management', 'Anchorage', 'Tooth out of wire', 'Wire sequence', 'Bite turbo']
    }),
    mk('Treatment Plan', { fields: [
      ['Extraction / Non-extraction', ['Extraction', 'Non-extraction']],
      ['Growth modification', ['Yes', 'No']],
      'Upper plan',
      'Lower plan'
    ] })
  ];
}


// One-time migration: add the new option-based fields to patient files created
// before these fields existed, without touching anything the user already filled in.
function migrateExtraOralFrontalFields(sections){
  let changed = false;

  function addOptionsToField(group, label, options){
    if(!group) return;
    const f = (group.fields || []).find(x => x.label.trim().toLowerCase() === label.toLowerCase());
    if(f && !f.options){ f.options = options; changed = true; }
  }
  function addNewField(group, label, options){
    if(!group) return;
    const exists = (group.fields || []).some(x => x.label.trim().toLowerCase() === label.toLowerCase());
    if(!exists){ group.fields.push({ id: uid(), label, value: '', options }); changed = true; }
  }

  const extraOral = sections.find(s => s.title === 'Extra-oral');
  if(extraOral){
    const frontal = (extraOral.groups || []).find(g => g.title === 'Frontal');
    addNewField(frontal, 'Lip length', ['Normal', 'Short', 'Long']);
    addNewField(frontal, 'Buccal corridor', ['Normal', 'Narrow', 'Wide']);
    addNewField(frontal, 'Facial height', ['Normal', 'Increased (long face)', 'Decreased (short face)']);
    addNewField(frontal, 'Facial symmetry', ['Symmetric', 'Asymmetric']);
    addOptionsToField(frontal, 'Lip line', ['Normal', 'Gummy smile', 'Low smile (canine smile)']);

    const lateral = (extraOral.groups || []).find(g => g.title === 'Lateral');
    addOptionsToField(lateral, 'Nasolabial angle', ['Acute', 'Normal', 'Obtuse']);
    addOptionsToField(lateral, 'Profile', ['Straight', 'Convex', 'Concave']);
    addOptionsToField(lateral, 'Lip competence', ['Competent', 'Incompetent']);
    addOptionsToField(lateral, 'E line', ['Lips within E-line', 'Protrusive', 'Retrusive']);
    addOptionsToField(lateral, 'Lip line', ['Normal', 'Gummy smile', 'Low smile (canine smile)']);
  }

  const intraOral = sections.find(s => s.title === 'Intra-oral');
  if(intraOral){
    const iFrontal = (intraOral.groups || []).find(g => g.title === 'Frontal');
    addOptionsToField(iFrontal, 'Overjet', ['Normal', 'Increased', 'Reverse (crossbite)']);
    addOptionsToField(iFrontal, 'Overbite', ['Normal', 'Deep', 'Open']);
    addOptionsToField(iFrontal, 'Midline', ['Coincident', 'Shifted right', 'Shifted left']);

    ['Upper', 'Lower'].forEach(gname => {
      const g = (intraOral.groups || []).find(x => x.title === gname);
      addOptionsToField(g, 'Arch form', ['U-shaped', 'V-shaped', 'Square', 'Tapered']);
      addOptionsToField(g, 'Incisor inclination', ['Proclined', 'Normal', 'Retroclined']);
      addOptionsToField(g, 'Midline', ['Coincident', 'Shifted right', 'Shifted left']);
      addOptionsToField(g, 'Rotation', ['None', 'Mild', 'Severe']);
      addOptionsToField(g, 'Crowding', ['None', 'Mild', 'Moderate', 'Severe']);
    });
  }

  const classification = sections.find(s => s.title === 'Classification');
  if(classification){
    const classOptions = ['Class I', 'Class II full unit', 'Class II 1/2', 'Class II 1/4', 'Class III full unit', 'Class III 1/2', 'Class III 1/4'];
    (classification.fields || []).forEach(f => {
      if(!f.options){ f.options = classOptions; changed = true; }
    });
  }

  const txPlan = sections.find(s => s.title === 'Treatment Plan');
  if(txPlan){
    addOptionsToField(txPlan, 'Extraction / Non-extraction', ['Extraction', 'Non-extraction']);
    const hasGrowth = (txPlan.fields || []).some(x => x.label.trim().toLowerCase() === 'growth modification');
    if(!hasGrowth){
      const idx = (txPlan.fields || []).findIndex(x => x.label.trim().toLowerCase() === 'extraction / non-extraction');
      const newField = { id: uid(), label: 'Growth modification', value: '', options: ['Yes', 'No'] };
      if(idx >= 0) txPlan.fields.splice(idx + 1, 0, newField);
      else txPlan.fields.push(newField);
      changed = true;
    }
  }

  return changed;
}

