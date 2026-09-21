// keyword-deduction.js — محرك الخصم التلقائي من الكلمات المفتاحية (rebonding, tube, wires...)
// ============ KEYWORD-BASED AUTO-DEDUCTION ============
// Palmer notation (quadrant letters + 1-8) <-> FDI (quadrant digit 1-4 + position digit 1-8)
// Clinic convention here is mirrored vs the anatomical default: FDI quadrant 1 (11-18) displays
// as UL, quadrant 2 (21-28) as UR, quadrant 3 (31-38) as LR, quadrant 4 (41-48) as LL.
const PALMER_QUADRANT_TO_FDI = { UR:'2', UL:'1', LL:'4', LR:'3' };
function palmerToFDI(quad, num){
  const q = PALMER_QUADRANT_TO_FDI[quad.toUpperCase()];
  if(!q) return null;
  return q + num;
}
function isValidFDI(tooth){
  return /^[1-4][1-8]$/.test(tooth);
}
// A bare FDI-style digit pair typed by the doctor (e.g. "12") is meant in the same mirrored
// direction as our Palmer convention, not the raw anatomical FDI quadrant — so it needs the
// same quadrant swap Palmer letters already get via palmerToFDI, or it lands on the wrong tooth.
const FDI_QUADRANT_MIRROR = { '1':'2', '2':'1', '3':'4', '4':'3' };
function mirrorFdiQuadrant(fdi){
  const s = String(fdi);
  if(!isValidFDI(s)) return s;
  return FDI_QUADRANT_MIRROR[s[0]] + s[1];
}
// Reverse of palmerToFDI — used everywhere a tooth number is DISPLAYED to the doctor,
// so every table/box shows Palmer (UR7, UL3, LR6...) while all data stays keyed by FDI internally.
const FDI_QUADRANT_TO_PALMER = { '1':'UL', '2':'UR', '3':'LR', '4':'LL' };
function fdiToPalmer(fdi){
  const s = String(fdi);
  if(!isValidFDI(s)) return s;
  return FDI_QUADRANT_TO_PALMER[s[0]] + s[1];
}

function findRevealItemByTooth(tooth, bracketSystem){
  const catId = bracketSystem === 'mbt' ? REVEAL_MBT_CATEGORY_ID : REVEAL_CATEGORY_ID;
  return state.inventory.find(i => i.category === catId && String(i.toothNum) === String(tooth));
}
function findBracketItem(){
  return state.inventory.find(i => i.category === BRACKET_CATEGORY_ID);
}

// finds the bracket sub-item under the main "براكيت" category whose name matches the given type (roth/mbt)
// String comparison so it matches regardless of whether toothNum was stored as a number (the 4
// legacy default tube items) or a string (any tooth added later via the tooth-number field).
function findTubeItemByFDI(fdi){
  return state.inventory.find(i => i.category === TUBE_CATEGORY_ID && String(i.toothNum) === String(fdi));
}

