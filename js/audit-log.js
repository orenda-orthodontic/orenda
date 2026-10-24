// audit-log.js — بقى مجرد واجهة فوق "سجل العمليات" الوحيد (logActivity في storage.js، جدول
// activity_log على Supabase، بيتفتح من ⚙ أدوات ← سجل العمليات). كان فيه سجلين منفصلين
// (activity_log + auditlog:<شهر> في kv_store) والتاني مكانش ليه شاشة عرض أصلًا — دلوقتي كله في
// مكان واحد. الاسم logAuditEvent فضل زي ما هو عشان backup.js و inventory-deduct.js يفضلوا شغالين
// من غير أي تعديل. الاستدعاء دايمًا fire-and-forget: فشل التسجيل ما يوقفش العملية الأصلية.
//
// ملحوظة: أي سجلات قديمة اتكتبت تحت مفاتيح auditlog:<YYYY-MM> قبل الدمج لسه موجودة في
// kv_store بس مفيش شاشة بتعرضها — لو مش محتاجها تقدر تمسحها من Supabase.
//
// استخدام: await logAuditEvent('backup_import', { importedKeys, failedKeys, ... });

async function logAuditEvent(action, details){
  try{
    let text = '';
    if(details && Object.keys(details).length){
      try{ text = JSON.stringify(details); }catch(e){ text = String(details); }
      if(text.length > 600) text = text.slice(0, 600) + '…';
    }
    await logActivity(action, text ? action + ' — ' + text : action);
  }catch(e){
    console.error('audit log failed', action, e);
  }
}
