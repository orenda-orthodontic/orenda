// money-utils.js — تحويل الفلوس لـ integer cents (قروش) في التخزين (P0-5).
//
// ليه cents أصلاً: تخزين الفلوس كـ float (parseFloat) بيتسبب في أخطاء تقريب صغيرة بتتجمع مع
// كتر العمليات (جمع/طرح دفعات ورسوم على مدار سنين) — 0.1 + 0.2 !== 0.3 بالظبط في IEEE754.
// تخزين كعدد صحيح من القروش (قرش = 1/100 جنيه) بيقفل الباب على المشكلة دي تمامًا: كل الجمع/
// الطرح بيتم بأعداد صحيحة، والتقريب لجنيهات بيحصل مرة واحدة بس لحظة العرض للمستخدم.
//
// "gradual" — الحقل الجديد amountCents/financeTotalCents/financeRemainingCents هو المصدر
// المعتمد من هنا، لكن الحقل القديم (amount/financeTotal/financeRemaining كـ EGP float) بيفضل
// متزامن جنبه (dual-write) في كل مكان بيتحفظ فيه. كده أي ملف تاني في النظام (clinic-features.js
// اللي بيحسب clinicSummaryTotal/clinicSummaryYourShare، patients-view.js، reports-view.js،
// case-tracker) بيفضل شغال زي الأول من غير أي كسر، لحد ما يتحدث برضه يقرا من *Cents مباشرة —
// وقتها تقدر تشيل الحقل القديم.

// EGP (أي رقم/سترينج جاي من input) -> قروش integer. Math.round بعد الضرب في 100 عشان نتجنب
// أخطاء تقريب الـ float نفسها لحظة التحويل (19.99 * 100 ممكن تطلع 1998.9999999999998 من غير round)
function egpToCents(egp){
  return Math.round((parseFloat(egp) || 0) * 100);
}
// قروش -> جنيه (float عادي، للعرض/للحفظ في الحقل القديم)
function centsToEgp(cents){
  return (parseInt(cents, 10) || 0) / 100;
}
// للعرض في الواجهة — دايمًا رقمين بعد العلامة العشرية، مع فواصل الآلاف
function formatEgpFromCents(cents){
  return centsToEgp(cents).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// بيرجع قيمة القروش الصحيحة لأي record فيه amountCents (المصدر الجديد) أو amount (القديم EGP
// float) بس — بيفضّل amountCents لو موجود، وبيرجع للحساب من amount لو مش موجود (ملفات قديمة
// قبل الترحيل، أو لسه متكتوبة من كود تاني ما استخدمش الحقل الجديد).
function readAmountCents(record){
  if(!record) return 0;
  if(record.amountCents !== undefined && record.amountCents !== null) return parseInt(record.amountCents, 10) || 0;
  return egpToCents(record.amount);
}

// بيكتب الحقلين مع بعض على أي record (دفعة/رسوم إضافية) — cents هو المعتمد، و amount (EGP)
// بيفضل متزامن جنبه للتوافق الخلفي. egpValue أي رقم/سترينج جاي من input المستخدم بالجنيه.
function writeAmountFields(record, egpValue){
  const cents = egpToCents(egpValue);
  record.amountCents = cents;
  record.amount = centsToEgp(cents);
  return record;
}
