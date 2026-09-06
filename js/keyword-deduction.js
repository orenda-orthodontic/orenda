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

function extractToothMentions(text){
  // returns FDI tooth numbers mentioned near a rebonding/فص keyword, in either FDI (e.g. "11") or Palmer (e.g. "LL2") form.
  // Supports multiple teeth in one mention, e.g. "rebonding (25,13,LL6,UR3)" or "rebonding 25,13,ll6 و ur3".
  const teeth = new Set();
  const KEYWORD_RE = /rebonding|ريبوندنج|ريبوندينج|فص/i;
  const kwRe = new RegExp(KEYWORD_RE.source, 'gi');
  let km;
  while((km = kwRe.exec(text))){
    const rest = text.slice(km.index + km[0].length);
    const nextKw = rest.search(KEYWORD_RE);
    let end = nextKw === -1 ? rest.length : nextKw;
    const nl = rest.indexOf('\n');
    if(nl !== -1 && nl < end) end = nl;
    const chunk = rest.slice(0, end);
    // split the list on commas, whitespace, parentheses/brackets, slashes, and "و" (Arabic "and")
    const tokens = chunk.split(/[,،؛\s()\/؛و]+/).map(t=>t.trim()).filter(Boolean);
    tokens.forEach(token=>{
      const palmerMatch = token.match(/^(UR|UL|LR|LL)\s?([1-8])$/i);
      if(palmerMatch){
        const fdi = palmerToFDI(palmerMatch[1], palmerMatch[2]);
        if(fdi && isValidFDI(fdi)) teeth.add(fdi);
        return;
      }
      if(isValidFDI(token)) teeth.add(mirrorFdiQuadrant(token));
    });
  }
  return [...teeth];
}

// Generalized tube recognition: typing "tube"/"تيوب" followed by a tooth number — real FDI (e.g.
// "17") or real Palmer (e.g. "UR7") — matches whichever Tube stock item is registered for that
// exact tooth (any tooth, not just the 4 legacy first-molar positions) and deducts it. Supports
// multiple teeth in one mention, same list-splitting rules as rebonding/فص above.
const TUBE_KEYWORD_RE = /\btube\b|تيوب/i;
function extractTubeToothMentions(text){
  const teeth = new Set();
  const kwRe = new RegExp(TUBE_KEYWORD_RE.source, 'gi');
  let km;
  while((km = kwRe.exec(text))){
    const rest = text.slice(km.index + km[0].length);
    const nextKw = rest.search(TUBE_KEYWORD_RE);
    let end = nextKw === -1 ? rest.length : nextKw;
    const nl = rest.indexOf('\n');
    if(nl !== -1 && nl < end) end = nl;
    const chunk = rest.slice(0, end);
    const tokens = chunk.split(/[,،؛\s()\/؛و]+/).map(t=>t.trim()).filter(Boolean);
    tokens.forEach(token=>{
      const fdi = parseRealToothInput(token);
      if(fdi) teeth.add(fdi);
    });
  }
  return [...teeth];
}

function hasBracketRothMention(text){
  return /bracket\s*roth|براكيت\s*روث/i.test(text);
}
function hasBracketMbtMention(text){
  return /bracket\s*mbt|براكيت\s*mbt/i.test(text);
}

// "bonding upper" / "bonding lower" — case-insensitive, works with or without a space between
// the two words (e.g. "BondingUpper", "bonding upper", "BONDING LOWER").
const BONDING_UPPER_RE = /bonding\s*upper/i;
const BONDING_LOWER_RE = /bonding\s*lower/i;

