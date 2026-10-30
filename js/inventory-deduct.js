// inventory-deduct.js — خصم موحّد من المخزون (P0-4). بيحل مشكلة إن أي حتة في الكود كانت بتعمل
// item.qty = Math.max(0, (parseFloat(item.qty)||0) - 1) — الكمية كانت بتنزل صفر بصمت من غير ما
// حد يعرف إن الخصمة الحقيقية "ضاعت" (اتسجل استخدام مادة مع إن المخزون مكنش فيه أصلاً).
//
// البديل هنا: تحقق من التوفر الأول لكل الأصناف المطلوبة في العملية (bonding, wire/elastics,
// ...) دفعة واحدة (all-or-nothing) — لو صنف واحد ناقص، مفيش حاجة بتتخصم خالص، بيظهر تنبيه واضح
// بالاسم والكمية الناقصة، وبيتسجل في سجل التدقيق (audit-log.js) بدل ما يتخفي.
//
// كل مكان في الكود كان بيعمل `item.qty = Math.max(0, ...)` لازم يستبدلها باستدعاء
// validateAndDeductBatch([{item, qty, label}, ...]) قبل ما يعمل saveInventory().
//
// ما أُضيف بعد مراجعة مسارات الخصم/الإرجاع كلها:
//  1) نفس الصنف ممكن يتكرر في نفس العملية (واير فوق وتحت من نفس الصنف، نفس الإيلاستيك مرتين...):
//     التحقق بقى على المجموع المطلوب من كل صنف، مش على كل سطر لوحده — كان ممكن كمية 1 تتخصم
//     مرتين وتنزل -1.
//  2) saveInventoryOutcome: بيفرّق بين "اتحفظ" و"اتحفظ على الجهاز (أوفلاين) وهيتبعت بعدين" و"اتلغى
//     بسبب تعارض". قبل كده الأوفلاين كان بيتعامل كأنه فشل: العملية بتقف بعد ما التعديل اتحط في
//     طابور الإرسال، فالمخزن بيتخصم بعدين من غير أي سجل استخدام (وبعد إعادة المحاولة يتخصم مرتين).
//  3) undoDeductBatch / creditBatch + savePatientFileAfterStockChange: لو حفظ ملف المريض اتلغى
//     بتعارض بعد ما المخزون اتحفظ، الكمية بترجع تلقائي بدل ما تفضل "ضايعة" من غير سجل.

function checkInventoryAvailable(item, qty){
  return (parseFloat(item.qty) || 0) >= (qty || 1);
}

// بيجمّع السطور لكل صنف (بالـ id، أو بالـ object لو مفيش id) — الناتج: [{item, qty, labels:[...]}]
function _aggregateDeductList(list){
  const byKey = new Map();
  list.forEach(x => {
    const key = x.item ? (x.item.id !== undefined && x.item.id !== null ? 'id:' + x.item.id : x.item) : x;
    const q = x.qty || 1;
    const cur = byKey.get(key);
    const label = x.label || (x.item && x.item.name) || '';
    if(cur){ cur.qty += q; if(label && !cur.labels.includes(label)) cur.labels.push(label); }
    else byKey.set(key, { item: x.item, qty: q, labels: label ? [label] : [] });
  });
  return Array.from(byKey.values());
}

