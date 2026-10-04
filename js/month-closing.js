// month-closing.js — تقفيل الشهر: لكل عيادة ولمجموع كل العيادات. بيجمع كل الدفعات اللي تاريخها
// في الشهر المختار (كل المرضى، شغالين وأرشيف)، ويقسمها بنفس قاعدة النسبة المستخدمة في باقي النظام:
//   - نسبتك في العيادة = clinic.commission (الافتراضي 70%)
//   - "حالة الدكتور" (file.clinicHasShare === false) = 100% ليك، من غير نسبة للعيادة
//   - التقريب مرة لكل دفعة (Math.round على القروش)، ونصيب العيادة = المحصّل − نصيبك، فمفيش قرش
//     بيضيع أو بيتزود.
// بيتعرض كتقرير "تقفيل الشهر" جوه شاشة التقارير (reports-view.js)، وفيه طباعة لكل عيادة وللكل،
// ونسخ ملخص نصي. الأرقام بتتحسب حيّة من الدفعات المسجلة (مش لقطة ثابتة) — لو عدّلت دفعة قديمة
// بعد الطباعة، التقفيل هيتغير.

// نفس اتفاقية باقي النظام: قيمة العمولة الفاضية/صفر بترجع للافتراضي 70
function monthClosingClinicPct(clinic){
  return clinic ? (parseFloat(clinic.commission) || 70) : 70;
}

// نقية (من غير شبكة) عشان تتختبر: clinicsData = [{clinic, files:[{patient, file}], error?}]
function computeMonthClosingFromData(clinicsData, month){
  const clinics = (clinicsData || []).map(({ clinic, files, error }) => {
    const pct = monthClosingClinicPct(clinic);
    const patients = [];
    let collectedCents = 0, myShareCents = 0, ownCollectedCents = 0;
    (files || []).forEach(({ patient, file }) => {
      if(!file) return;
      const ownCase = file.clinicHasShare === false;
      const patientPct = ownCase ? 100 : pct;
      let pc = 0, pm = 0, n = 0;
      (file.payments || []).forEach(pay => {
        if((pay.date || '').slice(0, 7) !== month) return;
        const c = readAmountCents(pay);
        pc += c;
        pm += Math.round(c * patientPct / 100);
        n++;
      });
      if(!n) return;
      patients.push({
        patientId: patient.id, name: patient.name || '', number: patient.number || '',
        collectedCents: pc, myShareCents: pm, clinicShareCents: pc - pm,
        paymentsCount: n, ownCase, archived: (file.caseStatus || 'active') === 'debonded'
      });
      collectedCents += pc;
      myShareCents += pm;
      if(ownCase) ownCollectedCents += pc;
    });
    patients.sort((a, b) => b.collectedCents - a.collectedCents);
    return {
      clinicId: clinic.id, clinicName: clinic.name || '', pct,
      collectedCents, myShareCents, clinicShareCents: collectedCents - myShareCents,
      ownCollectedCents, patients, loadFailed: !!error
    };
  });
  const totalCollectedCents = clinics.reduce((s, c) => s + c.collectedCents, 0);
  const totalMyShareCents = clinics.reduce((s, c) => s + c.myShareCents, 0);
  return {
    month, clinics,
    totalCollectedCents, totalMyShareCents,
    totalClinicShareCents: totalCollectedCents - totalMyShareCents,
    effectivePct: totalCollectedCents ? Math.round(totalMyShareCents * 1000 / totalCollectedCents) / 10 : 0
  };
}

async function computeMonthClosing(month){
  const clinicsData = await Promise.all((state.clinics || []).map(async c => {
    try{
      const patients = await getData('patients:' + c.id, []);
      const files = patients.length ? await batchLoadPatientFiles(patients) : [];
      return { clinic: c, files };
    }catch(e){
      console.error('month closing: clinic load failed', c.id, e);
      return { clinic: c, files: [], error: true };
    }
  }));
  return computeMonthClosingFromData(clinicsData, month);
}

// ---------- عرض ----------
function mcEgp(cents){ return formatEgpFromCents(cents) + ' جنيه'; }
function mcPct(p){ return (Math.round(p * 10) / 10) + '%'; }

