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

function checkInventoryAvailable(item, qty){
  return (parseFloat(item.qty) || 0) >= (qty || 1);
}

// list: [{item, qty, label}]  — بيرجع true لو خصم كل حاجة (وبعد كده لسه المستدعي هو المسؤول عن
// استدعاء saveInventory() زي الأول)، أو false لو رفض الخصم كله (وعرض تنبيه واضح بنفسه، وسجّل
// الرفض في الـ audit log) — في الحالة دي منكملش نسجل materialsUsed ولا نستدعي saveInventory().
async function validateAndDeductBatch(list){
  if(!list || !list.length) return true;
  const short = list.filter(x => !checkInventoryAvailable(x.item, x.qty || 1));
  if(short.length){
    const lines = short.map(x => `- ${x.label || x.item.name}: متاح ${parseFloat(x.item.qty) || 0} والمطلوب ${x.qty || 1}`);
    await alertModal('الكمية مش كافية للأصناف دي — مفيش حاجة اتخصمت من المخزن:\n' + lines.join('\n') + '\n\nصحّح الكمية في المخزون الأول.');
    if(typeof logAuditEvent === 'function'){
      await logAuditEvent('inventory_deduct_rejected', {
        items: short.map(x => ({ itemId: x.item.id, itemName: x.item.name, available: parseFloat(x.item.qty) || 0, requested: x.qty || 1 }))
      });
    }
    return false;
  }
  list.forEach(x => { x.item.qty = (parseFloat(x.item.qty) || 0) - (x.qty || 1); });
  return true;
}
