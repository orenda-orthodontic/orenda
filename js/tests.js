// tests.js — plain Node.js regression tests, no framework/npm install needed.
// Run: node tests.js
//
// SCOPE: only the PURE logic — functions that take plain inputs and return a plain output, with
// no state/, document, or fetch/Supabase involved. That's the tooth-notation math, the keyword
// regexes, and a few of the trickier text-parsing helpers — exactly the kind of thing that's easy
// to silently break while editing a nearby function, and where a wrong answer (a break logged on
// the wrong tooth, a keyword that stops matching) would go unnoticed until a real patient's data
// was already wrong. NOT covered: anything needing a real DOM, Supabase, or app state (UI
// rendering, save/load, keyword-deduction's inventory side effects). That still needs manual
// testing in the browser.
//
// Each source file is loaded into its own isolated sandbox with just enough of its OWN top-level
// declarations — no cross-file globals are stubbed in, so a test only runs against a file that is
// genuinely self-contained for the function being tested.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadFile(file, opts){
  opts = opts || {};
  const sandbox = Object.assign({ console }, opts.globals || {});
  vm.createContext(sandbox);
  const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
  vm.runInContext(code, sandbox, { filename: file });
  // Top-level `const`/`let` in a vm context are NOT exposed as properties on the sandbox object
  // (only `function`/`var` declarations are) — so a const like a keyword regex is invisible from
  // outside even though the file loaded fine. A short follow-up script run in the SAME context
  // can still see those bindings (the context keeps one shared lexical environment across
  // multiple runInContext calls), so it re-attaches the ones tests need onto the sandbox object.
  if(opts.exportNames && opts.exportNames.length){
    const exportCode = opts.exportNames.map(n => `this.${n} = (typeof ${n} !== 'undefined') ? ${n} : undefined;`).join('\n');
    vm.runInContext(exportCode, sandbox, { filename: file + ' (export capture)' });
  }
  return sandbox;
}
// Arrays/objects a sandbox function RETURNS still belong to that sandbox's own V8 context, so
// assert.deepStrictEqual (which checks constructor identity, not just contents) sees them as a
// different "realm" than a plain array literal written in this test file and reports a false
// mismatch. Re-building the value as a plain array in THIS file's realm before comparing avoids
// that false positive without weakening the check on the values themselves.
function toPlainArray(v){ return [...v]; }
function toPlainObject(v){ return Object.assign({}, v); }

let passed = 0, failed = 0;
function test(name, fn){
  try{
    fn();
    passed++;
    console.log('  ✓ ' + name);
  }catch(e){
    failed++;
    console.log('  ✗ ' + name + '  —  ' + e.message);
  }
}
function section(name){ console.log('\n' + name); }

// ============================================================
section('state.js — date helpers');
// ============================================================
{
  const g = loadFile('state.js');
  test('addMonthToYm: rolls one month forward within a year', () => {
    assert.strictEqual(g.addMonthToYm('2026-08', 1), '2026-09');
  });
  test('addMonthToYm: rolls over into the next year at December', () => {
    assert.strictEqual(g.addMonthToYm('2026-12', 1), '2027-01');
  });
  test('addMonthToYm: negative delta goes backward, including year rollback', () => {
    assert.strictEqual(g.addMonthToYm('2026-01', -1), '2025-12');
  });
  test('addMonthToYm: default delta is +1 when omitted', () => {
    assert.strictEqual(g.addMonthToYm('2026-03'), '2026-04');
  });
  test('pad2: zero-pads single digits, leaves two digits alone', () => {
    assert.strictEqual(g.pad2(5), '05');
    assert.strictEqual(g.pad2(12), '12');
  });
  test('formatDateAr: reformats YYYY-MM-DD to DD/MM/YYYY', () => {
    assert.strictEqual(g.formatDateAr('2026-09-16'), '16/09/2026');
  });
  test('formatDateAr: passes through anything that is not a plain date', () => {
    assert.strictEqual(g.formatDateAr(''), '-');
    assert.strictEqual(g.formatDateAr(null), '-');
  });
}