function buildMonthClosingHtml(data){
  const label = monthLabelAr(data.month);
  const failed = data.clinics.filter(c => c.loadFailed);
  const warn = failed.length ? `
    <div class="card"><div style="color:var(--red);font-size:13px;">⚠ تعذر تحميل بيانات: ${failed.map(c => escapeHtml(c.clinicName)).join('، ')} — أرقامها هنا ناقصة، اضغط تغيير الشهر أو أعد فتح التقارير للمحاولة تاني.</div></div>` : '';

  if(!data.clinics.length){
    return `<div class="card"><div class="placeholder">مفيش عيادات مسجلة.</div></div>`;
  }
  if(!data.totalCollectedCents){
    return `${warn}<div class="card"><div class="placeholder">مفيش دفعات مسجلة في ${escapeHtml(label)}.</div></div>`;
  }

  const rows = data.clinics.map(c => `
    <tr>
      <td>${escapeHtml(c.clinicName)}</td>
      <td>${mcPct(c.pct)}</td>
      <td>${mcEgp(c.collectedCents)}</td>
      <td>${mcEgp(c.clinicShareCents)}</td>
      <td><b>${mcEgp(c.myShareCents)}</b></td>
    </tr>`).join('');

  const details = data.clinics.filter(c => c.patients.length).map(c => `
    <details class="card" style="margin-top:10px;">
      <summary style="cursor:pointer;font-weight:700;">${escapeHtml(c.clinicName)} — المحصّل ${mcEgp(c.collectedCents)} — العيادة ${mcEgp(c.clinicShareCents)} — نصيبي ${mcEgp(c.myShareCents)}</summary>
      <div class="finance-tables" style="margin-top:8px;">
        <table>
          <thead><tr><th>المريض</th><th>دفعات</th><th>المحصّل</th><th>العيادة</th><th>نصيبي</th></tr></thead>
          <tbody>
            ${c.patients.map(p => `
              <tr>
                <td>${escapeHtml(p.name)}${p.ownCase ? ' <span style="font-size:11px;color:var(--muted);">(حالة الدكتور — 100%)</span>' : ''}${p.archived ? ' <span style="font-size:11px;color:var(--muted);">(أرشيف)</span>' : ''}</td>
                <td>${p.paymentsCount}</td>
                <td>${mcEgp(p.collectedCents)}</td>
                <td>${mcEgp(p.clinicShareCents)}</td>
                <td>${mcEgp(p.myShareCents)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <button class="secondary small mc-print-clinic" data-clinic-id="${escapeHtml(c.clinicId)}" style="margin-top:8px;">🖨️ كشف ${escapeHtml(c.clinicName)}</button>
    </details>`).join('');

  return `
    ${warn}
    <div class="card">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div class="section-title" style="margin:0;">🧾 تقفيل ${escapeHtml(label)} — كل العيادات</div>
        <div class="row" style="gap:8px;">
          <button class="secondary small" id="mcCopyBtn">📋 نسخ الملخص</button>
          <button class="secondary small" id="mcPrintAllBtn">🖨️ طباعة الكل</button>
        </div>
      </div>
      <div class="bracket-summary" style="margin-top:12px;">
        <div class="bracket-stat"><div class="num">${formatEgpFromCents(data.totalCollectedCents)}</div><div class="lbl">إجمالي المحصّل</div></div>
        <div class="bracket-stat"><div class="num">${formatEgpFromCents(data.totalClinicShareCents)}</div><div class="lbl">اللي العيادات أخدته</div></div>
        <div class="bracket-stat"><div class="num">${formatEgpFromCents(data.totalMyShareCents)}</div><div class="lbl">نصيبي (${mcPct(data.effectivePct)})</div></div>
      </div>
      <div class="finance-tables" style="margin-top:12px;">
        <table>
          <thead><tr><th>العيادة</th><th>نسبتي</th><th>المحصّل</th><th>العيادة أخدت</th><th>نصيبي</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td><b>الإجمالي</b></td><td>${mcPct(data.effectivePct)}</td><td><b>${mcEgp(data.totalCollectedCents)}</b></td><td><b>${mcEgp(data.totalClinicShareCents)}</b></td><td><b>${mcEgp(data.totalMyShareCents)}</b></td></tr></tfoot>
        </table>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:8px;">بيتحسب من الدفعات اللي تاريخها في الشهر ده. "نسبتي" في الإجمالي هي النسبة الفعلية بعد حالات الدكتور (اللي ليك فيها 100%).</div>
    </div>
    ${details}
  `;
}

function monthClosingSummaryText(data){
  const lines = [`تقفيل ${monthLabelAr(data.month)}`];
  data.clinics.filter(c => c.collectedCents).forEach(c => {
    lines.push(`${c.clinicName}: المحصّل ${formatEgpFromCents(c.collectedCents)} — العيادة أخدت ${formatEgpFromCents(c.clinicShareCents)} — نصيبي ${formatEgpFromCents(c.myShareCents)}`);
  });
  lines.push(`الإجمالي: المحصّل ${formatEgpFromCents(data.totalCollectedCents)} — العيادات أخدت ${formatEgpFromCents(data.totalClinicShareCents)} — نصيبي ${formatEgpFromCents(data.totalMyShareCents)} (${mcPct(data.effectivePct)})`);
  return lines.join('\n');
}

function printMonthClosing(clinicId){
  const data = state.monthClosingData;
  if(!data) return;
  const label = monthLabelAr(data.month);
  const doctor = escapeHtml(state.doctorName || '');
  let title, bodyHtml;
  if(clinicId){
    const c = data.clinics.find(x => x.clinicId === clinicId);
    if(!c) return;
    title = `كشف تقفيل ${escapeHtml(label)} — ${escapeHtml(c.clinicName)}`;
    bodyHtml = `
      <table>
        <thead><tr><th>المريض</th><th>عدد الدفعات</th><th>المحصّل</th><th>نصيب العيادة</th><th>نصيب الدكتور</th></tr></thead>
        <tbody>${c.patients.map(p => `<tr><td>${escapeHtml(p.name)}${p.ownCase ? ' (حالة الدكتور)' : ''}</td><td>${p.paymentsCount}</td><td>${mcEgp(p.collectedCents)}</td><td>${mcEgp(p.clinicShareCents)}</td><td>${mcEgp(p.myShareCents)}</td></tr>`).join('') || '<tr><td colspan="5">لا توجد دفعات</td></tr>'}</tbody>
      </table>
      <div class="totals">
        <div><b>إجمالي المحصّل:</b> ${mcEgp(c.collectedCents)}</div>
        <div><b>نصيب العيادة:</b> ${mcEgp(c.clinicShareCents)}</div>
        <div><b>نصيب الدكتور:</b> ${mcEgp(c.myShareCents)}</div>
      </div>`;
  } else {
    title = `تقفيل ${escapeHtml(label)} — كل العيادات`;
    bodyHtml = `
      <table>
        <thead><tr><th>العيادة</th><th>النسبة</th><th>المحصّل</th><th>العيادة أخدت</th><th>نصيب الدكتور</th></tr></thead>
        <tbody>${data.clinics.map(c => `<tr><td>${escapeHtml(c.clinicName)}</td><td>${mcPct(c.pct)}</td><td>${mcEgp(c.collectedCents)}</td><td>${mcEgp(c.clinicShareCents)}</td><td>${mcEgp(c.myShareCents)}</td></tr>`).join('')}</tbody>
      </table>
      <div class="totals">
        <div><b>إجمالي المحصّل:</b> ${mcEgp(data.totalCollectedCents)}</div>
        <div><b>اللي العيادات أخدته:</b> ${mcEgp(data.totalClinicShareCents)}</div>
        <div><b>نصيب الدكتور:</b> ${mcEgp(data.totalMyShareCents)} (${mcPct(data.effectivePct)})</div>
      </div>`;
  }
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>${title}</title>
    <style>
      body{font-family:Tahoma,Arial,sans-serif;padding:24px;color:#222;}
      h1{font-size:20px;margin-bottom:4px;}
      .meta{color:#555;font-size:13px;margin-bottom:18px;}
      table{width:100%;border-collapse:collapse;margin-bottom:20px;}
      th,td{border:1px solid #ccc;padding:6px 10px;text-align:right;font-size:13px;}
      th{background:#f4f4f4;}
      .totals{margin-top:10px;font-size:14px;}
      .totals div{margin-bottom:4px;}
      .totals b{display:inline-block;min-width:160px;}
      @media print{ button{display:none;} }
    </style></head><body>
      <h1>${title}</h1>
      <div class="meta">${doctor ? 'د. ' + doctor + ' | ' : ''}تاريخ الطباعة: ${formatDateAr(todayStr())}</div>
      ${bodyHtml}
      <button onclick="window.print()" style="margin-top:20px;padding:8px 16px;">طباعة / حفظ PDF</button>
    </body></html>`;
  const w = window.open('', '_blank');
  if(!w){ toast('المتصفح منع نافذة الطباعة — اسمح بالنوافذ المنبثقة للموقع'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

async function copyMonthClosingSummary(){
  const data = state.monthClosingData;
  if(!data) return;
  const text = monthClosingSummaryText(data);
  try{
    await navigator.clipboard.writeText(text);
    toast('اتنسخ ملخص التقفيل');
  }catch(e){
    // fallback للمتصفحات/الاتصالات اللي مش بتدّي صلاحية الـ clipboard
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); toast('اتنسخ ملخص التقفيل'); }
    catch(err){ toast('تعذر النسخ'); }
    ta.remove();
  }
}

function attachMonthClosingHandlers(){
  const allBtn = document.getElementById('mcPrintAllBtn');
  if(allBtn) allBtn.onclick = () => printMonthClosing(null);
  const copyBtn = document.getElementById('mcCopyBtn');
  if(copyBtn) copyBtn.onclick = () => copyMonthClosingSummary();
  document.querySelectorAll('.mc-print-clinic').forEach(b => {
    b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); printMonthClosing(b.dataset.clinicId); };
  });
}