// ---- Tube tooth numbering: REAL (anatomical) FDI/Palmer, independent of the app's internal
// "mirrored" bracket-map/reveal convention used elsewhere (fdiToPalmer/palmerToFDI above).
// Quadrant 1 = upper right, 2 = upper left, 3 = lower left, 4 = lower right — standard FDI, matches
// BONDING_PALMER_TO_FDI already used for the first-molar tube flow (UR6:16, UL6:26, LR6:46, LL6:36).
const REAL_PALMER_QUADRANT_TO_FDI = { UR:'1', UL:'2', LL:'3', LR:'4' };
const REAL_FDI_QUADRANT_TO_PALMER = { '1':'UR', '2':'UL', '3':'LL', '4':'LR' };
function realPalmerToFDI(quad, num){
  const q = REAL_PALMER_QUADRANT_TO_FDI[quad.toUpperCase()];
  if(!q) return null;
  return q + num;
}
function realFdiToPalmer(fdi){
  const s = String(fdi);
  if(!isValidFDI(s)) return s;
  return REAL_FDI_QUADRANT_TO_PALMER[s[0]] + s[1];
}
// Converts this app's internal reveal/bracket-map FDI (the "mirrored" convention above) to the
// REAL anatomical FDI used by the Tube system — needed when a molar (position 6/7/8) is mentioned
// via the rebonding/فص keyword: rebonding still finds the tooth using the mirrored convention
// (extractToothMentions), but molars aren't on the reveal chart, so that tooth needs converting to
// real FDI to look it up in Tube stock instead.
function internalFdiToRealFdi(internalFdi){
  const s = String(internalFdi);
  if(!isValidFDI(s)) return null;
  const palmer = FDI_QUADRANT_TO_PALMER[s[0]];
  return REAL_PALMER_QUADRANT_TO_FDI[palmer] + s[1];
}
// Parses a single tooth-number input (used by the Tube "add item" field) in either real FDI
// (e.g. "17") or real Palmer (e.g. "UR7") form. Returns a canonical FDI string, or null if invalid.
function parseRealToothInput(raw){
  const s = (raw||'').trim();
  if(!s) return null;
  const palmerMatch = s.match(/^(UR|UL|LR|LL)\s?([1-8])$/i);
  if(palmerMatch) return realPalmerToFDI(palmerMatch[1], palmerMatch[2]);
  if(isValidFDI(s)) return s;
  return null;
}
function findBracketItemByType(type){
  const re = type === 'roth' ? /roth/i : /mbt/i;
  return state.inventory.find(i => i.category === BRACKET_CATEGORY_ID && re.test(i.name||''));
}
// ---- Wire size matching ----
// Round sizes: .012 / .014 / .016 / .018 / .020 / .021 ... any 2-3 digit round size.
// Rectangular sizes: .016x.022 / .017x.025 / .018x.025 / .019x.025 / .021x.025 ... written as
// "16*22", "16x22", "0.016x0.022", "17×25" etc. Canonical key: 3-digit padded, e.g. "016" or "016x022".
function padWireDigits(d){
  d = (d||'').replace(/^0+(?=\d)/, '');
  while(d.length < 3) d = '0' + d;
  return d.slice(-3);
}

// Pulls every wire-size-looking token out of a string (item name or log text) and returns
// canonical keys. Unambiguous forms only — decimals and rectangular pairs — safe to scan anywhere.
function extractWireTokensFromText(str){
  const keys = [];
  const rectRe = /0?\.?(\d{2,3})\s*[x×*]\s*0?\.?(\d{2,3})/gi;
  let m;
  const spans = [];
  while((m = rectRe.exec(str))){
    keys.push(padWireDigits(m[1]) + 'x' + padWireDigits(m[2]));
    spans.push([m.index, m.index + m[0].length]);
  }
  let stripped = str;
  spans.reverse().forEach(([s,e])=>{ stripped = stripped.slice(0,s) + ' '.repeat(e-s) + stripped.slice(e); });
  const decRe = /0?\.+(\d{2,3})(?!\d)/g;
  while((m = decRe.exec(stripped))){
    keys.push(padWireDigits(m[1]));
  }
  return keys;
}

// Same as extractWireTokensFromText but also picks up bare shorthand sizes (e.g. "18" with no dot),
// which is safe for an item NAME (already known to live in the wires store) even though it would be
// too ambiguous to allow in freeform log text without a "wire" keyword nearby.
function extractWireTokensFromItemName(name){
  const keys = extractWireTokensFromText(name);
  const stripped = stripWireTokenSpans(name);
  const bareRe = /(?<![.\d])(\d{2,3})(?!\s*[x×*]\s*\d)(?!\.\d)/g;
  let m;
  while((m = bareRe.exec(stripped))){
    keys.push(padWireDigits(m[1]));
  }
  return keys;
}

