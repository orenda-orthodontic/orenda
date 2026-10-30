// clinic-adjustments.js — بنود تعديل إجمالي العيادة الشهري (كشوفات، فلوس مثبتات، أي مبلغ مش داخل
// في دفعات المرضى). بتتخزن على العيادة نفسها بنفس أسلوب فلوس السكرتيرة (clinic.secretaryFees):
//   clinic.monthAdjustments = { 'YYYY-MM': [{ id, label, amountCents, myPct }] }
// - amountCents: المبلغ بالقروش (موجب أو سالب)
// - myPct: نسبتك من البند ده (0–100). بتتثبّت وقت إضافة البند (الافتراضي نسبة العيادة العادية)،
//   فلو غيّرت نسبة العيادة بعدين البنود القديمة ما تتغيرش.
// الإجمالي الجديد = دفعات المرضى + البنود. نصيبك = نصيبك من الدفعات + نصيبك من البنود، ونصيب العيادة
// = الإجمالي − نصيبك (نفس قاعدة التقريب: مرة لكل بند، من غير ما قرش يضيع أو يتزود).
// الحفظ على مفتاح 'clinics' (محمي من التعارض بين الأجهزة زي باقي بيانات العيادة).
// الملف ده بيتحمّل بعد money-utils.js وقبل clinic-features.js و month-closing.js.

function clinicDefaultPct(clinic){
  return clinic ? (parseFloat(clinic.commission) || 70) : 70;
}

function clinicAdjustmentsList(clinic, month){
  const all = clinic && clinic.monthAdjustments;
  const list = all && all[month];
  return Array.isArray(list) ? list.filter(x => x && typeof x === 'object') : [];
}

// نصيبك/نصيب العيادة لبند واحد
function clinicAdjustmentShares(item, defaultPct){
  const totalCents = parseInt(item && item.amountCents, 10) || 0;
  const raw = item ? parseFloat(item.myPct) : NaN;
  const pct = isNaN(raw) ? defaultPct : Math.min(100, Math.max(0, raw));
  const myShareCents = Math.round(totalCents * pct / 100);
  return { totalCents, pct, myShareCents, clinicShareCents: totalCents - myShareCents };
}

// مجموع بنود شهر لعيادة (نقية — من غير شبكة)
function clinicAdjustmentsTotals(clinic, month){
  const def = clinicDefaultPct(clinic);
  const items = clinicAdjustmentsList(clinic, month).map(it => {
    const s = clinicAdjustmentShares(it, def);
    return { id: it.id, label: String(it.label || ''), totalCents: s.totalCents, pct: s.pct, myShareCents: s.myShareCents, clinicShareCents: s.clinicShareCents };
  });
  let totalCents = 0, myShareCents = 0;
  items.forEach(i => { totalCents += i.totalCents; myShareCents += i.myShareCents; });
  return { items, totalCents, myShareCents, clinicShareCents: totalCents - myShareCents };
}