// ============================================================
section('keyword-deduction.js — Palmer <-> FDI tooth notation');
// ============================================================
{
  // keyword-deduction.js references these four inventory-category-id constants at the top level
  // (they're defined in inventory-view.js in the real app); the functions under test here don't
  // depend on their actual values, so plain placeholders are enough to let the file load.
  const g = loadFile('keyword-deduction.js', {
    globals: {
      BRACKET_CATEGORY_ID: 'bracket',
      REVEAL_CATEGORY_ID: 'reveal',
      REVEAL_MBT_CATEGORY_ID: 'reveal_mbt',
      TUBE_CATEGORY_ID: 'tube'
    }
  });
  test('palmerToFDI: applies the clinic\'s mirrored quadrant convention', () => {
    assert.strictEqual(g.palmerToFDI('UR', '6'), '26');
    assert.strictEqual(g.palmerToFDI('UL', '6'), '16');
    assert.strictEqual(g.palmerToFDI('LR', '6'), '36');
    assert.strictEqual(g.palmerToFDI('LL', '6'), '46');
  });
  test('fdiToPalmer: is the exact inverse of palmerToFDI for every quadrant', () => {
    ['UR','UL','LR','LL'].forEach(q => {
      const fdi = g.palmerToFDI(q, '6');
      assert.strictEqual(g.fdiToPalmer(fdi), q + '6');
    });
  });
  test('mirrorFdiQuadrant: swaps quadrant 1<->2 and 3<->4, keeps the tooth position digit', () => {
    assert.strictEqual(g.mirrorFdiQuadrant('16'), '26');
    assert.strictEqual(g.mirrorFdiQuadrant('43'), '33');
  });
  test('isValidFDI: accepts only a real quadrant(1-4) + position(1-8) pair', () => {
    assert.ok(g.isValidFDI('16'));
    assert.ok(!g.isValidFDI('96')); // no quadrant 9
    assert.ok(!g.isValidFDI('19')); // no position 9
    assert.ok(!g.isValidFDI('6'));  // not two digits
  });
}

// ============================================================
section('clinic-features.js — computeMissedMonths (explicit-marker based)');
// ============================================================
{
  const g = loadFile('clinic-features.js', { state: {} });
  test('an active case with no missed markers at all: 0', () => {
    const file = { caseStatus: 'active', monthlyLog: [
      { date: '2026-07-01', doneBoth: 'adjustment' },
      { date: '2026-08-01', doneBoth: 'adjustment' }
    ]};
    assert.strictEqual(g.computeMissedMonths(file), 0);
  });
  test('counts consecutive missed markers at the most recent end of the log', () => {
    const file = { caseStatus: 'active', monthlyLog: [
      { date: '2026-06-01', doneBoth: 'adjustment' },
      { date: '2026-07-01', missed: true, missedReason: 'سفر' },
      { date: '2026-08-01', missed: true, missedReason: '' }
    ]};
    assert.strictEqual(g.computeMissedMonths(file), 2);
  });
  test('a real visit logged after a missed one resets the streak to 0', () => {
    const file = { caseStatus: 'active', monthlyLog: [
      { date: '2026-07-01', missed: true },
      { date: '2026-08-01', doneBoth: 'came back, adjustment done' }
    ]};
    assert.strictEqual(g.computeMissedMonths(file), 0);
  });
  test('a gap with NO entry at all (never explicitly marked) no longer counts as missed', () => {
    // this is the exact behavior change that was requested — logging late (or not logging a
    // month at all) must not by itself look like a no-show anymore
    const file = { caseStatus: 'active', monthlyLog: [
      { date: '2026-03-01', doneBoth: 'adjustment' }
      // 2026-04 through 2026-09 have nothing logged, but nothing was explicitly marked missed
    ]};
    assert.strictEqual(g.computeMissedMonths(file), 0);
  });
  test('a debonded (archived) case never counts as missed regardless of markers', () => {
    const file = { caseStatus: 'debonded', monthlyLog: [
      { date: '2026-08-01', missed: true }
    ]};
    assert.strictEqual(g.computeMissedMonths(file), 0);
  });
}