// Find a non-reveal, non-bracket item whose name matches a given canonical wire-size key
// (e.g. "012" or "016x022"), regardless of "upper"/"lower"/"سلك"/"فوقاني"/"تحتاني" wording,
// dot/asterisk/x notation. For round sizes, `type` ("NITI"/"SS") is used to prefer the item
// whose النوع field matches; falls back to any item of that size if no typed match exists.
// Rectangular sizes ignore `type` entirely (matched by size only, as before).
function findWireItemBySize(key, type){
  const matches = findWireItemsBySize(key);
  if(!matches.length) return null;
  if(type){
    const typed = matches.find(i => (i.type||'').trim().toUpperCase() === type);
    if(typed) return typed;
  }
  return matches[0];
}

// Every wire item (any type) whose name matches the given canonical size key — used to detect
// when a size is ambiguous (matches more than one type, e.g. SS/NITI/TMA all stocked at .012)
// so the user can be asked which one to deduct from.
function findWireItemsBySize(key){
  return state.inventory.filter(i=>{
    if(i.category === REVEAL_CATEGORY_ID || i.category === REVEAL_MBT_CATEGORY_ID || i.category === BRACKET_CATEGORY_ID) return false;
    return extractWireTokensFromItemName(i.name||'').includes(key);
  });
}

// Resolves a canonical wire-size key (e.g. "012") to a single stock item, asking the user to pick
// a type via askChoice if more than one type (SS/NITI/TMA) is stocked at that size. Returns null
// (after alerting) if no item at all is stocked at that size, or if the user cancels the choice.
async function resolveWireItemBySize(key, contextLabel){
  const matches = findWireItemsBySize(key);
  if(!matches.length){
    await alertModal(`مفيش صنف سلك مقاس 0.${key} مسجل في المخزون${contextLabel ? ' (' + contextLabel + ')' : ''} — ضيفه في المخزون الأول.`);
    return null;
  }
  const distinctTypes = [...new Set(matches.map(i => (i.type||'').trim().toUpperCase()).filter(Boolean))];
  if(matches.length === 1 || distinctTypes.length <= 1) return matches[0];
  const picked = await askChoice(
    'تحديد نوع السلك',
    `في أكتر من نوع سلك مقاس 0.${key} في المخزن${contextLabel ? ' (' + contextLabel + ')' : ''}. تختار تخصم من انهي نوع؟`,
    distinctTypes.map(t => ({ value: t, label: t }))
  );
  if(!picked) return null;
  return matches.find(i => (i.type||'').trim().toUpperCase() === picked) || null;
}

const WIRE_KEYWORD_RE = /wire|وير|سلك/i;

// Detects a NITI/SS/TMA mention right next to a round wire size, e.g. "0.012 niti", "0.016ss", "نيتي", "0.017 tma".
function detectWireType(str){
  if(/niti|نيتي/i.test(str)) return 'NITI';
  if(/\bss\b|استانلس|ستانلس/i.test(str)) return 'SS';
  if(/\btma\b|تي\s*ام\s*ايه|تى\s*ام\s*ايه/i.test(str)) return 'TMA';
  return null;
}

// Blanks out (same-length) any decimal or rectangular wire-size matches, so a leftover pass
// scanning for bare shorthand numbers can't re-pick up part of an already-matched size
// (e.g. the "22" inside "16*22").
function stripWireTokenSpans(str){
  const spans = [];
  const rectRe = /0?\.?(\d{2,3})\s*[x×*]\s*0?\.?(\d{2,3})/gi;
  let m;
  while((m = rectRe.exec(str))) spans.push([m.index, m.index + m[0].length]);
  const decRe = /0?\.+(\d{2,3})(?!\d)/g;
  while((m = decRe.exec(str))) spans.push([m.index, m.index + m[0].length]);
  let out = str;
  spans.sort((a,b)=>b[0]-a[0]).forEach(([s,e])=>{ out = out.slice(0,s) + ' '.repeat(e-s) + out.slice(e); });
  return out;
}

