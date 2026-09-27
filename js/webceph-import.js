// webceph-import.js — استيراد قياسات الـ Cephalometric من تقرير WebCeph (PDF) لشيت التشخيص.
//
// ليه مش API/ربط مباشر: WebCeph مبيعرضش نتايج التحليل عن طريق الـ API بتاعه، والتقرير نفسه PDF
// عبارة عن صور (مفيهوش نص ينفع يتقري بـ pdf.js). فالطريق العملي: ترفع PDF التقرير، Claude بيقرا عمود
// "Result" من صفحة Chart Analysis، وانت بتراجع الأرقام قبل ما تتكتب في الخانات (مفيش كتابة تلقائية
// من غير موافقتك).
//
// نفس أسلوب أداة orenda-diagnosis-import: النداء على Anthropic API بيتم من المتصفح بمفتاح انت
// بتحطه (متخزن على الجهاز ده بس في localStorage، مش في Supabase).
//
// ملاحظة خصوصية: صفحة الغلاف في تقرير WebCeph فيها اسم المريض، والـ PDF كله بيتبعت لـ Anthropic
// وقت الاستخراج. لو مش عايز كده، اطبع من WebCeph صفحة Chart Analysis بس كـ PDF.

// sheetLabel = اسم الخانة في قسم Cephalometric في شيت التشخيص (data-loading.js)
// webceph    = القياس المقابل ليه في تقرير WebCeph (للعرض في نافذة المراجعة وللبرومبت)
const WEBCEPH_FIELD_MAP = [
  { key: 'sna',        sheetLabel: 'SNA',              webceph: 'SNA' },
  { key: 'snb',        sheetLabel: 'SNB',              webceph: 'SNB' },
  { key: 'anb',        sheetLabel: 'ANB',              webceph: 'ANB' },
  { key: 'fma',        sheetLabel: 'FMA',              webceph: 'FMA' },
  { key: 'sn_man',     sheetLabel: 'SN-MAN',           webceph: 'SN-GoMe (SN-MP)' },
  { key: 'u1_sn',      sheetLabel: 'U1-SN',            webceph: 'U1 to SN' },
  { key: 'l1_man',     sheetLabel: 'L1-MAN',           webceph: 'L1 to mandibular plane angle (IMPA)' },
  { key: 'u1_l1',      sheetLabel: 'U1-L1',            webceph: 'Interincisal angle' },
  { key: 'nasolabial', sheetLabel: 'Nasolabial angle', webceph: 'Nasolabial angle' }
];
const WEBCEPH_API_KEY_STORAGE = 'orenda_anthropic_key';
const WEBCEPH_MODEL = 'claude-sonnet-5';

function getWebcephApiKey(){
  try{ return localStorage.getItem(WEBCEPH_API_KEY_STORAGE) || ''; }catch(e){ return ''; }
}
function setWebcephApiKey(k){
  try{
    if(k) localStorage.setItem(WEBCEPH_API_KEY_STORAGE, k);
    else localStorage.removeItem(WEBCEPH_API_KEY_STORAGE);
  }catch(e){ console.error('could not persist api key', e); }
}

// أي قيمة راجعة من الموديل -> رقم كسترينج ('83.3') أو '' لو مفيش رقم مقروء
function normalizeCephValue(v){
  if(v === null || v === undefined) return '';
  const m = String(v).replace(/,/g, '.').match(/-?\d+(?:\.\d+)?/);
  return m ? m[0] : '';
}

