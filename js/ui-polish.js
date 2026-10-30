// ui-polish.js — طبقة تنسيق موحّدة: الشريط الجانبي (صورة الدكتور)، تاب الصور، مراحل العلاج، النظافة،
// التقارير، وملاحظاتي. CSS بس — مفيش منطق هنا. بتتحمل بعد كل ملفات الشاشات عشان تغلب على تنسيقاتها.
(function(){
  if(typeof document === 'undefined' || document.getElementById('uiPolishStyles')) return;
  const st = document.createElement('style');
  st.id = 'uiPolishStyles';
  st.textContent = `
  /* ===== عام ===== */
  #app .card{box-shadow:0 1px 2px rgba(80,50,35,.05);}
  #app .section-title{display:flex;align-items:center;gap:8px;font-weight:700;}
  #app .section-title::before{content:'';flex:none;width:4px;height:18px;border-radius:2px;background:var(--accent);}
  .tab-hint{font-size:12.5px;color:var(--muted);margin:-2px 0 14px;line-height:1.7;}
  #app .bracket-summary{display:flex;flex-wrap:wrap;gap:10px;}
  #app .bracket-stat:not(.due){background:var(--panel2) !important;border:1px solid var(--border);border-radius:12px !important;padding:12px 14px;}
  #app .bracket-stat .num{font-family:'Fraunces','Cairo',Georgia,serif;font-size:26px;font-weight:600;line-height:1.15;}
  #app .bracket-stat .lbl{font-size:12px;color:var(--muted);margin-top:4px;}

  /* ===== مفتاح التبويبات الفرعية (الصور + التقارير) ===== */
  #app .photo-subtabs{display:inline-flex;flex-wrap:wrap;gap:4px;padding:4px;background:var(--panel2);border:1px solid var(--border);border-radius:12px;margin-bottom:16px;}
  #app .photo-subtab{border:none !important;background:transparent !important;color:var(--muted) !important;border-radius:9px;padding:7px 14px;font-size:13px;font-weight:600;}
  #app .photo-subtab:hover{color:var(--text) !important;}
  #app .photo-subtab.active{background:var(--panel) !important;color:var(--accent2) !important;box-shadow:0 1px 3px rgba(60,40,30,.14);}
  .ps-count{display:inline-block;font-size:11px;font-weight:600;background:rgba(156,96,72,.12);color:var(--accent2);border-radius:10px;padding:1px 8px;margin-inline-start:6px;font-variant-numeric:tabular-nums;}

  /* ===== تاب الصور ===== */
  .photo-batch-zone{background:var(--panel2);border:1.5px dashed var(--border-strong,#d9c9bf) !important;border-radius:14px !important;padding:18px !important;color:var(--muted) !important;}
  .photo-batch-zone:hover{border-color:var(--accent) !important;}
  .photo-category-block{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:14px;}
  .photo-category-title{display:flex;align-items:center;gap:8px;font-size:13px !important;font-weight:700;color:var(--accent2) !important;letter-spacing:.3px;}
  .photo-category-title::before{content:'';width:4px;height:14px;border-radius:2px;background:var(--accent);}
  .photo-slot{background:var(--panel2);border:1.5px dashed var(--border) !important;border-radius:12px !important;transition:border-color .15s,box-shadow .15s;}
  .photo-slot:hover{border-color:var(--accent) !important;}
  .photo-slot:has(.photo-slot-thumb-wrap){background:var(--panel);border-style:solid !important;padding:8px;}
  .photo-slot:has(.photo-slot-thumb-wrap):hover{box-shadow:0 3px 10px rgba(80,50,35,.12);}
  .photo-slot-thumb{border-radius:8px !important;height:96px !important;}
  .photo-slot-label{font-weight:600;color:var(--text) !important;}
  .photo-timeline-pt{font-weight:600;}
  .photo-timeline-pt.active{background:var(--accent) !important;color:#fff !important;}

  /* ===== مراحل العلاج ===== */
  .stage-group-title{display:flex;align-items:center;gap:8px;}
  .stage-group-title::before{content:'';width:4px;height:14px;border-radius:2px;background:var(--accent);}
  .stage-grid{gap:12px;}
  .stage-card{box-shadow:0 1px 2px rgba(80,50,35,.05);transition:box-shadow .15s,transform .15s;}
  .stage-card:hover{box-shadow:0 4px 12px rgba(80,50,35,.12);}
  .stage-card .stage-count{font-family:'Fraunces','Cairo',Georgia,serif;font-weight:600;color:var(--accent2);min-width:32px;text-align:center;background:var(--panel2);border-radius:10px;padding:2px 8px;}
  .stage-name{font-size:14px;}

  /* ===== نظافة الأسنان ===== */
  .hygiene-list{display:flex;flex-direction:column;gap:0;}
  .hygiene-row{background:var(--panel) !important;margin-bottom:6px !important;transition:background .12s;}
  .hygiene-row:hover{background:var(--panel2) !important;}
  .hyg-trend-card{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:14px;}
  .hyg-trend-lbl{font-size:12px;color:var(--muted);margin-bottom:8px;}
  .hyg-trend{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
  .hyg-dot{width:16px;height:16px;border-radius:50%;display:inline-block;}
  .hyg-dot.hyg-excellent{background:var(--green);}
  .hyg-dot.hyg-good{background:var(--accent);}
  .hyg-dot.hyg-fair{background:var(--yellow);}
  .hyg-dot.hyg-poor{background:var(--red);}

  /* ===== التقارير ===== */
  .rep-head{padding:16px 18px;}
  .rep-head-top{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
  .rep-title{font-family:'Fraunces','Cairo',Georgia,serif;font-size:22px;font-weight:600;}
  .rep-sub{font-size:13.5px;color:var(--muted);}
  .rep-controls{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
  .rep-controls .photo-subtabs{margin-bottom:0;}
  .rep-body .card{padding:16px 18px;}
  .rep-body .card > .lbl{font-weight:700;font-size:12.5px;color:var(--accent2);margin-top:12px;}
  .rep-body .stage-tags .stage-date-chip{border-radius:20px;padding:4px 12px;font-size:12.5px;background:var(--panel2);}
  .rep-body table{width:100%;border-collapse:separate;border-spacing:0;}
  .rep-body th{font-size:12px;font-weight:600;color:var(--muted);text-align:start;padding:10px 12px;background:var(--panel2);border-bottom:1px solid var(--border);white-space:nowrap;}
  .rep-body td{padding:10px 12px;border-bottom:1px solid var(--border);font-size:13.5px;font-variant-numeric:tabular-nums;}
  .rep-body tr:last-child td{border-bottom:none;}
  .rep-body tr.reports-clinic-row:hover td{background:var(--panel2);}
  @media (max-width:720px){ .rep-body .card{overflow-x:auto;} }

  /* ===== ملاحظاتي ===== */
  .notes-title{font-family:'Fraunces','Cairo',Georgia,serif;font-size:22px;font-weight:600;}
  #app [data-otype]{border-radius:20px !important;font-size:12.5px;padding:6px 14px;}
  .note-card{transition:box-shadow .15s;}
  .note-card:hover{box-shadow:0 4px 12px rgba(80,50,35,.10);}

  /* ===== الشريط الجانبي: صورة الدكتور + اسمه ===== */
  .side-brand.side-doctor{gap:4px;padding:6px 10px 16px;}
  .side-doc-avatar{background:transparent !important;border:none !important;padding:0 !important;border-radius:50%;cursor:pointer;line-height:0;}
  .side-doc-avatar .p-avatar{border:3px solid var(--panel2);box-shadow:0 0 0 1px var(--border);}
  .side-brand.side-doctor .p-avatar img{height:100%;width:100%;}
  .side-doc-name{font-family:'Fraunces','Cairo',Georgia,serif;font-weight:600;font-size:15px;text-align:center;margin-top:8px;color:var(--text);line-height:1.3;}
  .side-doc-sub{font-size:11px;font-weight:600;letter-spacing:1.2px;color:var(--muted);text-transform:uppercase;direction:ltr;}
  .side-foot{order:9;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:6px;padding:10px 6px 2px;border-top:1px solid var(--border);opacity:.85;}
  .side-foot img{height:26px;width:auto;display:block;}
  .side-foot span{font-size:10.5px;font-weight:600;color:var(--muted);letter-spacing:.4px;direction:ltr;}
  @media (min-width:721px){ #appTopbar.app-topbar{padding-bottom:250px;} }
  @media (max-width:720px){ .side-foot{display:none;} }

  /* ===== توافق الموبايل ===== */
  html{-webkit-text-size-adjust:100%;}
  img,video,canvas{max-width:100%;}
  button,.tab,.photo-subtab,.app-topbar-tab,.at-chip{touch-action:manipulation;-webkit-tap-highlight-color:transparent;}
  @media (max-width:720px){
    body{overflow-x:hidden;}
    /* 16px على الموبايل: iOS بيكبّر الصفحة لوحده لما الخانة أصغر من كده */
    input[type=text],input[type=number],input[type=date],input[type=month],input[type=search],input[type=tel],input[type=email],input[type=password],textarea,select{font-size:16px !important;}
    /* مساحة آمنة للنوتش وشريط الحالة */
    .app-util-bar{top:calc(8px + env(safe-area-inset-top,0px));}
    .app{padding-top:calc(84px + env(safe-area-inset-top,0px));}
    #app .tabs{top:calc(80px + env(safe-area-inset-top,0px));}
    /* أهداف لمس مريحة */
    .modal-actions button,.dash-section-actions button,.rep-controls button,.row > button{min-height:42px;}
    #app button.small{min-height:36px;padding:7px 12px;}
    #app .tab{padding:12px 14px;}
    #app .photo-subtab{padding:9px 12px;}
    /* الجداول تتحرك أفقيًا جوه الكارت بدل ما توسّع الصفحة */
    #app table{display:block;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;}
    #app .card{padding:14px;}
    /* الداشبورد */
    .dash-hero{align-items:flex-start;}
    .dash-who{width:100%;}
    .dash-date{text-align:start !important;}
    /* التقارير */
    .rep-controls{flex-direction:column;align-items:stretch;}
    .rep-controls .photo-subtabs{display:flex;width:100%;}
    .rep-controls .photo-subtab{flex:1;text-align:center;padding:9px 6px;}
    .rep-controls select,.rep-controls input{width:100%;}
    .rep-controls .row{width:100%;}
    .rep-controls .row > *{flex:1 1 100%;}
    .rep-title{font-size:19px;}
    /* الصور: عمودين */
    .photo-slots-grid{grid-template-columns:repeat(2,minmax(0,1fr)) !important;}
    .photo-slot-thumb{height:110px !important;}
    #app .photo-subtabs{display:flex;width:100%;}
    #app .photo-subtabs .photo-subtab{flex:1;text-align:center;}
    .photo-category-block{padding:12px;}
    /* المراحل والأرقام */
    .stage-grid{grid-template-columns:1fr;}
    #app .bracket-stat:not(.due){flex:1 1 calc(50% - 10px);min-width:0 !important;}
    #app .bracket-stat .num{font-size:22px;}
    /* الملاحظات */
    #orthoNotesSearch{min-width:0 !important;width:100%;}
    .notes-title{font-size:19px;}
    .note-card .row{flex-wrap:wrap;}
    /* النوافذ */
    .modal input,.modal select,.modal textarea{max-width:100%;}
  }
  @media (max-width:480px){
    .app{padding-top:calc(112px + env(safe-area-inset-top,0px));}
    .rep-head{padding:14px;}
    #app .bracket-stat:not(.due){flex:1 1 100%;}
  }
  `;
  document.head.appendChild(st);
})();