// ============================================================
section('clinic-features.js — defaultRecordDate (last real visit when today is not a visit day)');
// ============================================================
{
  function mk(dates, currentFile, today){
    return loadFile('clinic-features.js', { globals: {
      state: { currentClinicId: 'c1', clinicRealVisitDates: { c1: dates }, currentPatientFile: currentFile || null },
      todayStr: () => today
    }});
  }
  test('today is itself a real visit day: keeps today', () => {
    assert.strictEqual(mk(['2026-09-10', '2026-09-21'], null, '2026-09-21').defaultRecordDate(), '2026-09-21');
  });
  test('today is not a visit day: falls back to the latest earlier real visit', () => {
    assert.strictEqual(mk(['2026-09-05', '2026-09-12'], null, '2026-09-21').defaultRecordDate(), '2026-09-12');
  });
  test('no visits logged for the clinic yet: today', () => {
    assert.strictEqual(mk([], null, '2026-09-21').defaultRecordDate(), '2026-09-21');
  });
  test('a visit logged in the open patient file counts even if the clinic scan predates it', () => {
    const file = { monthlyLog: [{ date: '2026-09-21', doneBoth: 'adjustment' }] };
    assert.strictEqual(mk(['2026-09-05'], file, '2026-09-21').defaultRecordDate(), '2026-09-21');
  });
  test('missed-marker entries never count as a visit', () => {
    const file = { monthlyLog: [{ date: '2026-09-20', missed: true }] };
    assert.strictEqual(mk(['2026-09-05'], file, '2026-09-21').defaultRecordDate(), '2026-09-05');
  });
}

async function testAsync(name, fn){
  try{
    await fn();
    passed++;
    console.log('  ✓ ' + name);
  }catch(e){
    failed++;
    console.log('  ✗ ' + name + '  —  ' + e.message);
  }
}