// Generic name-based matching for any inventory item not already covered by the specialized
// wire/elastic/bracket/reveal matchers above (e.g. Accessories like mini-screw, button, ...).
// Case-insensitive and space-insensitive: "MiniScrew", "mini screw", "MINI SCREW" all match an
// item named "Mini Screw".
const GENERIC_EXCLUDED_CATEGORIES = new Set(['wires', 'elastics', BRACKET_CATEGORY_ID, REVEAL_CATEGORY_ID, REVEAL_MBT_CATEGORY_ID, TUBE_CATEGORY_ID]);
function normalizeForMatch(s){
  return (s||'').toString().toLowerCase().replace(/\s+/g,'');
}
function extractGenericItemMentions(text){
  const norm = normalizeForMatch(text);
  if(!norm) return [];
  return state.inventory.filter(i=>{
    if(GENERIC_EXCLUDED_CATEGORIES.has(i.category)) return false;
    const name = normalizeForMatch(i.name);
    if(!name) return false;
    return norm.includes(name);
  });
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

async function scanAndDeductKeywords(entryId, text){
  const file = state.currentPatientFile;
  const e = (file.monthlyLog||[]).find(x=>x.id===entryId);
  if(!e || !text) return;
  if(!e.materialsUsed) e.materialsUsed = [];
  const matchedKeys = new Set(e.materialsUsed.map(u=>u.matchKey).filter(Boolean));

  const candidates = []; // {matchKey, kind, item, tooth, label}

  // wires — if a size matches more than one type in stock (SS/NITI/TMA) and the text didn't say
  // which one, ask the user to pick; otherwise use the type mentioned in the text (or the only match).
  // Counted PER LINE so the same size mentioned once in the upper row and once in the lower row
  // deducts twice (two real wires), not once — matchKey gets a #1/#2/... suffix per occurrence.
  // A bare (unsuffixed) legacy key from before this fix still counts as occurrence #1, so nothing
  // already recorded gets deducted again.
  {
    const wireLines = text.split('\n');
    const wireBaseCounts = {};
    for(const line of wireLines){
      if(!line.trim()) continue;
      for(const w of extractWireMentions(line)){
        const sizeMatches = findWireItemsBySize(w.key);
        if(!sizeMatches.length) continue;

        let resolvedType = w.type;
        let item = resolvedType ? sizeMatches.find(i => (i.type||'').trim().toUpperCase() === resolvedType) : null;

        if(!item){
          const distinctTypes = [...new Set(sizeMatches.map(i => (i.type||'').trim().toUpperCase()).filter(Boolean))];
          if(sizeMatches.length === 1 || distinctTypes.length <= 1){
            item = sizeMatches[0];
            resolvedType = (item.type||'').trim().toUpperCase() || null;
          } else {
            const sizeLabel = w.rect ? w.key.replace('x', '×') : ('0.' + w.key);
            const picked = await askChoice(
              'تحديد نوع السلك',
              `في أكتر من نوع سلك مقاس ${sizeLabel} في المخزن. تختار تخصم من انهي نوع؟`,
              distinctTypes.map(t => ({ value: t, label: t }))
            );
            if(!picked) continue; // user cancelled this wire — skip it, keep processing the rest of the text
            resolvedType = picked;
            item = sizeMatches.find(i => (i.type||'').trim().toUpperCase() === picked);
          }
        }
        if(!item) continue;

        const baseKey = 'wire:' + w.key + (resolvedType ? ':' + resolvedType : '');
        const count = (wireBaseCounts[baseKey] = (wireBaseCounts[baseKey]||0) + 1);
        const key = baseKey + '#' + count;
        const alreadyRecorded = matchedKeys.has(key) || (count === 1 && matchedKeys.has(baseKey));
        if(alreadyRecorded) continue;
        candidates.push({matchKey:key, kind:'wire', item, label: item.name});
      }
    }
  }

  // elastics (size alone is enough, no "elastic"/"ايلاستيك" word needed) — same per-line, per-occurrence counting as wires
  {
    const elasticLines = text.split('\n');
    const elasticBaseCounts = {};
    for(const line of elasticLines){
      if(!line.trim()) continue;
      extractElasticMentions(line).forEach(size=>{
        const baseKey = 'elastic:' + size;
        const count = (elasticBaseCounts[baseKey] = (elasticBaseCounts[baseKey]||0) + 1);
        const key = baseKey + '#' + count;
        const alreadyRecorded = matchedKeys.has(key) || (count === 1 && matchedKeys.has(baseKey));
        if(alreadyRecorded) return;
        const item = findElasticItemBySize(size);
        if(item) candidates.push({matchKey:key, kind:'elastic', item, label: item.name});
      });
    }
  }

  // any other named inventory item (accessories, otie, etc.) — matched by name, case/space-insensitive,
  // same per-line, per-occurrence counting so mentioning the same accessory once per arch deducts twice
  {
    const itemLines = text.split('\n');
    const itemBaseCounts = {};
    for(const line of itemLines){
      if(!line.trim()) continue;
      extractGenericItemMentions(line).forEach(item=>{
        const baseKey = 'item:' + item.id;
        const count = (itemBaseCounts[baseKey] = (itemBaseCounts[baseKey]||0) + 1);
        const key = baseKey + '#' + count;
        const alreadyRecorded = matchedKeys.has(key) || (count === 1 && matchedKeys.has(baseKey));
        if(alreadyRecorded) return;
        candidates.push({matchKey:key, kind:'item', item, label: item.name});
      });
    }
  }

  // bracket roth / bracket mbt (deducts from the main "براكيت" category, NOT from the reveal/refill stock)
  // — blocked if it doesn't match the bracket system registered for this patient, or if none is set yet
  if(hasBracketRothMention(text)){
    if(!file.bracketSystem){
      await alertModal('نوع البراكيت للعيان ده لسه مش محدد — حدده الأول (ROTH ولا MBT) من فوق اسم المريض، وبعدين اكتب النص تاني عشان الخصم يبقى صح.');
    } else if(file.bracketSystem !== 'roth'){
      await alertModal(`لأ، العيان ده متسجل بنوع براكيت ${bracketSystemLabel(file.bracketSystem)} مش ROTH. لو النوع غلط، غيّره الأول من فوق اسم المريض وبعدين اكتب النص تاني.`);
    } else {
      const key = 'bracket:roth';
      if(!matchedKeys.has(key)){
        const item = findBracketItemByType('roth');
        if(item) candidates.push({matchKey:key, kind:'bracket', item, label: item.name});
      }
    }
  }
  if(hasBracketMbtMention(text)){
    if(!file.bracketSystem){
      await alertModal('نوع البراكيت للعيان ده لسه مش محدد — حدده الأول (ROTH ولا MBT) من فوق اسم المريض، وبعدين اكتب النص تاني عشان الخصم يبقى صح.');
    } else if(file.bracketSystem !== 'mbt'){
      await alertModal(`لأ، العيان ده متسجل بنوع براكيت ${bracketSystemLabel(file.bracketSystem)} مش MBT. لو النوع غلط، غيّره الأول من فوق اسم المريض وبعدين اكتب النص تاني.`);
    } else {
      const key = 'bracket:mbt';
      if(!matchedKeys.has(key)){
        const item = findBracketItemByType('mbt');
        if(item) candidates.push({matchKey:key, kind:'bracket', item, label: item.name});
      }
    }
  }


  // rebonding / فص (tooth-linked) — anterior/premolar teeth (positions 1-5) still deduct from
  // reveal stock (ROTH/MBT) and log a break on the Bracket Map as before. Molars (positions 6/7/8)
  // don't have reveal/rebonding stock — "rebonding 16" or "rebonding 17" (capital, lowercase, with
  // or without a space — same keyword match as always) now deducts from whichever Tube item is
  // registered for that tooth instead, exactly like typing "tube 16"/"tube 17" would.
  let rebondBlockedNoBracketSystem = false;
  extractToothMentions(text).forEach(tooth=>{
    const isMolar = ['6','7','8'].includes(String(tooth).slice(-1));
    if(isMolar){
      const realFdi = internalFdiToRealFdi(tooth);
      const key = 'tube:' + realFdi;
      if(matchedKeys.has(key)) return;
      const item = findTubeItemByFDI(realFdi);
      if(item){ candidates.push({matchKey:key, kind:'tube', item, tooth:realFdi, label: `${item.name} (سن ${realFdiToPalmer(realFdi)})`}); matchedKeys.add(key); }
      return;
    }
    const key = 'rebond:' + tooth;
    if(matchedKeys.has(key)) return;
    if(!file.bracketSystem){ rebondBlockedNoBracketSystem = true; return; }
    const item = findRevealItemByTooth(tooth, file.bracketSystem);
    if(item) candidates.push({matchKey:key, kind:'rebond', item, tooth, label: `${item.name} (سن ${fdiToPalmer(tooth)}) — ${bracketSystemLabel(file.bracketSystem)}`});
  });

  if(rebondBlockedNoBracketSystem){
    await alertModal('في سن اتكتب معاه rebonding/فص بس نوع البراكيت للمريض ده لسه مش محدد (ROTH ولا MBT) — حدده الأول من فوق اسم المريض عشان الخصم يبقى من المخزن الصح، وبعدين اكتب النص تاني.');
  }

  // tube (tooth-linked, any tooth that has a registered Tube stock item) — "tube"/"تيوب" + tooth
  // number (real FDI like "17" or real Palmer like "UR7"), not limited to the 4 first-molar defaults
  extractTubeToothMentions(text).forEach(tooth=>{
    const key = 'tube:' + tooth;
    if(matchedKeys.has(key)) return;
    const item = findTubeItemByFDI(tooth);
    if(item){ candidates.push({matchKey:key, kind:'tube', item, tooth, label: `${item.name} (سن ${realFdiToPalmer(tooth)})`}); matchedKeys.add(key); }
  });

  if(!candidates.length) return;

  const msg = 'هيتخصم من المخزن تلقائي:\n' + candidates.map(c=>'- ' + c.label).join('\n') + '\n\nموافق؟';
  if(!(await confirmModal(msg))) return;

  const bm = ensureBracketMap(file);
  const stockAlerts = [];

  candidates.forEach(c=>{
    c.item.qty = Math.max(0, (parseFloat(c.item.qty)||0) - 1);
    const matUse = { id: uid(), itemId: c.item.id, itemName: c.item.name, qty: 1, matchKey: c.matchKey, source:'keyword' };
    if(isLowStockItem(c.item)) stockAlerts.push(c.item.name);

    if(c.kind === 'rebond'){
      const t = bm.teeth[c.tooth];
      if(t){
        const isFirstBreak = t.breaks.length === 0;
        const charged = !isFirstBreak;
        const breakId = uid();
        const today = e.date || todayStr();
        t.breaks.push({ id: breakId, date: today, charged });
        t.status = 'broken';
        // link this materials-used entry to the break record it created, so undoing either one
        // (from Monthly Follow-up or from Bracket Map) cleans up the other + the finance charge
        matUse.tooth = c.tooth;
        matUse.linkedBreakId = breakId;
        if(charged){
          if(!file.financeExtras) file.financeExtras = [];
          file.financeExtras.push({ id: breakId, amount: 300, reason: `ريبوندنج فص - سن ${fdiToPalmer(c.tooth)}`, date: today });
        }
      }
    }
    e.materialsUsed.push(matUse);
  });

  await saveInventory();
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast(stockAlerts.length ? `اتخصم من المخزن — ⚠ ${stockAlerts.join('، ')} وصل لحد الإنذار` : 'اتخصم من المخزن');
  render();
}