// بيقرا رد الموديل (JSON، ممكن يبقى جوه ```json fences أو حواليه كلام) ويرجّع {key: 'قيمة'} لكل مفتاح
// في WEBCEPH_FIELD_MAP (فاضي '' لو مش موجود)
function parseWebcephResponse(text){
  const raw = String(text || '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if(start === -1 || end <= start) throw new Error('رد غير مفهوم من الموديل (مفيش JSON)');
  const obj = JSON.parse(raw.slice(start, end + 1));
  const out = {};
  WEBCEPH_FIELD_MAP.forEach(f => { out[f.key] = normalizeCephValue(obj[f.key]); });
  return out;
}

// بيلاقي خانة بالاسم جوه قسم Cephalometric (في fields مباشرة أو جوه groups) — مقارنة بدون مراعاة
// حروف كبيرة/صغيرة أو مسافات زيادة، عشان لو غيّرت اسم خانة بمسافة ما تبوظش الاستيراد
function findCephField(file, label){
  const want = String(label).trim().toLowerCase();
  const sec = ((file && file.diagnosisSections) || []).find(s => (s.title || '').trim().toLowerCase() === 'cephalometric');
  if(!sec) return null;
  const hit = (fields, groupId) => {
    const f = (fields || []).find(x => (x.label || '').trim().toLowerCase() === want);
    return f ? { section: sec, groupId, field: f } : null;
  };
  return hit(sec.fields, null) || (sec.groups || []).map(g => hit(g.fields, g.id)).find(Boolean) || null;
}

// بيجهّز صفوف المراجعة: لكل قياس — القيمة المستخرجة، الخانة المقابلة في الشيت (لو موجودة)،
// والقيمة الحالية فيها. selected افتراضي = الخانة موجودة + فيه قيمة + (فاضية أو نفس القيمة) — مش
// بنكتب فوق رقم انت كاتبه بإيدك إلا لو اخترت ده صراحة.
function planWebcephApply(file, values){
  return WEBCEPH_FIELD_MAP.map(m => {
    const hit = findCephField(file, m.sheetLabel);
    const value = values[m.key] || '';
    const current = hit ? String(hit.field.value || '').trim() : '';
    return {
      key: m.key, sheetLabel: m.sheetLabel, webceph: m.webceph,
      value, current, found: !!hit,
      selected: !!hit && value !== '' && (current === '' || current === value)
    };
  });
}

// بيكتب الصفوف المختارة في الشيت (in-place) ويرجّع عدد اللي اتكتب
function applyWebcephRows(file, rows){
  let n = 0;
  rows.forEach(r => {
    if(!r.selected || !r.found) return;
    const value = normalizeCephValue(r.value);
    if(value === '') return;
    const hit = findCephField(file, r.sheetLabel);
    if(!hit) return;
    hit.field.value = value;
    if(typeof syncProblemListRow === 'function') syncProblemListRow(file, hit.section, hit.groupId, hit.field);
    n++;
  });
  return n;
}

function buildWebcephPrompt(){
  const list = WEBCEPH_FIELD_MAP.map(f => `- "${f.key}": ${f.webceph}`).join('\n');
  return `ده تقرير تحليل Cephalometric من WebCeph (صور PDF). اقرا عمود "Result" (مش Mean ولا S.D.) من صفحة "Chart Analysis" بالظبط للقياسات دي:\n${list}\n\n`
    + `قواعد:\n`
    + `- لو التحليل مسمّي نفس القياس باسم تاني (زي SN-MP أو SN-GoGn لـ SN-GoMe، أو IMPA / L1-MP لـ L1 to mandibular plane angle) استخدمه.\n`
    + `- "L1 to mandibular plane angle" بالدرجات؛ متلخبطهاش مع "L1 to mandibular plane" اللي بالمللي.\n`
    + `- الرقم فقط من غير وحدة أو علامات النجوم. لو القياس مش موجود أو مش مقروء بوضوح ارجع null، ومتخمّنش.\n`
    + `- ارجع JSON فقط بالمفاتيح دي بالظبط (بدون أي شرح أو markdown): ${WEBCEPH_FIELD_MAP.map(f => f.key).join(', ')}`;
}

async function extractWebcephValues(pdfBase64, apiKey){
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: WEBCEPH_MODEL,
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
          { type: 'text', text: buildWebcephPrompt() }
        ]
      }]
    })
  });
  if(!res.ok){
    let detail = '';
    try{ const j = await res.json(); detail = (j && j.error && j.error.message) || ''; }catch(e){ /* ignore */ }
    const err = new Error('API ' + res.status + (detail ? ' — ' + detail : ''));
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  return parseWebcephResponse(text);
}

function readFileAsBase64(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('مقدرتش أقرا الملف'));
    r.readAsDataURL(file);
  });
}