(async () => {
  section('clinic-features.js — computeWorkDaysThisMonth (async, mocked network)');
  {
    // simulates 2 clinics; both have one patient with a real visit logged on the SAME calendar
    // day (2026-09-05) plus one explicitly-missed entry on a different day — the missed one must
    // not count, and the same day being worked across two clinics must still count once, not twice
    const syntheticFile = { monthlyLog: [
      { date: '2026-09-05', doneBoth: 'adjustment' },
      { date: '2026-09-12', missed: true }
    ]};
    // batchLoadPatientFiles is a REAL function inside clinic-features.js itself (not something a
    // sandbox global can override) — it needs ensureFreshSession()/fetch(), which aren't mocked
    // here, so it throws and falls back to its own per-patient getData('patientfile:'+id, null)
    // recovery loop. Mocking getData for BOTH key shapes ('patients:' and 'patientfile:') lets
    // that real fallback path supply the synthetic data instead of trying to fake fetch() itself.
    const g = loadFile('clinic-features.js', { globals: {
      state: { clinics: [{ id: 'c1', name: 'Clinic A' }, { id: 'c2', name: 'Clinic B' }] },
      getData: async (key, fallback) => {
        if(key.indexOf('patients:') === 0) return [{ id: 'p1' }];
        if(key.indexOf('patientfile:') === 0) return syntheticFile;
        return fallback;
      }
    }});
    await testAsync('dedups the same worked day across clinics and excludes missed-marker days', async () => {
      const result = toPlainObject(await g.computeWorkDaysThisMonth('2026-09'));
      assert.strictEqual(result.count, 1);
      assert.deepStrictEqual(toPlainArray(result.dates), ['2026-09-05']);
    });
  }

  // ============================================================
  section('inventory-deduct.js — validateAndDeductBatch (all-or-nothing)');
  // ============================================================
  {
    const alerts = [];
    const g = loadFile('inventory-deduct.js', { globals: { alertModal: async (m) => { alerts.push(m); }, logAuditEvent: async () => {} } });
    await testAsync('كمية كافية لكل الأصناف: بيخصم الكل ويرجع true', async () => {
      const a = { id:'a', name:'A', qty: 3 }, b = { id:'b', name:'B', qty: 1 };
      assert.strictEqual(await g.validateAndDeductBatch([{item:a, qty:1},{item:b, qty:1}]), true);
      assert.strictEqual(a.qty, 2); assert.strictEqual(b.qty, 0);
    });
    await testAsync('صنف واحد ناقص: مفيش حاجة بتتخصم خالص (ولا حتى الأصناف الكافية) وبيرجع false', async () => {
      const a = { id:'a', name:'A', qty: 5 }, b = { id:'b', name:'B', qty: 0 };
      assert.strictEqual(await g.validateAndDeductBatch([{item:a, qty:1},{item:b, qty:1}]), false);
      assert.strictEqual(a.qty, 5); assert.strictEqual(b.qty, 0);
      assert.ok(alerts.length >= 1);
    });
    await testAsync('كمية مطلوبة أكبر من المتاح: بيترفض ومبينزلش تحت الصفر', async () => {
      const a = { id:'a', name:'A', qty: 2 };
      assert.strictEqual(await g.validateAndDeductBatch([{item:a, qty:3}]), false);
      assert.strictEqual(a.qty, 2);
    });
  }

  // ============================================================
  section('money — cents aggregation in computeCaseStatsFromFiles (no float drift)');
  // ============================================================
  {
    const mu = loadFile('money-utils.js');
    const ft = loadFile('finance-tab.js', { globals: { egpToCents: mu.egpToCents, centsToEgp: mu.centsToEgp, formatEgpFromCents: mu.formatEgpFromCents, readAmountCents: mu.readAmountCents, writeAmountFields: mu.writeAmountFields } });
    const g = loadFile('clinic-features.js', { globals: {
      state: {}, readAmountCents: mu.readAmountCents, centsToEgp: mu.centsToEgp, egpToCents: mu.egpToCents,
      readFinanceTotalCents: ft.readFinanceTotalCents,
      computeCaseStartDate: () => null, monthsSince: () => 0,
      CASE_LONG_DURATION_MONTHS: 18, CASE_ONE_YEAR_MONTHS: 12
    }});
    test('10 دفعات 0.10 جنيه = 1.00 بالظبط (float كان هيدي 0.9999999999999999)', () => {
      const payments = Array.from({length:10}, () => ({ date:'2026-09-05', amount: 0.1 }));
      const r = g.computeCaseStatsFromFiles([{ patient:{name:'P'}, file:{ caseStatus:'active', payments, financeTotal: 0 } }], '2026-09', 70);
      assert.strictEqual(r.monthTotals['2026-09'], 1);
    });
    test('نصيبك بيتحسب بالقروش: 3 دفعات 33.33 بنسبة 70% مجموعهم متسق مع تقريب كل دفعة', () => {
      const payments = [1,2,3].map(() => ({ date:'2026-09-05', amountCents: 3333, amount: 33.33 }));
      const r = g.computeCaseStatsFromFiles([{ patient:{name:'P'}, file:{ caseStatus:'active', payments } }], '2026-09', 70);
      assert.strictEqual(r.monthTotals['2026-09'], 99.99);
      assert.strictEqual(r.monthYourShareTotals['2026-09'], 3 * 23.33); // round(3333*0.7)=2333 لكل دفعة
    });
    test('حالة الدكتور (clinicHasShare=false) نصيبه 100%', () => {
      const payments = [{ date:'2026-09-05', amountCents: 10000, amount: 100 }];
      const r = g.computeCaseStatsFromFiles([{ patient:{name:'P'}, file:{ caseStatus:'active', clinicHasShare:false, payments } }], '2026-09', 70);
      assert.strictEqual(r.monthYourShareTotals['2026-09'], 100);
    });
    test('paidOffStillActive بيستخدم financeTotalCents لو موجود', () => {
      const file = { caseStatus:'active', financeTotalCents: 50000, payments:[{ date:'2026-09-05', amountCents: 50000 }] };
      const r = g.computeCaseStatsFromFiles([{ patient:{name:'P'}, file }], '2026-09', 70);
      assert.strictEqual(r.paidOffStillActive.length, 1);
    });
  }

  // ============================================================
  section('backup.js — restore round-trip (مخزن وهمي بيبدّل ترتيب المفاتيح زي Postgres jsonb)');
  // ============================================================
  {
    // بيحاكي kv_store: القيمة بتترجع كـ JSON string بس بترتيب مفاتيح مختلف (jsonb مبيحافظش على الترتيب)
    function reorderKeys(v){
      if(v === null || typeof v !== 'object') return v;
      if(Array.isArray(v)) return v.map(reorderKeys);
      const out = {}; Object.keys(v).sort().reverse().forEach(k => { out[k] = reorderKeys(v[k]); }); return out;
    }
    const store = {};
    let failNextSetFor = null;
    const g = loadFile('backup.js', { globals: {
      idbListKeys: async () => Object.keys(store),
      idbGet: async (k) => (k in store) ? JSON.stringify(reorderKeys(store[k])) : null,
      setData: async (k, v) => { if(failNextSetFor === k){ failNextSetFor = null; return false; } store[k] = JSON.parse(JSON.stringify(v)); return true; }
    }});
    test('canonicalStringify: نفس الداتا بترتيب مفاتيح مختلف = نفس الـ string', () => {
      assert.strictEqual(g.canonicalStringify({a:1,b:{c:2,d:[1,{x:1,y:2}]}}), g.canonicalStringify({b:{d:[1,{y:2,x:1}],c:2},a:1}));
      assert.notStrictEqual(g.canonicalStringify({a:1}), g.canonicalStringify({a:2}));
    });
    test('isBackupExcludedKey: النسخ والـ snapshots وسجل التدقيق برة، والبيانات الحقيقية جوه', () => {
      ['dailybackup:2026-09-01','preimportsnapshot:x','auditlog:2026-09','lastAutoBackupDate'].forEach(k => assert.ok(g.isBackupExcludedKey(k), k));
      ['clinics','inventory','patientfile:1','patients:c1','deletedRevealTeeth','doctorName'].forEach(k => assert.ok(!g.isBackupExcludedKey(k) && g.isImportAllowedKey(k), k));
    });
    store['clinics'] = [{ id:'c1', name:'A', commission: 70 }];
    store['patients:c1'] = [{ id:'p1', name:'X' }];
    store['patientfile:p1'] = { payments:[{ id:'1', amountCents: 5000, amount: 50 }], financeTotalCents: 100000, monthlyLog: [{ date:'2026-09-01', doneBoth:'x' }] };
    store['dailybackup:2026-09-01'] = { data: { huge: 'nested' } };
    store['auditlog:2026-09'] = [{ id:'1' }];
    await testAsync('collectAllData: مبتضمنش النسخ القديمة (مفيش تداخل/تضاعف)', async () => {
      const data = await g.collectAllData();
      assert.deepStrictEqual(toPlainArray(Object.keys(data).sort()), ['clinics','patientfile:p1','patients:c1']);
    });
    await testAsync('round-trip: باك أب → تخريب → استرجاع → verifyImportedData بيرجع فاضي', async () => {
      const data = await g.collectAllData();
      const snapshot = JSON.parse(JSON.stringify(data));
      store['patientfile:p1'].payments = []; store['clinics'][0].commission = 10; delete store['patients:c1'];
      const keys = Object.keys(snapshot).filter(g.isImportAllowedKey);
      const failed = await g.applyImportData(snapshot, keys);
      assert.strictEqual(failed.length, 0);
      const mismatched = await g.verifyImportedData(snapshot, keys);
      assert.strictEqual(mismatched.length, 0);
      assert.strictEqual(store['patientfile:p1'].payments[0].amountCents, 5000);
      assert.strictEqual(store['clinics'][0].commission, 70);
    });
    await testAsync('فشل عابر في مفتاح واحد: المحاولة التانية بتنجح', async () => {
      failNextSetFor = 'clinics';
      const failed = await g.applyImportData({ clinics: [{ id:'c1' }] }, ['clinics']);
      assert.strictEqual(failed.length, 0);
    });
    await testAsync('verifyImportedData: بيكشف مفتاح مش مطابق فعلاً', async () => {
      const mismatched = await g.verifyImportedData({ clinics: [{ id:'zzz' }] }, ['clinics']);
      assert.deepStrictEqual(toPlainArray(mismatched), ['clinics']);
    });
  }

  // ============================================================
  section('webceph-import.js — parsing + mapping into the Cephalometric section');
  // ============================================================
  {
    const g = loadFile('webceph-import.js', { globals: { escapeHtml: (x) => String(x) } });
    const mkFile = () => ({ diagnosisSections: [
      { id:'s1', title:'Extra-oral', fields:[{ id:'x', label:'SNA', value:'999' }], groups:[] },
      { id:'s2', title:'Cephalometric', groups:[], fields: ['SNA','SNB','ANB','FMA','SN-MAN','U1-SN','L1-MAN','U1-L1','Nasolabial angle'].map((l,i) => ({ id:'f'+i, label:l, value:'' })) }
    ]});
    // القيم الحقيقية من تقرير WebCeph اللي ابتعت (Chart Analysis)
    const modelReply = '```json\n{"sna":"83.3","snb":78.3,"anb":"4.9 *","fma":"29.1","sn_man":"39.4","u1_sn":"109.4","l1_man":"100.9","u1_l1":"110.3","nasolabial":"104.9"}\n```';
    test('normalizeCephValue: بيطلّع الرقم بس (من غير نجوم/وحدات) وفاضي لو مفيش', () => {
      assert.strictEqual(g.normalizeCephValue('4.9 *'), '4.9');
      assert.strictEqual(g.normalizeCephValue('-86,4'), '-86.4');
      assert.strictEqual(g.normalizeCephValue(null), '');
      assert.strictEqual(g.normalizeCephValue('n/a'), '');
    });
    test('parseWebcephResponse: بيقرا JSON جوه markdown fences ويطبّع القيم', () => {
      const v = toPlainObject(g.parseWebcephResponse(modelReply));
      assert.strictEqual(v.anb, '4.9'); assert.strictEqual(v.snb, '78.3'); assert.strictEqual(v.nasolabial, '104.9');
    });
    test('parseWebcephResponse: رد من غير JSON بيرمي خطأ واضح', () => {
      assert.throws(() => g.parseWebcephResponse('مش قادر أقرا الملف'));
    });
    test('planWebcephApply: بيلاقي الخانات جوه قسم Cephalometric بس (مش SNA بتاعة Extra-oral)', () => {
      const file = mkFile();
      const rows = g.planWebcephApply(file, g.parseWebcephResponse(modelReply));
      assert.strictEqual(rows.length, 9);
      assert.ok(rows.every(r => r.found && r.selected));
    });
    test('applyWebcephRows: بيكتب القيم الصح في الخانات الصح ومبيلمسش خانات أقسام تانية', () => {
      const file = mkFile();
      const rows = g.planWebcephApply(file, g.parseWebcephResponse(modelReply));
      assert.strictEqual(g.applyWebcephRows(file, rows), 9);
      const ceph = file.diagnosisSections[1].fields;
      const val = (l) => ceph.find(f => f.label === l).value;
      assert.strictEqual(val('SNA'), '83.3'); assert.strictEqual(val('SN-MAN'), '39.4');
      assert.strictEqual(val('L1-MAN'), '100.9'); assert.strictEqual(val('U1-L1'), '110.3'); assert.strictEqual(val('Nasolabial angle'), '104.9');
      assert.strictEqual(file.diagnosisSections[0].fields[0].value, '999');
    });
    test('قيمة قديمة مختلفة: مش متعلّمة تلقائي، ومبتتكتبش فوقها', () => {
      const file = mkFile();
      file.diagnosisSections[1].fields[0].value = '80';
      const rows = g.planWebcephApply(file, g.parseWebcephResponse(modelReply));
      assert.strictEqual(rows[0].selected, false);
      g.applyWebcephRows(file, rows);
      assert.strictEqual(file.diagnosisSections[1].fields[0].value, '80');
    });
    test('خانة اتمسحت/اتغير اسمها: بتتعلّم مش موجودة ومبتتكتبش', () => {
      const file = mkFile();
      file.diagnosisSections[1].fields = file.diagnosisSections[1].fields.filter(f => f.label !== 'FMA');
      const rows = g.planWebcephApply(file, g.parseWebcephResponse(modelReply));
      const fma = rows.find(r => r.key === 'fma');
      assert.strictEqual(fma.found, false); assert.strictEqual(fma.selected, false);
      assert.strictEqual(g.applyWebcephRows(file, rows), 8);
    });
    test('قيمة مش مقروءة (null من الموديل): مبتتكتبش', () => {
      const file = mkFile();
      const v = g.parseWebcephResponse('{"sna":"83.3","snb":null}');
      const rows = g.planWebcephApply(file, v);
      assert.strictEqual(rows.find(r => r.key === 'snb').selected, false);
      assert.strictEqual(g.applyWebcephRows(file, rows), 1);
    });
  }

  console.log('\n' + '-'.repeat(40));
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
