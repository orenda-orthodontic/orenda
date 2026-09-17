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
    },
    exportNames: ['BONDING_UPPER_RE', 'BONDING_LOWER_RE']
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
  test('BONDING_UPPER_RE / BONDING_LOWER_RE: match regardless of case or spacing', () => {
    assert.ok(g.BONDING_UPPER_RE.test('bonding upper'));
    assert.ok(g.BONDING_UPPER_RE.test('BondingUpper'));
    assert.ok(g.BONDING_UPPER_RE.test('BONDING  UPPER'));
    assert.ok(g.BONDING_LOWER_RE.test('bonding lower'));
    assert.ok(!g.BONDING_UPPER_RE.test('bonding lower')); // upper regex must not match "lower"
  });
}

// ============================================================
section('advanced-stage-keywords.js — treatment-stage keyword regexes');
// ============================================================
{
  const g = loadFile('advanced-stage-keywords.js', {
    exportNames: ['CANINE_RETRACTION_RE', 'MIDLINE_RE', 'DEROTATION_RE', 'FIRING_RE']
  });
  test('CANINE_RETRACTION_RE: matches with/without spacing, case-insensitive', () => {
    assert.ok(g.CANINE_RETRACTION_RE.test('canine retraction started'));
    assert.ok(g.CANINE_RETRACTION_RE.test('CanineRetraction'));
  });
  test('MIDLINE_RE: matches the bare word and the "correction" phrase', () => {
    assert.ok(g.MIDLINE_RE.test('midline shifted'));
    assert.ok(g.MIDLINE_RE.test('midline correction done'));
  });
  test('DEROTATION_RE: matches with or without the hyphen', () => {
    assert.ok(g.DEROTATION_RE.test('derotation'));
    assert.ok(g.DEROTATION_RE.test('de-rotation'));
  });
  test('FIRING_RE: does not false-positive on unrelated wire-size text', () => {
    assert.ok(!g.FIRING_RE.test('wire changed to 0.16'));
    assert.ok(g.FIRING_RE.test('firing the loop this month'));
  });
  test('extractKeywordLine: isolates only the line containing the keyword', () => {
    const text = 'wire 16 upper\ncanine retraction upper\nnext line unrelated';
    assert.strictEqual(g.extractKeywordLine(text, g.CANINE_RETRACTION_RE).trim(), 'canine retraction upper');
  });
  test('detectStageSides: a keyword typed in the Upper box applies to upper only', () => {
    const r = toPlainObject(g.detectStageSides('midline shifted', '', '', g.MIDLINE_RE));
    assert.deepStrictEqual(r, { upper: true, lower: false });
  });
  test('detectStageSides: typed in the shared "Both" box with no side word applies to both', () => {
    const r = toPlainObject(g.detectStageSides('', '', 'midline corrected', g.MIDLINE_RE));
    assert.deepStrictEqual(r, { upper: true, lower: true });
  });
  test('detectStageSides: an explicit side word in the "Both" box overrides to just that side', () => {
    const r = toPlainObject(g.detectStageSides('', '', 'midline corrected upper', g.MIDLINE_RE));
    assert.deepStrictEqual(r, { upper: true, lower: false });
  });
}

// ============================================================
section('bonding-newcase.js — bonding-keyword text parsing');
// ============================================================
{
  const g = loadFile('bonding-newcase.js');
  test('extractBondingLine: isolates just the line with the keyword', () => {
    const text = 'wire 16\nbonding upper done 16 26\nnext unrelated line';
    assert.strictEqual(g.extractBondingLine(text, /bonding\s*upper/i).trim(), 'bonding upper done 16 26');
  });
  test('extractBondingTubeTeeth: finds bare FDI tooth numbers on the line', () => {
    const found = toPlainArray(g.extractBondingTubeTeeth('bonding upper 16 26', 'upper')).sort();
    assert.deepStrictEqual(found, [16, 26]);
  });
  test('extractBondingTubeTeeth: finds Palmer notation (UR6/UL6) equally well', () => {
    const found = toPlainArray(g.extractBondingTubeTeeth('bonding upper UR6 UL6', 'upper')).sort();
    assert.deepStrictEqual(found, [16, 26]);
  });
  test('extractBondingTubeTeeth: ignores a tooth number that belongs to the OTHER arch', () => {
    const found = toPlainArray(g.extractBondingTubeTeeth('bonding upper 16 36', 'upper'));
    assert.deepStrictEqual(found, [16]); // 36 is a lower-arch tooth, not relevant to "upper"
  });
  test('extractBondingTubeTeeth: does not pick up a digit that is part of a larger number', () => {
    const found = toPlainArray(g.extractBondingTubeTeeth('used 116 items today', 'upper'));
    assert.deepStrictEqual(found, []); // "16" inside "116" must not match as tooth 16
  });
}

console.log('\n' + '-'.repeat(40));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