// Returns every wire mention in freeform log text as {key, type, rect}:
// - Rectangular ("16*22", "0.017x0.025") — matched by size only, type is always null (unchanged behavior).
// - Round, decimal form ("0.012", ".012", even a typo like "0..016") — matched anywhere in the text,
//   and if "niti"/"ss" (or نيتي/استانلس) appears right next to it (glued or spaced, before or after),
//   that material is attached so the correct stock item (NITI vs SS) gets deducted.
// - Round, bare shorthand ("12","16","18") — only right after a wire keyword (wire/وير/سلك), same
//   nearby-material detection applies.
function extractWireMentions(text){
  const results = [];
  const seen = new Set();

  // 1) rectangular — size-only, exactly as before
  const rectRe = /0?\.?(\d{2,3})\s*[x×*]\s*0?\.?(\d{2,3})/gi;
  let m;
  const rectSpans = [];
  while((m = rectRe.exec(text))){
    const key = padWireDigits(m[1]) + 'x' + padWireDigits(m[2]);
    rectSpans.push([m.index, m.index + m[0].length]);
    const dedupKey = 'rect:' + key;
    if(!seen.has(dedupKey)){ seen.add(dedupKey); results.push({key, type:null, rect:true}); }
  }
  let stripped = text;
  rectSpans.slice().reverse().forEach(([s,e])=>{ stripped = stripped.slice(0,s) + ' '.repeat(e-s) + stripped.slice(e); });

  // 2) round, decimal form — anywhere in the text, tolerant of a stray extra dot ("0..016")
  const decRe = /0?\.+(\d{2,3})(?!\d)/g;
  while((m = decRe.exec(stripped))){
    const key = padWireDigits(m[1]);
    const before = stripped.slice(Math.max(0, m.index - 12), m.index);
    const after = stripped.slice(m.index + m[0].length, m.index + m[0].length + 12);
    const type = detectWireType(after) || detectWireType(before);
    const dedupKey = 'round:' + key + ':' + (type||'');
    if(!seen.has(dedupKey)){ seen.add(dedupKey); results.push({key, type, rect:false}); }
  }

  // 3) round, bare shorthand — only right after a wire keyword, to avoid clashing with tooth
  // numbers/dates elsewhere in the text
  const strippedBare = stripWireTokenSpans(stripped);
  const kwRe = new RegExp(WIRE_KEYWORD_RE.source, 'gi');
  let km;
  while((km = kwRe.exec(strippedBare))){
    const rest = strippedBare.slice(km.index + km[0].length);
    const nextKw = rest.search(WIRE_KEYWORD_RE);
    let end = nextKw === -1 ? rest.length : nextKw;
    const nl = rest.indexOf('\n');
    if(nl !== -1 && nl < end) end = nl;
    const chunk = rest.slice(0, end);
    const bareRe = /(?<![.\d])(\d{2,3})(?!\s*[x×*]\s*\d)(?!\.\d)/g;
    let bm;
    while((bm = bareRe.exec(chunk))){
      const key = padWireDigits(bm[1]);
      const after = chunk.slice(bm.index + bm[0].length, bm.index + bm[0].length + 12);
      const before = chunk.slice(Math.max(0, bm.index - 12), bm.index);
      const type = detectWireType(after) || detectWireType(before);
      const dedupKey = 'round:' + key + ':' + (type||'');
      if(!seen.has(dedupKey)){ seen.add(dedupKey); results.push({key, type, rect:false}); }
    }
  }

  // 4) round, bare number glued or spaced directly to a niti/ss mention — no "wire" keyword
  // needed here, since the material word itself is the signal (e.g. "12niti", "12 niti", "ss16").
  const strippedBare2 = stripWireTokenSpans(stripped);
  const glueRe = /(\d{2,3})\s*(niti|نيتي|ss|tma)\b|\b(niti|نيتي|ss|tma)\s*(\d{2,3})/gi;
  let gm;
  while((gm = glueRe.exec(strippedBare2))){
    const digits = gm[1] || gm[4];
    const typeWord = gm[2] || gm[3];
    if(!digits) continue;
    const key = padWireDigits(digits);
    const type = detectWireType(typeWord);
    const dedupKey = 'round:' + key + ':' + (type||'');
    if(!seen.has(dedupKey)){ seen.add(dedupKey); results.push({key, type, rect:false}); }
  }

  return results;
}