// ============ UI ============
function openWebcephImportModal(){
  const file = state.currentPatientFile;
  if(!file) return;
  if(!findCephField(file, 'SNA') && !findCephField(file, 'SNB')){
    alertModal('مش لاقي قسم "Cephalometric" بخاناته (SNA/SNB...) في شيت المريض ده.');
    return;
  }
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal" style="max-width:600px;width:95%;">
      <h3>📥 استيراد قياسات WebCeph</h3>
      <div id="wcBody"></div>
      <div class="modal-actions" id="wcActions"><button class="secondary" id="wcCloseBtn">إغلاق</button></div>
    </div>
  `;
  document.body.appendChild(bg);
  const body = bg.querySelector('#wcBody');
  const actions = bg.querySelector('#wcActions');
  const close = () => bg.remove();
  bg.querySelector('#wcCloseBtn').onclick = close;
  bg.onclick = (e) => { if(e.target === bg) close(); };

  function renderPick(errorMsg){
    const hasKey = !!getWebcephApiKey();
    body.innerHTML = `
      ${errorMsg ? `<div style="color:var(--red);font-size:13px;margin-bottom:10px;white-space:pre-line;">${escapeHtml(errorMsg)}</div>` : ''}
      <div class="field">
        <label>تقرير WebCeph (PDF)</label>
        <input type="file" id="wcFileInput" accept="application/pdf,.pdf">
      </div>
      <div class="field" style="margin-top:12px;">
        <label>مفتاح Anthropic API</label>
        ${hasKey
          ? `<div style="font-size:13px;">محفوظ على الجهاز ده ✓ <button class="secondary small" id="wcClearKeyBtn" style="margin-inline-start:8px;">مسح المفتاح</button></div>`
          : `<input type="password" id="wcKeyInput" placeholder="sk-ant-..." autocomplete="off" style="width:100%;">`}
      </div>
      <div class="placeholder" style="font-size:12px;text-align:right;margin-top:12px;">
        الـ PDF بيتبعت لـ Anthropic عشان يتقرا (صفحة الغلاف فيها اسم المريض). هتراجع الأرقام قبل ما تتكتب في الشيت.
      </div>
    `;
    actions.innerHTML = `<button class="secondary" id="wcCloseBtn2">إغلاق</button><button id="wcExtractBtn">استخراج القياسات</button>`;
    actions.querySelector('#wcCloseBtn2').onclick = close;
    const clr = body.querySelector('#wcClearKeyBtn');
    if(clr) clr.onclick = () => { setWebcephApiKey(''); renderPick(); };
    actions.querySelector('#wcExtractBtn').onclick = async () => {
      const f = body.querySelector('#wcFileInput').files[0];
      if(!f){ renderPick('اختار ملف PDF الأول'); return; }
      let key = getWebcephApiKey();
      if(!key){
        key = (body.querySelector('#wcKeyInput').value || '').trim();
        if(!key){ renderPick('اكتب مفتاح الـ API'); return; }
      }
      renderExtracting();
      try{
        const b64 = await readFileAsBase64(f);
        const values = await extractWebcephValues(b64, key);
        setWebcephApiKey(key); // بنحفظه بس بعد أول نداء ناجح
        renderReview(planWebcephApply(state.currentPatientFile, values));
      }catch(e){
        console.error('webceph extract failed', e);
        if(e && e.status === 401) setWebcephApiKey('');
        renderPick('فشل الاستخراج: ' + ((e && e.message) || 'خطأ غير معروف')
          + (e && e.status === 401 ? '\nالمفتاح مش صحيح — اكتبه تاني.' : ''));
      }
    };
  }

  function renderExtracting(){
    body.innerHTML = `<div class="placeholder" style="padding:24px;">بيقرا التقرير... (ممكن ياخد ثواني)</div>`;
    actions.innerHTML = '';
  }

  function renderReview(rows){
    body.innerHTML = `
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">راجع الأرقام مع التقرير — تقدر تعدّل أي رقم. الصفوف اللي فيها قيمة قديمة مختلفة مش متعلّمة تلقائي عشان متتكتبش فوقها بالغلط.</div>
      <table class="diag-table" style="min-width:0;">
        <thead><tr><th></th><th>الخانة</th><th>القياس في WebCeph</th><th>الجديد</th><th>الحالي</th></tr></thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr>
              <td><input type="checkbox" class="wc-sel" data-i="${i}" ${r.selected ? 'checked' : ''} ${r.found ? '' : 'disabled'}></td>
              <td>${escapeHtml(r.sheetLabel)}${r.found ? '' : ' <span style="color:var(--red);font-size:11px;">(الخانة مش موجودة)</span>'}</td>
              <td style="font-size:12px;color:var(--muted);">${escapeHtml(r.webceph)}</td>
              <td><input type="text" class="wc-val" data-i="${i}" value="${escapeHtml(r.value)}" style="width:70px;" ${r.found ? '' : 'disabled'}></td>
              <td style="font-size:12px;">${escapeHtml(r.current || '—')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    actions.innerHTML = `<button class="secondary" id="wcBackBtn">رجوع</button><button id="wcApplyBtn">تطبيق على الشيت</button>`;
    actions.querySelector('#wcBackBtn').onclick = () => renderPick();
    body.querySelectorAll('.wc-sel').forEach(el => { el.onchange = () => { rows[+el.dataset.i].selected = el.checked; }; });
    body.querySelectorAll('.wc-val').forEach(el => {
      el.oninput = () => {
        const r = rows[+el.dataset.i];
        r.value = el.value;
        const cb = body.querySelector(`.wc-sel[data-i="${el.dataset.i}"]`);
        if(cb && normalizeCephValue(el.value) !== '' && r.found){ r.selected = true; cb.checked = true; }
      };
    });
    actions.querySelector('#wcApplyBtn').onclick = async () => {
      const file = state.currentPatientFile;
      const n = applyWebcephRows(file, rows);
      if(!n){ toast('مفيش صفوف متعلّمة'); return; }
      await savePatientFile(state.currentPatientId, stripHelperFields(file));
      const summary = rows.filter(r => r.selected && r.found && normalizeCephValue(r.value) !== '').map(r => `${r.sheetLabel}=${normalizeCephValue(r.value)}`).join('، ');
      await logActivity('import_webceph', `استورد ${n} قياس من WebCeph لمريض ${patientNameForLog()} — ${summary}`);
      toast(`اتكتب ${n} قياس في شيت التشخيص`);
      close();
      render();
    };
  }

  renderPick();
}