// list: [{item, qty, label}]  — بيرجع true لو خصم كل حاجة (وبعد كده لسه المستدعي هو المسؤول عن
// استدعاء saveInventory() زي الأول)، أو false لو رفض الخصم كله (وعرض تنبيه واضح بنفسه، وسجّل
// الرفض في الـ audit log) — في الحالة دي منكملش نسجل materialsUsed ولا نستدعي saveInventory().
async function validateAndDeductBatch(list){
  if(!list || !list.length) return true;
  if(list.some(x => !x || !x.item)){
    await alertModal('صنف من الأصناف المطلوبة مش موجود في المخزون — مفيش حاجة اتخصمت.');
    return false;
  }
  const agg = _aggregateDeductList(list);
  const short = agg.filter(x => !checkInventoryAvailable(x.item, x.qty));
  if(short.length){
    const lines = short.map(x => `- ${x.labels.join(' + ') || x.item.name}: متاح ${parseFloat(x.item.qty) || 0} والمطلوب ${x.qty}`);
    await alertModal('الكمية مش كافية للأصناف دي — مفيش حاجة اتخصمت من المخزن:\n' + lines.join('\n') + '\n\nصحّح الكمية في المخزون الأول.');
    if(typeof logAuditEvent === 'function'){
      await logAuditEvent('inventory_deduct_rejected', {
        items: short.map(x => ({ itemId: x.item.id, itemName: x.item.name, available: parseFloat(x.item.qty) || 0, requested: x.qty }))
      });
    }
    return false;
  }
  agg.forEach(x => { x.item.qty = (parseFloat(x.item.qty) || 0) - x.qty; });
  return true;
}

// بيرجّع كميات عملية validateAndDeductBatch لسه ماتحفظتش (أو اتحفظت وعايزين نلغيها) — في الذاكرة بس
function undoDeductBatch(list){
  if(!list) return;
  _aggregateDeductList(list.filter(x => x && x.item)).forEach(x => { x.item.qty = (parseFloat(x.item.qty) || 0) + x.qty; });
}
// عكس undoDeductBatch: بيرجّع كميات لصنف/أصناف (استخدام اتلغى) — في الذاكرة بس
function creditBatch(list){
  undoDeductBatch(list);
}

// نتيجة حفظ المخزون:
//   'saved'  — اتحفظ على السيرفر
//   'queued' — مفيش نت: التعديل اتحفظ على الجهاز وهيتبعت لوحده لما النت يرجع (الشاشة صح، كمل العملية)
//   'failed' — تعارض (جهاز تاني عدّل المخزن في نفس الوقت): التعديل اتلغى واتحمّلت نسخة السيرفر
async function saveInventoryOutcome(){
  const t0 = Date.now();
  const ok = await saveInventory();
  if(ok === true) return 'saved';
  return _wasQueued('inventory', t0) ? 'queued' : 'failed';
}
function _wasQueued(key, sinceMs){
  try{
    const q = (typeof loadPendingWrites === 'function') ? loadPendingWrites()[key] : null;
    return !!(q && Date.parse(q.queuedAt) >= sinceMs - 50);
  }catch(e){ return false; }
}

// حفظ ملف المريض بعد تغيير في المخزون اتحفظ فعلًا. لو الحفظ اتلغى بتعارض (الملف اتعدّل من جهاز تاني)
// بنعمل عكس تغيير المخزون ونحفظه، وإلا المريض هيشوف "كرر العملية" والمخزن لسه ناقص من أول مرة —
// فالتكرار يخصم مرتين. changeList: نفس قايمة validateAndDeductBatch (stock اتخصم) أو creditList
// (stock اترجع) — mode 'deduct' | 'credit' بيحدد العكس المناسب.
async function savePatientFileAfterStockChange(patientId, file, changeList, mode){
  const t0 = Date.now();
  const key = 'patientfile:' + patientId;
  const ok = await savePatientFile(patientId, stripHelperFields(file));
  if(ok === true || _wasQueued(key, t0)) return true;
  if(mode === 'credit'){
    // الإرجاع اتلغى (سجل الاستخدام لسه موجود) → ننقص تاني اللي اترجّع
    _aggregateDeductList(changeList.filter(x => x && x.item)).forEach(x => { x.item.qty = (parseFloat(x.item.qty) || 0) - x.qty; });
  } else {
    undoDeductBatch(changeList);   // الخصم اتلغى (مفيش سجل استخدام) → نرجّع الكمية
  }
  const out = await saveInventoryOutcome();
  if(typeof toast === 'function') toast(out === 'failed'
    ? 'تعارض: الملف اتعدّل من جهاز تاني — اتحمّلت آخر نسخة، راجع المخزن وكرر العملية'
    : 'العملية اتلغت ورجعت الكمية زي ما كانت — كرر العملية');
  return false;
}