// Elastics: user doesn't need to type "elastic"/"إيلاستيك" at all — a bare fraction size like
// "5/16", "5\16", "3/16", "1/4" anywhere in the text is enough on its own to be recognized.
function extractElasticMentions(text){
  const results = [];
  const seen = new Set();
  const re = /(\d{1,2})\s*[\/\\]\s*(\d{1,2})/g;
  let m;
  while((m = re.exec(text))){
    const key = m[1] + '/' + m[2];
    if(!seen.has(key)){ seen.add(key); results.push(key); }
  }
  return results;
}
function findElasticItemBySize(size){
  return state.inventory.find(i=>{
    if(i.category !== 'elastics') return false;
    const n = (i.name||'').replace(/\\/g,'/').replace(/\s+/g,'');
    return n.includes(size.replace(/\s+/g,''));
  });
}

// Generic name-based matching for any inventory item not already covered by the specialized
// wire/elastic/bracket/reveal matchers above (e.g. Accessories like mini-screw, button, ...).
// Case-insensitive and space-insensitive: "MiniScrew", "mini screw", "MINI SCREW" all match an
// item named "Mini Screw".
// 'accessories' is excluded here too now — accessory deduction moved to the explicit Wire/
// Accessories picker (wire-accessories-modal.js) so it's never missed by a doctor phrasing it
// differently in free text; only truly generic/custom categories still go through name-matching.
const GENERIC_EXCLUDED_CATEGORIES = new Set(['wires', 'elastics', 'accessories', BRACKET_CATEGORY_ID, REVEAL_CATEGORY_ID, REVEAL_MBT_CATEGORY_ID, TUBE_CATEGORY_ID]);
function normalizeForMatch(s){
  return (s||'').toString().toLowerCase().replace(/\s+/g,'');
}

// Shows a modal with one button per option and resolves with the picked value (or null if
// cancelled / closed). Used when a wire size matches more than one type in stock (e.g. SS/NITI/TMA)
// and we need the user to say which one to deduct from.
function askChoice(title, message, options){
  return new Promise(resolve=>{
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `
      <div class="modal">
        <h3>${escapeHtml(title)}</h3>
        <div class="placeholder" style="text-align:right;padding:10px;margin-bottom:14px;">${escapeHtml(message)}</div>
        <div class="modal-actions" style="flex-wrap:wrap;justify-content:flex-start;">
          ${options.map(o=>`<button class="choice-btn" data-value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</button>`).join('')}
        </div>
        <div class="modal-actions">
          <button class="secondary" id="choiceCancelBtn">إلغاء</button>
        </div>
      </div>
    `;
    document.body.appendChild(bg);
    let done = false;
    const finish = (v) => { if(done) return; done = true; bg.remove(); resolve(v); };
    bg.querySelectorAll('.choice-btn').forEach(btn=>{
      btn.onclick = () => finish(btn.dataset.value);
    });
    document.getElementById('choiceCancelBtn').onclick = () => finish(null);
    bg.onclick = (e) => { if(e.target === bg) finish(null); };
  });
}

// ============ QUICK-ACTION BUTTONS (rebonding/فص, bracket, other inventory item) ============
// Replaces the old free-text keyword scanning (scanAndDeductKeywords, removed) for these three —
// the doctor picks from a button + modal instead of typing a trigger phrase like "rebonding 16"
// or "bracket roth", so free text typed into the monthly note never triggers a deduction anymore.
// On success, a short descriptive line is appended into the relevant done-field so the note still
// reads like a normal log, exactly as if the keyword had been typed.

