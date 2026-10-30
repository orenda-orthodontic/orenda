// appointment-reminders.js — تذكير المرضى بميعاد العيادة عن طريق واتساب.
// بيستخدم مواعيد العيادة المسجلة (visitSchedules: "تالت خميس"، "أول سبت"...) ويحسب أقرب ميعاد،
// وبيجهّز لكل مريض شغال عنده رقم موبايل رابط واتساب برسالة تأكيد جاهزة (فيها اسم العيادة واليوم
// والتاريخ ورقم العيادة). الضغط على "ابعت" بيفتح واتساب والرسالة مكتوبة — بتضغط إرسال بإيدك.
// ملحوظة: الرسالة بتتبعت من حساب الواتساب المفتوح على الجهاز ده (مش من رقم العيادة المسجل هنا).
// رقم العيادة بيتكتب جوه نص الرسالة عشان المريض يرد أو يكلمك عليه.
// علامة "اتبعت" بتتخزن على الجهاز ده بس (localStorage) وبتتمسح تلقائي بعد ما الميعاد يعدّي.

const REMINDER_SENT_KEY = 'orenda_reminders_sent_v1';

function loadRemindersSent(){
  try{
    const map = JSON.parse(localStorage.getItem(REMINDER_SENT_KEY) || '{}');
    const today = todayStr();
    Object.keys(map).forEach(k => { if((k.split('|')[1] || '') < today) delete map[k]; });
    return map;
  }catch(e){ return {}; }
}

function markReminderSent(clinicId, date, patientId){
  try{
    const map = loadRemindersSent();
    const k = clinicId + '|' + date;
    if(!map[k]) map[k] = [];
    if(!map[k].includes(patientId)) map[k].push(patientId);
    localStorage.setItem(REMINDER_SENT_KEY, JSON.stringify(map));
  }catch(e){ console.error('could not persist reminder-sent mark', e); }
}

function visitWeekdayLabelAr(date){
  return WEEKDAY_LABELS_AR[new Date(date + 'T00:00:00').getDay()] || '';
}

function buildAppointmentReminderMessage(patient, clinic, date){
  const lines = [
    `أهلاً ${patient.name} 👋`,
    `بنأكد معاد متابعتك في ${clinic.name}:`,
    `📅 ${visitWeekdayLabelAr(date)} ${formatDateAr(date)}`
  ];
  if(clinic.phone) lines.push(`لأي استفسار أو لو محتاج تغيّر الميعاد كلمنا على: ${clinic.phone}`);
  lines.push('في انتظارك 🙏');
  return lines.join('\n');
}

function openAppointmentRemindersModal(clinicId){
  const clinic = state.clinics.find(c => c.id === clinicId);
  if(!clinic) return;
  const visits = clinicUpcomingVisits(clinic);
  if(!visits.length){
    alertModal('مفيش مواعيد متسجلة للعيادة دي — ضيف الميعاد (زي "تالت خميس") من تعديل العيادة الأول.');
    return;
  }
  const active = state.patients.filter(p => ((state.clinicCaseStatus || {})[p.id] || 'active') !== 'debonded');
  const withPhone = active
    .filter(p => (p.phone || '').replace(/[^0-9]/g, ''))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const noPhoneCount = active.length - withPhone.length;

  let selectedDate = visits[0].date;
  let hideSent = false;
  let term = '';

  const optionsHtml = visits.map(v => {
    const when = v.daysUntil === 0 ? 'النهاردة' : ('بعد ' + v.daysUntil + ' يوم');
    return `<option value="${v.date}">${escapeHtml(scheduleLabelAr(v.schedule))} — ${escapeHtml(visitWeekdayLabelAr(v.date))} ${escapeHtml(formatDateAr(v.date))} (${when})</option>`;
  }).join('');

  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal" style="max-width:520px;width:95%;max-height:90vh;overflow-y:auto;">
      <h3>📲 تذكير مواعيد — ${escapeHtml(clinic.name)}</h3>
      ${clinic.phone ? '' : `<div class="placeholder" style="padding:8px;margin-bottom:10px;color:var(--red);">مفيش رقم واتساب مسجل للعيادة دي — الرسالة هتتبعت من غير رقم للتواصل. ضيفه من تعديل العيادة.</div>`}
      <div class="field">
        <label>الميعاد</label>
        <select id="remVisitSelect" style="width:100%;">${optionsHtml}</select>
      </div>
      <input type="text" id="remSearch" placeholder="بحث بالاسم أو الرقم..." style="width:100%;margin:10px 0 6px;">
      <label style="font-size:13px;display:flex;gap:6px;align-items:center;margin-bottom:6px;"><input type="checkbox" id="remHideSent"> إخفاء اللي اتبعتلهم</label>
      <div id="remCounter" style="font-size:12px;color:var(--muted);margin-bottom:6px;"></div>
      <div id="remList"></div>
      ${noPhoneCount ? `<div class="placeholder" style="padding:8px;margin-top:10px;font-size:12px;">${noPhoneCount} مريض شغال مالوش رقم موبايل مسجل — مش ظاهرين هنا.</div>` : ''}
      <div class="modal-actions">
        <button class="secondary" id="remCloseBtn">إغلاق</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);

  function renderList(){
    const sent = new Set(loadRemindersSent()[clinicId + '|' + selectedDate] || []);
    const sentCount = withPhone.filter(p => sent.has(p.id)).length;
    document.getElementById('remCounter').textContent = `${sentCount} من ${withPhone.length} اتبعتلهم على ${formatDateAr(selectedDate)}`;
    const t = term.trim().toLowerCase();
    let list = withPhone.filter(p => !t || p.name.toLowerCase().includes(t) || (p.number || '').includes(t));
    if(hideSent) list = list.filter(p => !sent.has(p.id));
    const listEl = document.getElementById('remList');
    if(!list.length){
      listEl.innerHTML = `<div class="placeholder" style="padding:12px;">${withPhone.length ? 'مفيش نتايج' : 'مفيش مرضى شغالين عندهم رقم موبايل في العيادة دي'}</div>`;
      return;
    }
    listEl.innerHTML = list.map(p => {
      const href = buildWhatsappLinkWithText(p.phone, buildAppointmentReminderMessage(p, clinic, selectedDate));
      const done = sent.has(p.id);
      return `
        <div class="row" style="justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);gap:8px;">
          <div>
            <div style="font-weight:600;">${escapeHtml(p.name)}</div>
            <div style="font-size:12px;color:var(--muted);">${escapeHtml(p.phone)}</div>
          </div>
          <a class="wa-btn small rem-send" data-pid="${escapeHtml(p.id)}" href="${escapeHtml(href)}" target="_blank" rel="noopener">${done ? '✓ اتبعت — ابعت تاني' : '💬 ابعت'}</a>
        </div>
      `;
    }).join('');
    listEl.querySelectorAll('.rem-send').forEach(a => {
      a.onclick = () => {
        markReminderSent(clinicId, selectedDate, a.dataset.pid);
        setTimeout(renderList, 400); // بعد ما الرابط يتفتح
      };
    });
  }

  document.getElementById('remVisitSelect').onchange = (e) => { selectedDate = e.target.value; renderList(); };
  document.getElementById('remSearch').oninput = (e) => { term = e.target.value; renderList(); };
  document.getElementById('remHideSent').onchange = (e) => { hideSent = e.target.checked; renderList(); };
  const close = () => bg.remove();
  document.getElementById('remCloseBtn').onclick = close;
  bg.onclick = (e) => { if(e.target === bg) close(); };
  renderList();
}
