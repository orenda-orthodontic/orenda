// patient-docs.js — مستندات المريض كـ PDF بشكل السيستم (كريمي/كورال + لوجو Orenda):
//   1) تعليمات التقويم (نص كامل + الشروط، الأرقام من إعدادات المستندات)
//   2) تعليمات الريتينر بعد الفك: جدول لبس تلقائي (Essix / Hawley) و/أو تعليمات عناية بالثابت —
//      بيتحسب من تاريخ تسليم الريتينر المسجل في كارت التثبيت (retention.js)
//   3) انتهاء عمل جهاز متحرك (growth modification): جدول لبس أنت بتحدد مدة كل مرحلة فيه
// كل مستند بيخلص بجملة ريفيو + لينكات (واتس / انستا / فيس / ريفيو جوجل) clickable.
// الإخراج: نافذة طباعة (نفس أسلوب تقفيل الشهر) → "طباعة / حفظ PDF" — الحروف العربي سليمة واللينكات شغالة.
// مفيش أي تعديل على ملف المريض: بنسجّل الطباعة في سجل العمليات بس (logActivity) عشان مفيش تعارض
// مع حفظ ملف المريض أو الـ Undo.
// إعدادات المستندات (اللينكات + الأرقام) متخزنة تحت المفتاح docsSettings — من ⚙ أدوات ← إعدادات المستندات.
// ملحوظة: 300 جنيه (كسر الفص المتكرر) هي نفس الرقم المحسوب في خريطة البراكيت وخصم الريبوندنج —
// مكتوب هنا كثابت واحد (DOCS_REPEAT_BREAK_FEE) ولو اتغير لازم يتغير هناك كمان.

const DOCS_SETTINGS_KEY = 'docsSettings';
const DOCS_REPEAT_BREAK_FEE = 300;
const DOCS_MULTI_BREAK_COUNT = 3;
const DOCS_DEFAULT_SETTINGS = {
  whatsappUrl: 'https://wa.me/201005394456',
  instagramHandle: 'Mahmoudnassar_orthodontics',
  facebookUrl: 'https://www.facebook.com/share/1HapmiABJk/?mibextid=wwXIfr',
  reviewUrl: 'https://g.page/r/CdUDay8nFXrLEAE/review',
  multiBreakFee: 1000,
  reinstallPct: 30
};
const DOCS_BRAND = { accent: '#9c6048', accent2: '#7a4a37', bg: '#fbf7f4', panel2: '#f6eae3', border: '#eadfd8', text: '#2a201c', muted: '#85726a' };

// ترتيب الأسبوع المصري (سبت → جمعة)
const DOCS_DAYS = [
  { id: 'sat', multi: 'سبت',    single: 'يوم السبت' },
  { id: 'sun', multi: 'أحد',    single: 'يوم الأحد' },
  { id: 'mon', multi: 'اثنين',  single: 'يوم الإثنين' },
  { id: 'tue', multi: 'ثلاثاء', single: 'يوم الثلاثاء' },
  { id: 'wed', multi: 'أربع',   single: 'يوم الأربعاء' },
  { id: 'thu', multi: 'خميس',   single: 'يوم الخميس' },
  { id: 'fri', multi: 'جمعة',   single: 'يوم الجمعة' }
];