function appendToMonthlyField(e, fieldKey, line){
  const existing = (e[fieldKey] || '').trim();
  e[fieldKey] = existing ? existing + '\n' + line : line;
}

// shared confirm+apply core — same two-pass save order as the old scanAndDeductKeywords:
// inventory saved first, patient-file effects (bracket-map break + finance charge for a
// rebonding candidate) only committed once that inventory save is confirmed to have persisted.
//
// P0-4: الخصم بقى بيعدي أول على validateAndDeductBatch (inventory-deduct.js) — تحقق من توفر كل
// الأصناف المطلوبة دفعة واحدة (all-or-nothing) قبل خصم أي حاجة، بدل الخصم المباشر القديم
// (Math.max(0, qty-1)) اللي كان بينزّل الكمية صفر بصمت لو مكنش فيه مخزون كافي. الفانكشن دي هي
// المستخدمة في Rebonding/فص وBracket وأي "صنف عادي" من القوائم الديناميكية — تغطي أغلب نقاط
// الخصم في التطبيق غير Bonding وWire/Accessories (اللي مصلحين فعلاً في bonding-newcase.js
// وwire-accessories-modal.js).
async function applyDeductionCandidates(file, e, candidates){
  if(!candidates.length) return false;
  const msg = 'هيتخصم من المخزن:\n' + candidates.map(c=>'- ' + c.label).join('\n') + '\n\nموافق؟';
  if(!(await confirmModal(msg))) return false;

  const deductList = candidates.map(c => ({ item: c.item, qty: 1, label: c.label }));
  if(!(await validateAndDeductBatch(deductList))) return false;

  const bm = ensureBracketMap(file);
  const stockAlerts = candidates.filter(c => isLowStockItem(c.item)).map(c => c.item.name);
  const okInv = await saveInventory();
  if(!okInv) return false; // فشل الحفظ أو تعارض — setData وضح السبب في التوست بتاعه بالفعل

  if(!e.materialsUsed) e.materialsUsed = [];
  candidates.forEach(c=>{
    const matUse = { id: uid(), itemId: c.item.id, itemName: c.item.name, itemType: c.item.type || '', qty: 1, source:'action' };
    if(c.kind === 'rebond'){
      const t = bm.teeth[c.tooth];
      if(t){
        const isFirstBreak = t.breaks.length === 0;
        const charged = !isFirstBreak;
        const breakId = uid();
        const today = e.date || todayStr();
        t.breaks.push({ id: breakId, date: today, charged });
        t.status = 'broken';
        matUse.tooth = c.tooth;
        matUse.linkedBreakId = breakId;
        if(charged){
          if(!file.financeExtras) file.financeExtras = [];
          // P0-5: تخزين الفلوس كـ integer cents (قروش) عن طريق money-utils.js — amountCents هو
          // المصدر المعتمد، و amount (جنيه float) بيفضل متزامن جنبه للتوافق مع باقي ملفات النظام.
          file.financeExtras.push(writeAmountFields({ id: breakId, reason: `ريبوندنج فص - سن ${fdiToPalmer(c.tooth)}`, date: today }, 300));
        }
      }
    }
    e.materialsUsed.push(matUse);
  });

  toast(stockAlerts.length ? `اتخصم من المخزن — ⚠ ${stockAlerts.join('، ')} وصل لحد الإنذار` : 'اتخصم من المخزن');
  return true;
}

// asks فوق/تحت/الاتنين for where to log a piece of text that isn't inherently tied to one arch
// (bracket, a generic item) — same 3-option pattern already used for Distalization/Intrusion.
async function pickMonthlyFieldTarget(){
  return await askChoice('التسجيل في المتابعة', 'يتسجل فين؟', [
    { value:'doneUpper', label:'فوق' },
    { value:'doneLower', label:'تحت' },
    { value:'doneBoth', label:'الاتنين' }
  ]);
}

