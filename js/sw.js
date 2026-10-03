// sw.js — Service Worker لتطبيق Orenda (PWA).
// الاستراتيجية: "الشبكة أولًا" لملفات البرنامج نفسها (index.html + js/*) — يعني طول ما النت شغال
// بتاخد آخر نسخة دايمًا (مهم عشان تحديثات الكود تظهر فورًا ومتفضلش نسخة قديمة عالقة في الكاش)،
// ولو النت فاصل بيفتح البرنامج من آخر نسخة اتخزنت. الطلبات لأي موقع تاني (Supabase / الصور /
// Anthropic / الخطوط) مش بتعدّي من هنا خالص، فمفيش بيانات مرضى أو صور بتتخزن في الكاش.
// لما تغيّر قايمة الملفات أو عايز تفرض تنضيف كاش قديم، زوّد رقم CACHE_VERSION.

const CACHE_VERSION = 'orenda-v1';
const APP_SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "js/storage.js",
  "js/auth.js",
  "js/backup.js",
  "js/modals.js",
  "js/money-utils.js",
  "js/inventory-deduct.js",
  "js/audit-log.js",
  "js/trash.js",
  "js/state.js",
  "js/clinic-features.js",
  "js/appointment-reminders.js",
  "js/data-loading.js",
  "js/month-closing.js",
  "js/render-core.js",
  "js/clinics-view.js",
  "js/patients-view.js",
  "js/reports-view.js",
  "js/ortho-notes.js",
  "js/inventory-view.js",
  "js/patient-shell.js",
  "js/photos-tab.js",
  "js/photo-editor.js",
  "js/photo-lightbox.js",
  "js/content-queue.js",
  "js/diagnosis-photo-dock.js",
  "js/followup-tab.js",
  "js/keyword-deduction.js",
  "js/wire-accessories-modal.js",
  "js/bonding-newcase.js",
  "js/retention.js",
  "js/hygiene-stages-bracketmap.js",
  "js/advanced-stage-keywords.js",
  "js/diagnosis-tab.js",
  "js/webceph-import.js",
  "js/finance-tab.js",
  "js/main.js"
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // واحد واحد — لو ملف واحد مش موجود مايبوّظش تثبيت الباقي
    await Promise.all(APP_SHELL.map(async (url) => {
      try{ await cache.add(new Request(url, { cache: 'reload' })); }
      catch(e){ console.warn('sw precache skipped', url, e); }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return; // Supabase / Anthropic / fonts — من غير تدخل
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    try{
      const fresh = await fetch(req);
      if(fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    }catch(e){
      const cached = await cache.match(req, { ignoreSearch: true });
      if(cached) return cached;
      if(req.mode === 'navigate'){
        const shell = await cache.match('index.html') || await cache.match('./');
        if(shell) return shell;
      }
      throw e;
    }
  })());
});