function docsEsc(s){
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// ============ تواريخ (نقية) ============
function docsPad2(n){ return String(n).padStart(2, '0'); }
function docsParseDate(s){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if(!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if(mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}
// تاريخ + n شهر — لو اليوم مش موجود في الشهر الجديد بياخد آخر يوم فيه (31 أغسطس + 6 = 28 فبراير)
function docsAddMonths(dateStr, n){
  const p = docsParseDate(dateStr);
  if(!p) return null;
  const first = new Date(p.y, p.m - 1 + n, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return `${first.getFullYear()}-${docsPad2(first.getMonth() + 1)}-${docsPad2(Math.min(p.d, lastDay))}`;
}
function docsAddDays(dateStr, n){
  const p = docsParseDate(dateStr);
  if(!p) return null;
  const d = new Date(p.y, p.m - 1, p.d + n);
  return `${d.getFullYear()}-${docsPad2(d.getMonth() + 1)}-${docsPad2(d.getDate())}`;
}
function docsFmtDate(dateStr){
  const p = docsParseDate(dateStr);
  return p ? `${docsPad2(p.d)}/${docsPad2(p.m)}/${p.y}` : '';
}

// ============ جدول اللبس (نقي) ============
// phase = { kind: 'full' | 'night' | 'days', days: ['sat',...] (لو kind='days'), months: عدد الشهور (آخر مرحلة مفتوحة) }
function docsSortDays(ids){
  const set = new Set(Array.isArray(ids) ? ids : []);
  return DOCS_DAYS.filter(d => set.has(d.id));
}
const DOCS_TEXT_FULL = 'كل يوم طول اليوم ماعدا وقت الأكل والشرب';
const DOCS_TEXT_NIGHT = 'كل يوم وقت النوم فقط';
function docsPhaseText(ph){
  if(!ph || ph.kind === 'full') return DOCS_TEXT_FULL;
  if(ph.kind === 'night') return DOCS_TEXT_NIGHT;
  const days = docsSortDays(ph.days);
  if(!days.length) return DOCS_TEXT_NIGHT;
  if(days.length === 7) return DOCS_TEXT_NIGHT;
  if(days.length === 1) return days[0].single + ' وقت النوم فقط';
  const names = days.map(d => d.multi);
  return names[0] + ' ' + names.slice(1).map(n => 'و' + n).join(' ') + ' وقت النوم فقط';
}
// من تاريخ كل مرحلة = بداية الجدول + مجموع شهور اللي قبلها، وإلى = اليوم اللي قبل بداية اللي بعدها —
// فمفيش فجوة ولا تداخل بين مرحلتين (آخر مرحلة مفتوحة: من غير تاريخ نهاية)
function docsBuildSchedule(startDate, phases){
  if(!docsParseDate(startDate) || !Array.isArray(phases)) return [];
  let cum = 0;
  return phases.map((ph, i) => {
    const last = i === phases.length - 1;
    const from = docsAddMonths(startDate, cum);
    let to = null;
    if(!last){
      cum += Math.max(1, parseInt(ph.months, 10) || 1);
      to = docsAddDays(docsAddMonths(startDate, cum), -1);
    }
    return { from, to, text: docsPhaseText(ph), kind: ph.kind };
  });
}
function docsDefaultRetainerPhases(){
  return [
    { kind: 'full', months: 6 },
    { kind: 'night', months: 6 },
    { kind: 'days', days: ['sat', 'mon', 'wed'], months: 6 },
    { kind: 'days', days: ['sat', 'mon'], months: 6 },
    { kind: 'days', days: ['mon'], months: null }
  ];
}
// نفس شكل الـ PDF بتاع "انتهاء عمل جهاز متحرك": شهر لكل مرحلة (أنت بتعدّل المدة)، وآخرها يوم الإثنين
function docsDefaultAppliancePhases(){
  return [
    { kind: 'full', months: 1 },
    { kind: 'night', months: 1 },
    { kind: 'days', days: ['sat', 'mon', 'wed'], months: 1 },
    { kind: 'days', days: ['sat', 'mon'], months: 1 },
    { kind: 'days', days: ['mon'], months: null }
  ];
}

// نوع الريتينر المسجل (retention.js) → إيه المطلوب في المستند. Hawley بنفس جدول Essix.
function docsRetentionInfo(r){
  if(!r) return null;
  const types = [r.upperType, r.lowerType];
  const removable = types.filter(t => t === 'essix' || t === 'hawley');
  const hasFixed = types.includes('fixed');
  if(!removable.length && !hasFixed) return null;
  let removableKind = null;
  if(removable.length){
    removableKind = removable.every(t => t === 'essix') ? 'essix' : (removable.every(t => t === 'hawley') ? 'hawley' : 'mixed');
  }
  return { hasRemovable: removable.length > 0, hasFixed, removableKind, upperType: r.upperType || 'none', lowerType: r.lowerType || 'none' };
}
const DOCS_RETAINER_LABELS = { essix: 'شفاف (Essix)', hawley: 'متحرك (Hawley)', fixed: 'ثابت', none: 'مفيش', other: 'تاني' };

// ============ الإعدادات ============
function docsMergeSettings(saved){
  const out = Object.assign({}, DOCS_DEFAULT_SETTINGS);
  const s = (saved && typeof saved === 'object') ? saved : {};
  ['whatsappUrl', 'instagramHandle', 'facebookUrl', 'reviewUrl'].forEach(k => {
    if(typeof s[k] === 'string') out[k] = s[k].trim(); // نص فاضي مسموح = اللينك ده مش هيظهر
  });
  const mf = parseFloat(s.multiBreakFee);
  if(!isNaN(mf) && mf >= 0) out.multiBreakFee = mf;
  const rp = parseFloat(s.reinstallPct);
  if(!isNaN(rp) && rp >= 0 && rp <= 100) out.reinstallPct = rp;
  return out;
}
let _docsSettingsCache = null;
async function docsLoadSettings(){
  if(_docsSettingsCache) return _docsSettingsCache;
  let saved = {};
  try{ saved = await getData(DOCS_SETTINGS_KEY, {}); }catch(e){ console.error('docs settings load failed', e); }
  _docsSettingsCache = docsMergeSettings(saved);
  return _docsSettingsCache;
}

// ============ لينكات التواصل (نقية) ============
function docsInstagramUrl(handle){
  const h = String(handle || '').trim();
  if(!h) return '';
  if(/^https?:\/\//i.test(h)) return h;
  return 'https://www.instagram.com/' + h.replace(/^@/, '') + '/';
}
function docsPhoneFromWa(url){
  const digits = (String(url || '').match(/(\d{8,15})\s*(?:[/?#].*)?$/) || [])[1] || '';
  if(!digits) return '';
  return digits.startsWith('20') && digits.length === 12 ? '0' + digits.slice(2) : digits;
}
function docsContactLinks(s){
  const links = [];
  const ig = docsInstagramUrl(s.instagramHandle);
  if(ig) links.push({ key: 'instagram', label: 'Instagram', sub: '@' + String(s.instagramHandle).replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, ''), url: ig });
  if(s.whatsappUrl) links.push({ key: 'whatsapp', label: 'WhatsApp', sub: docsPhoneFromWa(s.whatsappUrl), url: s.whatsappUrl });
  if(s.facebookUrl) links.push({ key: 'facebook', label: 'Facebook', sub: 'صفحتنا على فيسبوك', url: s.facebookUrl });
  if(s.reviewUrl) links.push({ key: 'review', label: 'Google', sub: 'قيّمنا على جوجل', url: s.reviewUrl });
  return links;
}
function docsReviewSentence(s){
  return s.reviewUrl
    ? 'رأيك يهمني ويساعد غيرك يختار دكتور يثق فيه. لو استفدت من زيارتك، اعمل Follow على انستا وفيس، وسيب تقييمك الصادق على جوجل — هياخد دقيقة.'
    : 'رأيك يهمني ويساعد غيرك يختار دكتور يثق فيه. لو استفدت من زيارتك، اعمل Follow على انستا وفيس وشاركنا رأيك.';
}

// ============ محتوى ============
const DOCS_FIXED_CARE = [
  'المثبت الثابت لازم يفضل في مكانه — متحاولش تشيله أو تحركه بإيدك أو بأي أداة.',
  'نضّف أسنانك بالفرشاة مرتين يوميًا على الأقل، واستخدم خيط الأسنان أو فرشاة الـ interdental حوالين السلك عشان الجير ما يتراكمش عليه.',
  'تجنّب العض بالقواطع على الأكل الصلب (تفاح كامل، قصب، ثلج، عضم) وقطّعه لقطع صغيرة، وبلاش قضم الأظافر أو الأقلام.',
  'لو السلك فكّ أو اتكسر أو حسيت بخشونة تجرح اللسان أو الشفايف، كلّمنا في أقرب وقت — أي تأخير ممكن يخلي الأسنان تتحرك من مكانها.',
  'الالتزام بمتابعات التثبيت (بعد 1 و3 و6 و12 شهر) وبالتنظيف الدوري عند الدكتور بيحافظ على نتيجة التقويم.'
];

function docsBracesSections(s){
  const repair = DOCS_REPEAT_BREAK_FEE, multi = s.multiBreakFee, count = DOCS_MULTI_BREAK_COUNT, pct = s.reinstallPct;
  return [
    { title: 'بعض مشاكل تقويم الأسنان', kind: 'ol', items: [
      'كسر بعض أجزاء التقويم.', 'تجرح بعض مناطق الفم.', 'الكسر والإصلاح قد يطول فترة العلاج.',
      'التهاب اللثة أو تضخمها.', 'اصفرار الأسنان.', 'صعوبة مضغ الطعام بصورة سليمة.', 'ألم الأسنان طبيعي في الفترة الأولى.' ] },
    { title: 'الأطعمة التي يجب تناولها أثناء فترة التقويم', kind: 'ol', items: [
      'الزبادي مناسب جدًا لأنه لين وسهل وغني بالبروتين والكالسيوم.', 'البطاطس المهروسة لينة وناعمة.', 'شوربة العدس مليئة بالمعادن والألياف.' ] },
    { title: 'الأطعمة المسموح بها مع التقليل منها لأنها قد تعلق بالجهاز وتسبب تسوسًا', kind: 'ol', items: [
      'المكرونة والأرز.', 'الكعك والكوكيز.', 'الخبز الأبيض.', 'الآيس كريم والسموذي بأنواعه.' ] },
    { title: 'كيف تتعامل مع الأطعمة الصلبة', kind: 'p',
      text: 'مثل الفواكه، الخضراوات، الأجبان الصلبة، السندوتشات، الكريبات، قطع اللحم والدجاج: من الصعب تقطيع ومضغ هذه الأطعمة، لذلك يفضل تقطيعها لقطع صغيرة حتى لا تسبب ضررًا أو كسرًا بالتقويم.' },
    { title: 'أجنحة الدجاج، الذرة والمكسرات', kind: 'p', text: 'كل الأطعمة التي تحتاج للأسنان الأمامية ينصح بتقطيعها لقطع صغيرة.' },
    { title: 'الحلويات اللزجة', kind: 'p',
      text: 'مثل: توفي، كراميل واللبان، يجب تجنبها خلال فترة التقويم لأنها قد تلتصق بالأسنان والجهاز مما يجعل التخلص منها صعبًا جدًا.' },
    { title: 'المشروبات الغازية والحمضية مثل الليمون', kind: 'p',
      text: 'تضر المينا وتسبب تلونًا في الأسنان، وعند إزالة التقويم سنرى بوضوح فرق اللون في المكان الذي كان فيه التقويم، لذلك يجب التقليل منها.' },
    { title: 'غسيل الأسنان', kind: 'p',
      text: 'يجب غسل الأسنان بفرشاة خاصة بالتقويم مع حركة خفيفة وبدون عنف حتى لا ينكسر التقويم:', ltr: 'orthodontic tooth brush + interdental tooth brush' },
    { title: 'ملاحظات هامة جدًا جدًا يجب قراءتها بعناية', kind: 'ul', important: true, items: [
      'فترة التقويم تختلف من مريض لمريض حسب استجابة العظم ولا تكون محددة.',
      'عدم نظافة الأسنان والتهابات اللثة نتيجة عدم الاهتمام بنظافتها يحق للطبيب معها عدم استكمال الجلسة، وذلك حفاظًا على سلامة أسنان المريض وعدم تعريضها لشد يؤدي إلى حدوث مضاعفات، وقد يحتاج المريض إلى عملية قص لثة وتكون لها تكلفة إضافية.',
      'التقويم يعالج فقط انتظام الأسنان، وقد تحتاج الأسنان لعلاج إضافي بعد التقويم لتعديل الشكل واللون.',
      'يتم تركيب الفك العلوي أولًا ثم الفك السفلي لاحقًا.',
      'قد يحتاج المريض لخلع بعض الضروس أو لجراحة تقويمية أثناء العلاج، وتكون خارج تكلفة التقويم.',
      `عند كسر فص التقويم يتم لصقه لأول مرة مجانًا، وعند حدوث كسر مرة أخرى يتحمل المريض تكلفة ${repair} جنيهًا في الزيارة، وعند كسر أكثر من ${count} فصوص في المرة الواحدة يتم إضافة ${multi} جنيه في الزيارة.`,
      'على المريض الاحتفاظ بقطع التقويم إن كُسرت أو تحركت، ولا داعي للقلق.',
      'في حالة عدم استكمال التقويم لأي سبب لا يتم استرجاع المبلغ المدفوع.',
      'المريض موافق على خطة العلاج والنتيجة المخطط لها من قبل الطبيب.',
      'يدفع ثلث المبلغ في البداية والباقي قسط شهري كل زيارة شهرية.',
      'لو انكسر التقويم بشكل كبير أو وُجد إهمال في الاهتمام والعناية بالأسنان والجهاز، يتم وقف التقويم ودفع تكلفة فك التقويم.',
      `في حالة الاضطرار لفك التقويم لظروف ما وإعادة تركيبه، يتم دفع ${pct}% من السعر الأساسي للتكلفة الإجمالية مجددًا.`,
      'الالتزام بمواعيد الزيارة والمتابعة للطبيب.',
      'بعد التقويم يتم وضع مثبت داخلي ثابت أو متحرك للأسنان، أو الاثنين معًا طبقًا لطبيعة الحالة، للحفاظ على نتيجة التقويم، وذلك بتكلفة منفصلة عن حساب التقويم ويتم تقييمها مع نهاية العلاج.'
    ] }
  ];
}

// ============ HTML (الطباعة) ============
function docsSectionHtml(sec){
  let body = '';
  if(sec.kind === 'p'){
    body = `<p>${docsEsc(sec.text)}</p>` + (sec.ltr ? `<p class="ltr">${docsEsc(sec.ltr)}</p>` : '');
  } else {
    const tag = sec.kind === 'ol' ? 'ol' : 'ul';
    body = `<${tag}>${sec.items.map(i => `<li>${docsEsc(i)}</li>`).join('')}</${tag}>`;
  }
  return `<section class="sec${sec.important ? ' important' : ''}"><h2>${docsEsc(sec.title)}</h2>${body}</section>`;
}

function docsScheduleHtml(schedule){
  return `<div class="schedule">` + schedule.map((p, i) => `
    <div class="phase">
      <div class="num">${i + 1}</div>
      <div class="pbody">
        <div class="dates">${p.to ? `من ${docsFmtDate(p.from)} إلى ${docsFmtDate(p.to)}` : `من ${docsFmtDate(p.from)} وبعد كده`}</div>
        <div class="what">${docsEsc(p.text)}</div>
      </div>
    </div>`).join('') + `</div>`;
}

function docsContactHtml(s){
  const links = docsContactLinks(s);
  return `
    <div class="contact">
      <p class="review">${docsEsc(docsReviewSentence(s))}</p>
      <div class="contact-title">للاستشارة والاستفسار، اضغط على أي لينك:</div>
      <div class="pills">
        ${links.map(l => `<a class="pill ${l.key}" href="${docsEsc(l.url)}" target="_blank" rel="noopener"><b>${docsEsc(l.label)}</b><span dir="ltr">${docsEsc(l.sub)}</span></a>`).join('')}
      </div>
    </div>`;
}

function docsWrapHtml(o){
  const B = DOCS_BRAND;
  const s = o.settings;
  const logo = (typeof DOCS_LOGO_DATA_URI !== 'undefined' && DOCS_LOGO_DATA_URI) ? `<img class="logo" src="${DOCS_LOGO_DATA_URI}" alt="">` : '';
  const fileTitle = o.title + (o.patientName ? ' — ' + o.patientName : '');
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${docsEsc(fileTitle)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Manrope:wght@500;700&display=swap" rel="stylesheet">
<style>
  @page{ size:A4; margin:14mm; }
  *{ box-sizing:border-box; }
  html{ background:${B.bg}; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body{ margin:0 auto; max-width:760px; padding:22px 18px 40px; font-family:'Cairo','Manrope','Segoe UI',Tahoma,Arial,sans-serif; color:${B.text}; background:${B.bg}; line-height:1.85; font-size:14px; }
  .bar{ position:sticky; top:0; z-index:5; background:#fff; border:1px solid ${B.border}; border-radius:10px; padding:8px 12px; margin-bottom:16px; display:flex; gap:10px; align-items:center; justify-content:space-between; font-size:12px; color:${B.muted}; }
  .bar button{ font-family:inherit; background:${B.accent}; color:#fff; border:none; border-radius:8px; padding:8px 16px; font-size:13px; font-weight:700; cursor:pointer; }
  header{ text-align:center; padding-bottom:12px; border-bottom:2px solid ${B.accent}; margin-bottom:18px; }
  .logo{ height:84px; width:auto; display:block; margin:0 auto 6px; }
  .brand{ font-family:'Manrope','Cairo',sans-serif; font-weight:700; font-size:15px; letter-spacing:.3px; direction:ltr; }
  .brand span{ display:block; color:${B.accent}; font-size:13px; }
  h1{ text-align:center; color:${B.accent2}; font-size:23px; margin:6px 0 10px; }
  .patient{ background:${B.panel2}; border:1px solid ${B.border}; border-radius:12px; padding:9px 14px; margin:0 0 16px; display:flex; flex-wrap:wrap; gap:6px 22px; font-size:13.5px; }
  .patient b{ color:${B.accent2}; }
  .intro{ margin:0 0 14px; color:${B.text}; }
  .schedule{ display:flex; flex-direction:column; gap:9px; margin-bottom:18px; }
  .phase{ display:flex; gap:12px; align-items:center; background:#fff; border:1px solid ${B.border}; border-right:5px solid ${B.accent}; border-radius:12px; padding:10px 14px; break-inside:avoid; page-break-inside:avoid; }
  .num{ flex:0 0 32px; height:32px; border-radius:50%; background:${B.accent}; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; }
  .dates{ color:${B.muted}; font-size:13px; }
  .what{ font-weight:700; font-size:15.5px; color:${B.accent2}; }
  .sec{ background:#fff; border:1px solid ${B.border}; border-radius:12px; padding:10px 16px; margin-bottom:12px; break-inside:avoid; page-break-inside:avoid; }
  .sec h2{ margin:2px 0 6px; font-size:16px; color:${B.accent2}; }
  .sec p{ margin:4px 0; } .sec ul, .sec ol{ margin:4px 0; padding-right:22px; } .sec li{ margin-bottom:3px; }
  .sec.important{ break-inside:auto; page-break-inside:auto; border-color:${B.accent}; background:${B.panel2}; }
  .sec.important li{ break-inside:avoid; }
  .ltr{ direction:ltr; text-align:left; font-family:'Manrope',sans-serif; color:${B.accent2}; font-weight:700; }
  .agree{ text-align:center; font-weight:700; color:${B.accent2}; text-decoration:underline; margin:14px 0; }
  .contact{ background:${B.panel2}; border:1px solid ${B.border}; border-radius:14px; padding:14px 16px; margin-top:18px; break-inside:avoid; page-break-inside:avoid; text-align:center; }
  .review{ margin:0 0 10px; font-weight:600; color:${B.accent2}; }
  .contact-title{ font-size:12.5px; color:${B.muted}; margin-bottom:8px; }
  .pills{ display:flex; flex-wrap:wrap; gap:8px; justify-content:center; }
  .pill{ display:inline-flex; flex-direction:column; align-items:center; min-width:140px; padding:7px 14px; border-radius:12px; background:#fff; border:1px solid ${B.accent}; color:${B.accent2}; text-decoration:none; line-height:1.4; }
  .pill b{ font-size:13px; } .pill span{ font-size:11.5px; color:${B.muted}; }
  .sign{ text-align:center; margin-top:18px; font-weight:700; color:${B.accent2}; line-height:1.6; }
  .sign small{ display:block; font-weight:400; color:${B.muted}; }
  .issued{ text-align:center; font-size:11px; color:${B.muted}; margin-top:10px; }
  .sign, .issued{ break-inside:avoid; page-break-inside:avoid; }
  table.stmt{ width:100%; border-collapse:collapse; background:#fff; border:1px solid ${B.border}; font-size:13.5px; }
  .stmt thead{ display:table-header-group; }
  .stmt th{ background:${B.panel2}; color:${B.accent2}; padding:8px 10px; text-align:right; font-size:13px; }
  .stmt td{ padding:7px 10px; border-top:1px solid ${B.border}; }
  .stmt tr{ break-inside:avoid; page-break-inside:avoid; }
  .stmt .n{ text-align:left; white-space:nowrap; font-variant-numeric:tabular-nums; direction:ltr; }
  .stmt .c{ text-align:center; width:34px; color:${B.muted}; }
  .stmt tfoot td{ font-weight:700; background:${B.panel2}; color:${B.accent2}; }
  .stmt .tag{ font-size:11px; color:${B.muted}; font-weight:400; }
  .shares{ display:flex; gap:12px; margin-top:16px; break-inside:avoid; page-break-inside:avoid; }
  .share{ flex:1; text-align:center; background:${B.panel2}; border:1px solid ${B.accent}; border-radius:14px; padding:12px 10px; }
  .share .lbl{ color:${B.muted}; font-size:13px; }
  .share .pct{ font-size:28px; font-weight:700; color:${B.accent2}; line-height:1.3; }
  .share .amt{ font-weight:600; }
  .share-note{ text-align:center; font-size:12px; color:${B.muted}; margin-top:8px; }
  @media print{ .bar{ display:none; } body{ padding:0; max-width:none; line-height:1.7; } .logo{ height:62px; } header{ margin-bottom:12px; padding-bottom:8px; } h1{ margin:2px 0 8px; } .schedule{ gap:7px; margin-bottom:12px; } .phase{ padding:7px 14px; } .contact{ margin-top:12px; padding:10px 14px; } .sign{ margin-top:12px; } }
</style></head><body>
  <div class="bar"><span>اختار "Save as PDF" / "حفظ كـ PDF" من نافذة الطباعة</span><button onclick="window.print()">طباعة / حفظ PDF</button></div>
  <header>
    ${logo}
    <div class="brand">Mahmoud Nassar<span>Orthodontics</span></div>
  </header>
  <h1>${docsEsc(o.title)}</h1>
  ${o.infoRows && o.infoRows.length ? `<div class="patient">${o.infoRows.map(r => `<div><b>${docsEsc(r[0])}:</b> ${docsEsc(r[1])}</div>`).join('')}</div>` : ''}
  ${o.introHtml || ''}
  ${o.bodyHtml}
  ${o.statement ? '' : docsContactHtml(s)}
  ${o.statement ? '' : '<div class="sign">دكتور / محمود نصار<small>ماجستير تقويم الأسنان</small></div>'}
  <div class="issued">تاريخ الإصدار: ${docsEsc(o.issued || '')}</div>
</body></html>`;
}

function docsBuildBracesHtml(o){
  const sections = docsBracesSections(o.settings);
  return docsWrapHtml({
    title: 'تعليمات التقويم', patientName: o.patientName, settings: o.settings, issued: o.issued,
    infoRows: o.patientName ? [['المريض', o.patientName]] : [],
    bodyHtml: sections.map(docsSectionHtml).join('') + '<div class="agree">موافق على جميع الشروط والقوانين والنصائح</div>'
  });
}

function docsBuildRetainerHtml(o){
  const info = o.info;
  const title = info.hasRemovable
    ? (info.removableKind === 'essix' ? 'تعليمات مثبت تقويمي شفاف' : (info.removableKind === 'hawley' ? 'تعليمات مثبت تقويمي متحرك' : 'تعليمات المثبت المتحرك'))
    : 'تعليمات المثبت الثابت';
  const rows = [['المريض', o.patientName], ['فوق', DOCS_RETAINER_LABELS[info.upperType] || '—'], ['تحت', DOCS_RETAINER_LABELS[info.lowerType] || '—']];
  if(o.startDate) rows.push(['تاريخ بداية الجدول', docsFmtDate(o.startDate)]);
  let body = '';
  if(info.hasRemovable && o.schedule){
    body += `<p class="intro">الالتزام بلبس المثبت هو اللي بيحافظ على نتيجة التقويم. اتبع الجدول ده بالتواريخ، ولو المثبت اتكسر أو ضاع أو بقى ضيق كلّمنا فورًا عشان الأسنان ما تتحركش.</p>` + docsScheduleHtml(o.schedule);
  }
  if(info.hasFixed){
    body += docsSectionHtml({ title: 'تعليمات العناية بالمثبت الثابت', kind: 'ul', items: DOCS_FIXED_CARE });
  }
  return docsWrapHtml({ title, patientName: o.patientName, settings: o.settings, issued: o.issued, infoRows: rows, bodyHtml: body });
}

function docsBuildApplianceHtml(o){
  const rows = [['المريض', o.patientName], ['تاريخ بداية الجدول', docsFmtDate(o.startDate)]];
  const body = `<p class="intro">بعد انتهاء مرحلة العمل الأساسي للجهاز بنقلل مدة لبسه بالتدريج حسب الجدول ده. لو الجهاز اتكسر أو ضاع أو حسيت بأي مشكلة كلّمنا فورًا.</p>` + docsScheduleHtml(o.schedule);
  return docsWrapHtml({ title: 'تعليمات انتهاء عمل جهاز متحرك', patientName: o.patientName, settings: o.settings, issued: o.issued, infoRows: rows, bodyHtml: body });
}

// ============ كشف حساب العيادة الشهري ============
function docsMoney(cents){
  return ((parseInt(cents, 10) || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// o = { clinicName, monthLabel, c (كائن العيادة من computeMonthClosingFromData), settings, issued }
function docsBuildClinicStatementHtml(o){
  const c = o.c;
  const patients = c.patients || [];
  const adjustments = c.adjustments || [];
  const remainingTotal = patients.reduce((s, p) => s + (p.remainingCents || 0), 0);
  const collected = c.collectedCents || 0;
  const docPct = collected > 0 ? Math.round(c.myShareCents * 1000 / collected) / 10 : 0;
  const clinicPct = collected > 0 ? Math.round((100 - docPct) * 10) / 10 : 0;
  const agreed = parseFloat(c.pct);
  const differs = collected > 0 && !isNaN(agreed) && Math.abs(docPct - agreed) >= 0.1;
  const rows = patients.map((p, i) => `
    <tr><td class="c">${i + 1}</td>
      <td>${docsEsc(p.name || '—')}${p.ownCase ? ' <span class="tag">(حالة الدكتور)</span>' : ''}${p.archived ? ' <span class="tag">(أرشيف)</span>' : ''}</td>
      <td class="n">${docsMoney(p.collectedCents)}</td>
      <td class="n">${docsMoney(p.remainingCents)}</td></tr>`).join('')
    + adjustments.map(a => `
    <tr><td class="c">+</td><td>تعديل: ${docsEsc(a.label || '—')}</td><td class="n">${docsMoney(a.totalCents)}</td><td class="n">—</td></tr>`).join('');
  const body = `
    <table class="stmt">
      <thead><tr><th class="c">م</th><th>المريض</th><th class="n">دفع الشهر ده (جنيه)</th><th class="n">الباقي في حسابه (جنيه)</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" style="text-align:center;">لا توجد دفعات في الشهر ده</td></tr>'}</tbody>
      <tfoot><tr><td></td><td>الإجمالي</td><td class="n">${docsMoney(collected)}</td><td class="n">${docsMoney(remainingTotal)}</td></tr></tfoot>
    </table>
    <div class="shares">
      <div class="share"><div class="lbl">نسبة الدكتور</div><div class="pct">${docPct}%</div><div class="amt">${docsMoney(c.myShareCents)} جنيه</div></div>
      <div class="share"><div class="lbl">نسبة العيادة</div><div class="pct">${clinicPct}%</div><div class="amt">${docsMoney(c.clinicShareCents)} جنيه</div></div>
    </div>
    ${differs ? `<div class="share-note">النسبة المتفق عليها للدكتور ${agreed}% — النسبة الفعلية مختلفة بسبب حالات الدكتور (100%) أو بنود التعديل.</div>` : ''}`;
  return docsWrapHtml({
    title: 'كشف حساب شهر ' + o.monthLabel + ' — ' + o.clinicName,
    patientName: '', settings: o.settings, issued: o.issued, statement: true,
    infoRows: [['العيادة', o.clinicName], ['الشهر', o.monthLabel], ['الدكتور', 'محمود نصار']],
    bodyHtml: body
  });
}

// بيفتح نافذة الكشف فورًا (جوه ضغطة الزرار عشان المتصفح ما يمنعهاش) وبعدين يحمّل الأرقام.
// preData: لو الشاشة اللي ندهت (تقفيل الشهر) معاها أرقام العيادة جاهزة بنستخدمها بدل ما نحمّل تاني.
async function printClinicStatement(clinicId, month, preData){
  const clinic = (state.clinics || []).find(c => c.id === clinicId);
  if(!clinic) return;
  const w = docsOpenWindow();
  if(!w) return;
  try{
    const s = await docsLoadSettings();
    let c = preData;
    if(!c){
      const patients = await getData('patients:' + clinicId, []);
      const files = patients.length ? await batchLoadPatientFiles(patients) : [];
      c = computeMonthClosingFromData([{ clinic, files }], month).clinics[0];
    }
    docsShow(w, docsBuildClinicStatementHtml({ clinicName: clinic.name || '', monthLabel: monthLabelAr(month), c, settings: s, issued: docsFmtDate(todayStr()) }));
    docsLog('doc_clinic_statement', `طلّع كشف حساب PDF لعيادة ${clinic.name || ''} — ${monthLabelAr(month)}`);
  }catch(e){
    console.error('clinic statement failed', e);
    try{ w.close(); }catch(err){ /* ignore */ }
    toast('تعذر تجهيز كشف العيادة — حاول تاني');
  }
}

// ============ فتح نافذة الطباعة ============
function docsOpenWindow(){
  const w = window.open('', '_blank');
  if(!w){
    if(typeof toast === 'function') toast('المتصفح منع نافذة الطباعة — اسمح بالنوافذ المنبثقة للموقع');
    return null;
  }
  try{ w.document.open(); w.document.write('<!DOCTYPE html><html dir="rtl"><body style="font-family:Tahoma,Arial,sans-serif;padding:30px;">جارِ تجهيز المستند...</body></html>'); w.document.close(); }catch(e){ /* ignore */ }
  return w;
}
function docsShow(w, html){
  w.document.open(); w.document.write(html); w.document.close();
}
function docsLog(action, text){
  try{ Promise.resolve(logActivity(action, text)).catch(e => console.error('docs log failed', e)); }catch(e){ console.error('docs log failed', e); }
}

// ============ نافذة جدول اللبس ============
function docsOpenScheduleModal(opts){
  const phases = opts.phases.map(p => ({ kind: p.kind, days: (p.days || []).slice(), months: p.months }));
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal" style="max-width:580px;width:96%;max-height:92vh;overflow-y:auto;">
      <h3>${docsEsc(opts.title)}</h3>
      ${opts.intro ? `<div class="placeholder" style="font-size:12px;text-align:right;padding:8px;margin-bottom:10px;">${docsEsc(opts.intro)}</div>` : ''}
      <div class="field"><label>تاريخ بداية الجدول</label><input type="date" id="dsStart" value="${docsEsc(opts.startDate)}" style="width:100%;"></div>
      <div id="dsPhases" style="margin-top:12px;"></div>
      <button type="button" class="secondary small" id="dsAdd">+ مرحلة</button>
      <div id="dsPreview" style="margin-top:12px;font-size:12.5px;line-height:1.9;background:var(--panel2);border-radius:10px;padding:8px 12px;"></div>
      <div class="modal-actions">
        <button class="secondary" id="dsCancel">إلغاء</button>
        <button id="dsOk">${docsEsc(opts.confirmLabel || 'اطلع PDF')}</button>
      </div>
    </div>`;
  document.body.appendChild(bg);
  const $ = (id) => bg.querySelector('#' + id);

  function renderPreview(){
    const start = $('dsStart').value;
    if(!docsParseDate(start)){ $('dsPreview').textContent = 'اختار تاريخ بداية صحيح'; return; }
    const sch = docsBuildSchedule(start, phases);
    $('dsPreview').innerHTML = '<b>معاينة التواريخ:</b><br>' + sch.map((p, i) =>
      `${i + 1}) ${p.to ? docsFmtDate(p.from) + ' ← ' + docsFmtDate(p.to) : 'من ' + docsFmtDate(p.from)} — ${docsEsc(p.text)}`).join('<br>');
  }

  function renderPhases(){
    const el = $('dsPhases');
    el.innerHTML = phases.map((ph, i) => {
      const last = i === phases.length - 1;
      return `
        <div class="ds-phase" style="border:1px solid var(--border);border-radius:10px;padding:8px 10px;margin-bottom:8px;">
          <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center;">
            <b style="font-size:13px;">مرحلة ${i + 1}</b>
            <select class="ds-kind" data-i="${i}">
              <option value="full" ${ph.kind === 'full' ? 'selected' : ''}>كل يوم ماعدا الأكل والشرب</option>
              <option value="night" ${ph.kind === 'night' ? 'selected' : ''}>كل يوم وقت النوم</option>
              <option value="days" ${ph.kind === 'days' ? 'selected' : ''}>أيام محددة وقت النوم</option>
            </select>
            ${last
              ? '<span style="font-size:12px;color:var(--muted);">مفتوحة (من غير تاريخ نهاية)</span>'
              : `<label style="font-size:12px;">المدة (شهور) <input type="number" class="ds-months" data-i="${i}" min="1" max="60" value="${parseInt(ph.months, 10) || 1}" style="width:64px;"></label>`}
            ${phases.length > 2 ? `<button type="button" class="secondary small ds-del" data-i="${i}">×</button>` : ''}
          </div>
          ${ph.kind === 'days' ? `
            <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;">
              ${DOCS_DAYS.map(d => `<label style="font-size:13px;display:flex;gap:4px;align-items:center;"><input type="checkbox" class="ds-day" data-i="${i}" data-d="${d.id}" ${ph.days.includes(d.id) ? 'checked' : ''}> ${d.multi}</label>`).join('')}
            </div>` : ''}
        </div>`;
    }).join('');
    el.querySelectorAll('.ds-kind').forEach(s => { s.onchange = () => {
      const ph = phases[+s.dataset.i];
      ph.kind = s.value;
      if(ph.kind === 'days' && !ph.days.length) ph.days = ['sat'];
      renderPhases(); renderPreview();
    }; });
    el.querySelectorAll('.ds-months').forEach(inp => { inp.oninput = () => { phases[+inp.dataset.i].months = parseInt(inp.value, 10) || 1; renderPreview(); }; });
    el.querySelectorAll('.ds-day').forEach(cb => { cb.onchange = () => {
      const ph = phases[+cb.dataset.i];
      ph.days = cb.checked ? Array.from(new Set(ph.days.concat([cb.dataset.d]))) : ph.days.filter(d => d !== cb.dataset.d);
      renderPreview();
    }; });
    el.querySelectorAll('.ds-del').forEach(b => { b.onclick = () => {
      const i = +b.dataset.i;
      const wasLast = i === phases.length - 1;
      phases.splice(i, 1);
      if(wasLast) phases[phases.length - 1].months = null; // اللي بقى آخر مرحلة بيبقى مفتوح
      renderPhases(); renderPreview();
    }; });
  }

  $('dsAdd').onclick = () => {
    const prev = phases[phases.length - 2] || phases[0];
    const ins = { kind: prev.kind === 'full' ? 'night' : prev.kind, days: (prev.days || []).slice(), months: parseInt(prev.months, 10) || 1 };
    phases.splice(phases.length - 1, 0, ins);
    renderPhases(); renderPreview();
  };
  $('dsStart').oninput = renderPreview;
  const close = () => bg.remove();
  $('dsCancel').onclick = close;
  bg.onclick = (e) => { if(e.target === bg) close(); };
  $('dsOk').onclick = () => {
    const startDate = $('dsStart').value;
    if(!docsParseDate(startDate)){ toast('اختار تاريخ بداية صحيح'); return; }
    for(let i = 0; i < phases.length; i++){
      const ph = phases[i];
      if(i < phases.length - 1 && !(parseInt(ph.months, 10) >= 1)){ toast('مدة المرحلة ' + (i + 1) + ' لازم تكون شهر على الأقل'); return; }
      if(ph.kind === 'days' && !ph.days.length){ toast('اختار يوم واحد على الأقل في المرحلة ' + (i + 1)); return; }
    }
    close();
    // بنستدعي onConfirm هنا مباشرة (جوه ضغطة الزرار) عشان المتصفح ما يمنعش فتح نافذة الـ PDF
    opts.onConfirm({ startDate, phases: phases.map(p => ({ kind: p.kind, days: p.days.slice(), months: p.months })) });
  };
  renderPhases();
  renderPreview();
}

// ============ نقط الدخول ============
function docsCurrentPatient(){
  const patient = (state.patients || []).find(p => p.id === state.currentPatientId);
  const file = state.currentPatientFile;
  return (patient && file) ? { patient, file } : null;
}

async function openPatientDocsMenu(){
  const cur = docsCurrentPatient();
  if(!cur) return;
  await docsLoadSettings(); // قبل أي نافذة، عشان الطباعة بعدها تبقى فورية
  const pick = await askChoice('📄 مستندات المريض', cur.patient.name + ' — اختار المستند اللي هتطلعه PDF:', [
    { value: 'braces', label: 'تعليمات التقويم' },
    { value: 'retainer', label: 'تعليمات الريتينر (بعد الفك)' },
    { value: 'appliance', label: 'انتهاء عمل جهاز متحرك' }
  ]);
  if(!pick) return;
  if(pick === 'braces') return docsPrintBraces(cur.patient);
  if(pick === 'retainer') return openRetainerDocFlow();
  return docsStartAppliance(cur.patient);
}

async function docsPrintBraces(patient){
  const s = await docsLoadSettings();
  const w = docsOpenWindow();
  if(!w) return;
  docsShow(w, docsBuildBracesHtml({ patientName: patient.name, settings: s, issued: docsFmtDate(todayStr()) }));
  docsLog('doc_braces', `طلّع تعليمات التقويم PDF لمريض ${patient.name}`);
}

// بيتنادى من كارت التثبيت (retention.js) ومن قايمة المستندات
async function openRetainerDocFlow(){
  const cur = docsCurrentPatient();
  if(!cur) return;
  const { patient, file } = cur;
  const s = await docsLoadSettings();
  const info = docsRetentionInfo(file.retention);
  if(!info){
    await alertModal(file.retention
      ? 'نوع الريتينر المسجل (مفيش / تاني) مالوش تعليمات جاهزة — اختار Essix أو Hawley أو Fixed من "تعديل" في كارت التثبيت.'
      : 'لسه ماتسجلش ريتينر للحالة دي — سجّله من كارت "التثبيت" في نظرة عامة (بعد تسجيل فك الحالة)، وبعدها اطلع التعليمات.');
    return;
  }
  const startDate = (file.retention && file.retention.deliveredDate) || file.debondDate || todayStr();
  const issued = docsFmtDate(todayStr());
  if(!info.hasRemovable){
    const w = docsOpenWindow();
    if(!w) return;
    docsShow(w, docsBuildRetainerHtml({ patientName: patient.name, info, startDate: null, schedule: null, settings: s, issued }));
    docsLog('doc_retainer', `طلّع تعليمات المثبت الثابت PDF لمريض ${patient.name}`);
    return;
  }
  docsOpenScheduleModal({
    title: '📄 جدول لبس الريتينر — ' + patient.name,
    intro: 'التواريخ بتتحسب من تاريخ تسليم الريتينر. تقدر تعدّل المدد والأيام لكل مريض.',
    startDate, phases: docsDefaultRetainerPhases(), confirmLabel: 'اطلع PDF',
    onConfirm: (cfg) => {
      const w = docsOpenWindow();
      if(!w) return;
      const schedule = docsBuildSchedule(cfg.startDate, cfg.phases);
      docsShow(w, docsBuildRetainerHtml({ patientName: patient.name, info, startDate: cfg.startDate, schedule, settings: s, issued }));
      docsLog('doc_retainer', `طلّع تعليمات الريتينر PDF لمريض ${patient.name} — بداية ${docsFmtDate(cfg.startDate)}`);
    }
  });
}

async function docsStartAppliance(patient){
  const s = await docsLoadSettings();
  docsOpenScheduleModal({
    title: '📄 انتهاء عمل جهاز متحرك — ' + patient.name,
    intro: 'حدد تاريخ البداية ومدة كل مرحلة (الافتراضي شهر لكل مرحلة، وآخر مرحلة مفتوحة).',
    startDate: todayStr(), phases: docsDefaultAppliancePhases(), confirmLabel: 'اطلع PDF',
    onConfirm: (cfg) => {
      const w = docsOpenWindow();
      if(!w) return;
      const schedule = docsBuildSchedule(cfg.startDate, cfg.phases);
      docsShow(w, docsBuildApplianceHtml({ patientName: patient.name, startDate: cfg.startDate, schedule, settings: s, issued: docsFmtDate(todayStr()) }));
      docsLog('doc_appliance', `طلّع تعليمات انتهاء جهاز متحرك PDF لمريض ${patient.name} — بداية ${docsFmtDate(cfg.startDate)}`);
    }
  });
}

// ============ إعدادات المستندات ============
async function openDocsSettingsModal(){
  const s = await docsLoadSettings();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal" style="max-width:520px;width:96%;max-height:92vh;overflow-y:auto;">
      <h3>📄 إعدادات المستندات</h3>
      <div class="placeholder" style="font-size:12px;text-align:right;padding:8px;margin-bottom:10px;">اللينكات دي بتظهر في آخر كل PDF. سيب أي لينك فاضي لو مش عايزه يظهر.</div>
      <div class="field"><label>لينك الواتساب</label><input type="text" id="dsWa" dir="ltr" value="${docsEsc(s.whatsappUrl)}" style="width:100%;"></div>
      <div class="field" style="margin-top:8px;"><label>يوزر انستجرام (أو اللينك)</label><input type="text" id="dsIg" dir="ltr" value="${docsEsc(s.instagramHandle)}" style="width:100%;"></div>
      <div class="field" style="margin-top:8px;"><label>لينك فيسبوك</label><input type="text" id="dsFb" dir="ltr" value="${docsEsc(s.facebookUrl)}" style="width:100%;"></div>
      <div class="field" style="margin-top:8px;"><label>لينك ريفيو جوجل</label><input type="text" id="dsRv" dir="ltr" value="${docsEsc(s.reviewUrl)}" style="width:100%;"></div>
      <div class="row" style="gap:10px;margin-top:8px;flex-wrap:wrap;">
        <div class="field" style="flex:1;min-width:150px;"><label>غرامة كسر أكتر من ${DOCS_MULTI_BREAK_COUNT} فصوص (جنيه)</label><input type="number" min="0" id="dsMulti" value="${docsEsc(s.multiBreakFee)}" style="width:100%;"></div>
        <div class="field" style="flex:1;min-width:150px;"><label>نسبة إعادة التركيب %</label><input type="number" min="0" max="100" id="dsRe" value="${docsEsc(s.reinstallPct)}" style="width:100%;"></div>
      </div>
      <div class="placeholder" style="font-size:12px;text-align:right;padding:8px;margin-top:10px;">غرامة الكسر المتكرر (${DOCS_REPEAT_BREAK_FEE} جنيه) ثابتة لأنها نفس الرقم اللي السيستم بيحسبه في خريطة البراكيت.</div>
      <div class="modal-actions"><button class="secondary" id="dsCancel2">إلغاء</button><button id="dsSave">حفظ</button></div>
    </div>`;
  document.body.appendChild(bg);
  const $ = (id) => bg.querySelector('#' + id);
  const close = () => bg.remove();
  $('dsCancel2').onclick = close;
  bg.onclick = (e) => { if(e.target === bg) close(); };
  $('dsSave').onclick = async () => {
    const urlOk = (v) => v === '' || /^https?:\/\//i.test(v);
    const wa = $('dsWa').value.trim(), fb = $('dsFb').value.trim(), rv = $('dsRv').value.trim();
    if(!urlOk(wa) || !urlOk(fb) || !urlOk(rv)){ toast('اللينكات لازم تبدأ بـ https://'); return; }
    const multi = parseFloat($('dsMulti').value), re = parseFloat($('dsRe').value);
    if(isNaN(multi) || multi < 0 || isNaN(re) || re < 0 || re > 100){ toast('راجع الأرقام (النسبة من 0 لـ 100)'); return; }
    const next = docsMergeSettings({ whatsappUrl: wa, instagramHandle: $('dsIg').value.trim(), facebookUrl: fb, reviewUrl: rv, multiBreakFee: multi, reinstallPct: re });
    const ok = await setData(DOCS_SETTINGS_KEY, next, { skipUndo: true });
    if(!ok) return; // setData نفسه بيعرض الرسالة
    _docsSettingsCache = next;
    docsLog('docs_settings', 'عدّل إعدادات المستندات');
    close();
    toast('اتحفظت إعدادات المستندات');
  };
}