// ---- Rebonding / فص ----
async function handleRebondingAction(entryId){
  const file = state.currentPatientFile;
  if(!file.bracketSystem){
    await alertModal('نوع البراكيت للعيان ده لسه مش محدد — حدده الأول (ROTH ولا MBT) من فوق اسم المريض.');
    return;
  }
  const allTeeth = [...FDI_TEETH_ROWS.upper, ...FDI_TEETH_ROWS.lower];
  const picked = await pickTeethModal('Rebonding / فص', 'اختار الأسنان اللي فصت الشهر ده (تقدر تختار أكتر من واحد)', allTeeth);
  if(!picked) return;

  const candidates = [];
  const missing = [];
  picked.forEach(tooth=>{
    const isMolar = ['6','7','8'].includes(String(tooth).slice(-1));
    if(isMolar){
      const realFdi = internalFdiToRealFdi(tooth);
      const item = findTubeItemByFDI(realFdi);
      if(item) candidates.push({kind:'tube', item, tooth: realFdi, internalTooth: tooth, label: `${item.name} (سن ${realFdiToPalmer(realFdi)})`});
      else missing.push(realFdiToPalmer(realFdi));
    } else {
      const item = findRevealItemByTooth(tooth, file.bracketSystem);
      if(item) candidates.push({kind:'rebond', item, tooth, internalTooth: tooth, label: `${item.name} (سن ${fdiToPalmer(tooth)}) — ${bracketSystemLabel(file.bracketSystem)}`});
      else missing.push(fdiToPalmer(tooth));
    }
  });
  if(missing.length){
    await alertModal('مفيش صنف مسجل في المخزون للأسنان دي: ' + missing.join('، ') + ' — ضيفه الأول من شاشة المخزون.');
    return;
  }
  if(!candidates.length) return;

  materializeMonthlyDraft(entryId);
  const e = (file.monthlyLog||[]).find(x=>x.id===entryId);
  if(!e) return;

  const ok = await applyDeductionCandidates(file, e, candidates);
  if(!ok){ render(); return; }

  const upperTeeth = candidates.filter(c => FDI_TEETH_ROWS.upper.includes(String(c.internalTooth))).map(c => c.kind === 'tube' ? realFdiToPalmer(c.tooth) : fdiToPalmer(c.tooth));
  const lowerTeeth = candidates.filter(c => FDI_TEETH_ROWS.lower.includes(String(c.internalTooth))).map(c => c.kind === 'tube' ? realFdiToPalmer(c.tooth) : fdiToPalmer(c.tooth));
  if(upperTeeth.length) appendToMonthlyField(e, 'doneUpper', 'Rebonding ' + upperTeeth.join(', '));
  if(lowerTeeth.length) appendToMonthlyField(e, 'doneLower', 'Rebonding ' + lowerTeeth.join(', '));

  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  render();
}

// ---- Bracket (نوع البراكيت المسجل للمريض — مفيش داعي تختار، بيتحدد أوتوماتيك) ----
async function handleBracketAction(entryId){
  const file = state.currentPatientFile;
  if(!file.bracketSystem){
    await alertModal('نوع البراكيت للعيان ده لسه مش محدد — حدده الأول (ROTH ولا MBT) من فوق اسم المريض.');
    return;
  }
  const item = findBracketItemByType(file.bracketSystem);
  if(!item){
    await alertModal(`مفيش صنف "براكيت" ${bracketSystemLabel(file.bracketSystem)} في المخزون — ضيفه الأول.`);
    return;
  }

  materializeMonthlyDraft(entryId);
  const e = (file.monthlyLog||[]).find(x=>x.id===entryId);
  if(!e) return;

  const ok = await applyDeductionCandidates(file, e, [{kind:'bracket', item, label: item.name}]);
  if(!ok){ render(); return; }

  const fieldPick = await pickMonthlyFieldTarget();
  if(fieldPick) appendToMonthlyField(e, fieldPick, 'Bracket ' + bracketSystemLabel(file.bracketSystem));

  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  render();
}