// ---------- واجهة ----------
// نافذة إدارة بنود شهر لعيادة: إضافة / تعديل / حذف. onClose بيتنادى لما النافذة تتقفل (عشان الشاشة
// اللي فتحتها تعيد حساب أرقامها).
function openClinicAdjustmentsModal(clinicId, month, onClose){
  if(!(state.clinics || []).find(c => c.id === clinicId)) return;
  const getClinic = () => (state.clinics || []).find(c => c.id === clinicId);
  let editingId = null;

  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal" style="max-width:520px;width:96%;max-height:92vh;overflow-y:auto;">
      <h3 id="adjTitle"></h3>
      <div class="placeholder" style="font-size:12px;text-align:right;padding:8px;margin-bottom:10px;">
        بنود زيادة (أو خصم بعلامة −) على إجمالي العيادة للشهر ده — زي الكشوفات أو فلوس المثبتات. تقدر تحدد نسبتك من كل بند.
      </div>
      <div id="adjList"></div>
      <div style="border-top:1px solid var(--border);margin-top:12px;padding-top:12px;">
        <div id="adjFormTitle" style="font-weight:700;font-size:13px;margin-bottom:8px;"></div>
        <div class="field"><label>الوصف</label><input type="text" id="adjLabel" placeholder="مثلًا: كشوفات / مثبتات" style="width:100%;"></div>
        <div class="row" style="gap:10px;margin-top:8px;flex-wrap:wrap;">
          <div class="field" style="flex:1;min-width:130px;"><label>المبلغ بالجنيه (سالب = خصم)</label><input type="number" step="0.01" id="adjAmount" style="width:100%;"></div>
          <div class="field" style="flex:1;min-width:110px;"><label>نسبتك %</label><input type="number" min="0" max="100" step="any" id="adjPct" style="width:100%;"></div>
        </div>
        <div class="row" style="gap:8px;margin-top:10px;">
          <button type="button" id="adjSaveBtn"></button>
          <button type="button" class="secondary" id="adjCancelEditBtn" style="display:none;">إلغاء التعديل</button>
        </div>
      </div>
      <div class="modal-actions"><button class="secondary" id="adjCloseBtn">إغلاق</button></div>
    </div>
  `;
  document.body.appendChild(bg);
  const $ = (id) => bg.querySelector('#' + id);

  function resetForm(){
    editingId = null;
    $('adjLabel').value = '';
    $('adjAmount').value = '';
    $('adjPct').value = String(clinicDefaultPct(getClinic()));
    $('adjFormTitle').textContent = '+ بند جديد';
    $('adjSaveBtn').textContent = 'إضافة البند';
    $('adjCancelEditBtn').style.display = 'none';
  }

  function renderList(){
    const c = getClinic();
    $('adjTitle').textContent = '± تعديل إجمالي ' + (c ? c.name : '') + ' — ' + monthLabelAr(month);
    const t = clinicAdjustmentsTotals(c, month);
    const listEl = $('adjList');
    if(!t.items.length){
      listEl.innerHTML = '<div class="placeholder" style="padding:10px;">مفيش بنود للشهر ده</div>';
      return;
    }
    listEl.innerHTML = `
      <table class="diag-table" style="min-width:0;">
        <thead><tr><th>الوصف</th><th>المبلغ</th><th>نسبتك</th><th>نصيبك</th><th>العيادة</th><th></th></tr></thead>
        <tbody>
          ${t.items.map(i => `
            <tr>
              <td>${escapeHtml(i.label || '—')}</td>
              <td>${formatEgpFromCents(i.totalCents)}</td>
              <td>${i.pct}%</td>
              <td>${formatEgpFromCents(i.myShareCents)}</td>
              <td>${formatEgpFromCents(i.clinicShareCents)}</td>
              <td style="white-space:nowrap;">
                <button type="button" class="secondary small adj-edit" data-id="${escapeHtml(String(i.id))}">✏</button>
                <button type="button" class="secondary small adj-del" data-id="${escapeHtml(String(i.id))}">🗑</button>
              </td>
            </tr>`).join('')}
        </tbody>
        <tfoot><tr><td><b>الإجمالي</b></td><td><b>${formatEgpFromCents(t.totalCents)}</b></td><td></td><td><b>${formatEgpFromCents(t.myShareCents)}</b></td><td><b>${formatEgpFromCents(t.clinicShareCents)}</b></td><td></td></tr></tfoot>
      </table>`;
    listEl.querySelectorAll('.adj-edit').forEach(b => { b.onclick = () => startEdit(b.dataset.id); });
    listEl.querySelectorAll('.adj-del').forEach(b => { b.onclick = () => removeItem(b.dataset.id); });
  }

  function startEdit(id){
    const it = clinicAdjustmentsList(getClinic(), month).find(x => String(x.id) === String(id));
    if(!it) return;
    editingId = it.id;
    $('adjLabel').value = it.label || '';
    $('adjAmount').value = String(centsToEgp(it.amountCents));
    const sh = clinicAdjustmentShares(it, clinicDefaultPct(getClinic()));
    $('adjPct').value = String(sh.pct);
    $('adjFormTitle').textContent = '✏ تعديل بند';
    $('adjSaveBtn').textContent = 'حفظ التعديل';
    $('adjCancelEditBtn').style.display = '';
  }

  // نفس نمط فلوس السكرتيرة: بنعدّل نسخة العيادة في الـ state وبعدين setData على 'clinics' — لو
  // رجعت false (تعارض مع جهاز تاني / أوفلاين) setData نفسه بيعرض الرسالة المناسبة وبنعيد رسم القايمة
  // من آخر نسخة في الـ state.
  async function persist(mutator, logText){
    const c = getClinic();
    if(!c) return false;
    if(!c.monthAdjustments) c.monthAdjustments = {};
    const cur = Array.isArray(c.monthAdjustments[month]) ? c.monthAdjustments[month] : [];
    const next = mutator(cur.slice());
    if(next.length) c.monthAdjustments[month] = next; else delete c.monthAdjustments[month];
    const ok = await setData('clinics', state.clinics);
    if(!ok){ renderList(); return false; }
    await logActivity('clinic_adjustment', logText);
    renderList();
    return true;
  }

  async function saveForm(){
    const label = $('adjLabel').value.trim();
    const rawAmount = $('adjAmount').value;
    const cents = egpToCents(rawAmount);
    if(!label){ toast('اكتب وصف للبند'); return; }
    if(rawAmount === '' || isNaN(parseFloat(rawAmount)) || cents === 0){ toast('اكتب مبلغ صحيح (مش صفر)'); return; }
    const pctRaw = parseFloat($('adjPct').value);
    if(isNaN(pctRaw) || pctRaw < 0 || pctRaw > 100){ toast('نسبتك لازم تكون من 0 لـ 100'); return; }
    const c = getClinic();
    const amountTxt = formatEgpFromCents(cents) + ' جنيه (نسبتك ' + pctRaw + '%)';
    const where = (c ? c.name : '') + ' — ' + monthLabelAr(month);
    let ok;
    if(editingId){
      const id = editingId;
      ok = await persist(list => list.map(x => String(x.id) === String(id) ? Object.assign({}, x, { label, amountCents: cents, myPct: pctRaw }) : x),
        `عدّل بند تعديل — ${where}: ${label} ${amountTxt}`);
    } else {
      ok = await persist(list => list.concat([{ id: uid(), label, amountCents: cents, myPct: pctRaw }]),
        `أضاف بند تعديل — ${where}: ${label} ${amountTxt}`);
    }
    if(ok){ toast('اتحفظ البند'); resetForm(); }
  }

  async function removeItem(id){
    const it = clinicAdjustmentsList(getClinic(), month).find(x => String(x.id) === String(id));
    if(!it) return;
    if(!(await confirmModal('حذف البند "' + (it.label || '') + '"؟', { danger: true, confirmLabel: 'احذف' }))) return;
    const c = getClinic();
    const ok = await persist(list => list.filter(x => String(x.id) !== String(id)),
      `حذف بند تعديل — ${(c ? c.name : '')} — ${monthLabelAr(month)}: ${it.label || ''} ${formatEgpFromCents(parseInt(it.amountCents, 10) || 0)} جنيه`);
    if(ok){ toast('اتحذف البند'); if(editingId && String(editingId) === String(id)) resetForm(); }
  }

  const close = () => { bg.remove(); if(typeof onClose === 'function') onClose(); };
  $('adjSaveBtn').onclick = () => saveForm();
  $('adjCancelEditBtn').onclick = () => resetForm();
  $('adjCloseBtn').onclick = close;
  bg.onclick = (e) => { if(e.target === bg) close(); };
  resetForm();
  renderList();
}