// ---- one button per "plain" inventory category (any category not covered by the specialized
// pickers above — Wire/Elastic/Accessories, Bracket, Rebonding) — rendered dynamically from
// state.inventoryCategories in followup-tab.js, so adding a brand-new main category (e.g.
// "أوتاي") automatically gets its own button here with no code change needed.
function openCategoryItemPickerModal(categoryId, categoryLabel){
  const items = (state.inventory || []).filter(i => i.category === categoryId).sort((a,b) => a.name.localeCompare(b.name));
  const picked = []; // [{itemId, name}]
  return new Promise(resolve=>{
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `
      <div class="modal" style="max-width:420px;">
        <h3>إضافة صنف — ${escapeHtml(categoryLabel)}</h3>
        <div class="field">
          <label>الصنف</label>
          <div class="row" style="gap:6px;">
            <select id="catItemSelect" style="flex:1;">
              <option value="">— اختار صنف —</option>
              ${wamOptionsHtml(items)}
            </select>
            <button type="button" class="secondary small" id="catItemAddBtn">+ إضافة</button>
          </div>
          <div id="catItemList" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;"></div>
        </div>
        ${!items.length ? `<div class="placeholder" style="margin-top:10px;">مفيش أصناف مسجلة في قسم "${escapeHtml(categoryLabel)}" — ضيفهم الأول من شاشة المخزون.</div>` : ''}
        <div class="modal-actions">
          <button class="secondary" id="catItemCancelBtn">إلغاء</button>
          <button id="catItemConfirmBtn">تأكيد الخصم</button>
        </div>
      </div>
    `;
    document.body.appendChild(bg);
    function renderChips(){
      const wrap = document.getElementById('catItemList');
      wrap.innerHTML = picked.map((p,i)=>`
        <span class="stage-date-chip">${escapeHtml(p.name)} <button type="button" class="stage-date-remove" data-idx="${i}">×</button></span>
      `).join('');
      wrap.querySelectorAll('[data-idx]').forEach(btn=>{
        btn.onclick = () => { picked.splice(parseInt(btn.dataset.idx, 10), 1); renderChips(); };
      });
    }
    document.getElementById('catItemAddBtn').onclick = () => {
      const sel = document.getElementById('catItemSelect');
      const id = sel.value;
      if(!id) return;
      const item = items.find(i => i.id === id);
      if(!item) return;
      picked.push({ itemId: item.id, name: item.name });
      sel.value = '';
      renderChips();
    };
    let done = false;
    const cleanup = (result) => { if(done) return; done = true; bg.remove(); resolve(result); };
    document.getElementById('catItemCancelBtn').onclick = () => cleanup(null);
    bg.onclick = (e) => { if(e.target === bg) cleanup(null); };
    document.getElementById('catItemConfirmBtn').onclick = () => {
      if(!picked.length){ cleanup(null); return; }
      cleanup(picked.map(p => p.itemId));
    };
  });
}

async function handleCategoryItemAction(entryId, categoryId, categoryLabel){
  const pickedIds = await openCategoryItemPickerModal(categoryId, categoryLabel);
  if(!pickedIds || !pickedIds.length) return;

  materializeMonthlyDraft(entryId);
  const file = state.currentPatientFile;
  const e = (file.monthlyLog||[]).find(x=>x.id===entryId);
  if(!e) return;

  const candidates = pickedIds.map(id=>{
    const item = state.inventory.find(i => i.id === id);
    return item ? { kind:'item', item, label: item.name } : null;
  }).filter(Boolean);
  if(!candidates.length) return;

  const ok = await applyDeductionCandidates(file, e, candidates);
  if(!ok){ render(); return; }

  const fieldPick = await pickMonthlyFieldTarget();
  if(fieldPick) candidates.forEach(c => appendToMonthlyField(e, fieldPick, c.label));

  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  render();
}
