// المتابعات الدورية (الفحوصات المطلوبة كل فترة) والأهداف العلاجية. كل الأرقام قابلة للتعديل من الواجهة
// (المتابعات: الإعدادات؛ الأهداف: لكل مريض أو الافتراضي).
// المراجع: ADA Standards of Care 2026 (§4, §6, §7, §10, §11, §12, §13, §15)، International Consensus on Time in Range (2019).

// when: متى ينطبق البند — dm (أي نوع سكر)، T1، T2، metformin (على ميتفورمين)، ras (على ACEi/ARB/MRA/finerenone).
// months: الافتراضي. monthsAlt: فترة بديلة حسب شرط (بتختارها الدالة في core/screening.js).
export const SCREENING = [
  { id: 'a1c', title: 'HbA1c', tests: ['a1c'], months: 6, monthsAlt: 3, altWhen: 'above-target', when: 'dm', note: 'كل 3 شهور لو فوق الهدف أو اتغير العلاج، وكل 6 لو مستقر على الهدف' },
  { id: 'egfr', title: 'كرياتينين / eGFR', tests: ['creat', 'egfr_lab'], months: 12, monthsAlt: 6, altWhen: 'ckd', when: 'dm', note: 'أكتر مع CKD (G3: كل 6 شهور، G4: كل 3)' },
  { id: 'uacr', title: 'UACR (ألبومين البول)', tests: ['uacr', 'ualb'], months: 12, monthsAlt: 6, altWhen: 'ckd', when: 'dm', note: 'سنوياً؛ أكتر مع الألبومين أو CKD' },
  { id: 'lipid', title: 'الدهون', tests: ['ldl', 'tc'], months: 12, when: 'dm', note: 'عند التشخيص وقبل/بعد الستاتين ثم سنوياً' },
  { id: 'liver', title: 'ALT/AST + PLT (FIB-4)', tests: ['alt'], months: 12, when: 'T2', note: 'فحص MASLD بـ FIB-4 لمرضى النوع التاني' },
  { id: 'eye', title: 'فحص قاع العين', exam: 'fundus', months: 12, monthsAlt: 24, altWhen: 'no-retinopathy-controlled', when: 'dm', note: 'سنوياً؛ كل 1–2 سنة لو مفيش اعتلال والسكر منضبط. النوع الأول: بعد 5 سنين من التشخيص' },
  { id: 'foot', title: 'فحص القدم الشامل', exam: 'foot', months: 12, monthsAlt: 3, altWhen: 'foot-risk', when: 'dm', note: 'سنوياً؛ كل زيارة تقريباً لو عالي الخطورة' },
  { id: 'b12', title: 'Vitamin B12', tests: ['b12'], months: 12, when: 'metformin', note: 'دورياً مع الميتفورمين الطويل' },
  { id: 'k', title: 'البوتاسيوم', tests: ['k'], months: 6, when: 'ras', note: 'مع ACEi/ARB/MRA/finerenone' },
  { id: 'tsh', title: 'TSH', tests: ['tsh'], months: 24, when: 'T1', note: 'النوع الأول: كل 1–2 سنة (أمراض مناعية مصاحبة)' },
];

// أهداف السكر. القيم الرقمية mg/dL و %. null = مفيش هدف رقمي (تجنّب الاعتماد عليه).
export const TARGET_PROFILES = [
  { id: 'standard', ar: 'عادي (أغلب البالغين)', a1c: 7.0, fpg: [80, 130], ppg: 180, bed: null, cgm: { tir: 70, tbr: 4, tbr2: 1, tar: 25, tar2: 5, cv: 36 }, note: 'أقل من 6.5% ممكن لو آمن بدون هبوط' },
  { id: 'tight', ar: 'أشد (لو آمن)', a1c: 6.5, fpg: [80, 130], ppg: 160, bed: null, cgm: { tir: 70, tbr: 4, tbr2: 1, tar: 25, tar2: 5, cv: 36 }, note: 'مريض صغير، مدة قصيرة، بدون أمراض قلب، وبدون هبوط' },
  { id: 'older-healthy', ar: 'كبير سن بصحة جيدة', a1c: 7.5, fpg: [80, 130], ppg: 180, bed: [80, 180], cgm: { tir: 70, tbr: 4, tbr2: 1, tar: 25, tar2: 5, cv: 36 }, note: 'ADA: < 7.0–7.5%' },
  { id: 'older-complex', ar: 'كبير سن مع أمراض متعددة', a1c: 8.0, fpg: [90, 150], ppg: 200, bed: [100, 180], cgm: { tir: 50, tbr: 1, tbr2: 1, tar: 50, tar2: 10, cv: 36 }, note: 'ADA: < 8.0%' },
  { id: 'older-very-complex', ar: 'حالة صحية متدهورة/متوسط عمر محدود', a1c: null, fpg: [100, 180], ppg: null, bed: [110, 200], cgm: { tir: 50, tbr: 1, tbr2: 1, tar: 50, tar2: 10, cv: 36 }, note: 'تجنّب الاعتماد على HbA1c؛ الهدف تجنّب الهبوط والأعراض' },
  { id: 'pregnancy', ar: 'حمل (سكر سابق للحمل)', a1c: 6.0, fpg: [70, 95], ppg: 120, ppg1: 140, bed: null, cgm: { tir: 70, tbr: 4, tbr2: 1, tar: 25, tar2: null, cv: 36, range: [63, 140] }, note: 'HbA1c < 6% لو بدون هبوط (لحد 7%). بعد الأكل: ساعة < 140 أو ساعتين < 120. CGM (النوع الأول): 63–140' },
  { id: 'gdm', ar: 'سكر الحمل', a1c: null, fpg: [70, 95], ppg: 120, ppg1: 140, bed: null, cgm: null, note: 'صايم < 95، ساعة بعد الأكل < 140 أو ساعتين < 120' },
];

export const BP_TARGET = { sbp: 130, dbp: 80 }; // ADA §10 لأغلب مرضى السكر

// خانات قراءات السكر المنزلية (SMBG).
export const SMBG_SLOTS = [
  { id: 'fasting', ar: 'صايم', en: 'Fasting', kind: 'fasting' },
  { id: 'postB', ar: 'بعد الفطار', en: 'Post-breakfast', kind: 'post' },
  { id: 'preL', ar: 'قبل الغدا', en: 'Pre-lunch', kind: 'pre' },
  { id: 'postL', ar: 'بعد الغدا', en: 'Post-lunch', kind: 'post' },
  { id: 'preD', ar: 'قبل العشا', en: 'Pre-dinner', kind: 'pre' },
  { id: 'postD', ar: 'بعد العشا', en: 'Post-dinner', kind: 'post' },
  { id: 'bed', ar: 'قبل النوم', en: 'Bedtime', kind: 'bed' },
  { id: 'night', ar: 'الفجر/بالليل', en: 'Night (3 am)', kind: 'night' },
  { id: 'random', ar: 'عشوائي', en: 'Random', kind: 'random' },
];

// مستويات الهبوط (ADA §6).
export const HYPO_LEVELS = [
  { id: 1, ar: 'مستوى 1: أقل من 70 و ≥ 54', en: 'Level 1 (54–69 mg/dL)' },
  { id: 2, ar: 'مستوى 2: أقل من 54', en: 'Level 2 (<54 mg/dL)' },
  { id: 3, ar: 'مستوى 3: شديد (احتاج مساعدة)', en: 'Level 3 (severe, needed assistance)' },
];
export const HYPO_CAUSES = { meal: 'تأخير/تفويت وجبة', exercise: 'مجهود', dose: 'جرعة زيادة/غلط', alcohol: 'كحول', illness: 'مرض/قيء', fasting: 'صيام', unknown: 'غير معروف', other: 'سبب آخر' };

// أنواع الفحوصات غير المعملية.
export const EXAMS = [
  { id: 'fundus', ar: 'فحص قاع العين', fields: [{ key: 'grade', label: 'Retinopathy', type: 'select', options: [{ v: 'none', l: 'No DR' }, { v: 'mild', l: 'Mild NPDR' }, { v: 'moderate', l: 'Moderate NPDR' }, { v: 'severe', l: 'Severe NPDR' }, { v: 'pdr', l: 'PDR' }] }, { key: 'dme', label: 'DME', type: 'select', options: [{ v: 'no', l: 'لا' }, { v: 'yes', l: 'نعم' }] }] },
  { id: 'foot', ar: 'فحص القدم', fields: [{ key: 'mono', label: 'Monofilament (10 g)', type: 'select', options: [{ v: 'normal', l: 'طبيعي' }, { v: 'reduced', l: 'ضعيف/مفقود' }] }, { key: 'pulses', label: 'النبض', type: 'select', options: [{ v: 'present', l: 'موجود' }, { v: 'reduced', l: 'ضعيف/غير محسوس' }] }, { key: 'deformity', label: 'تشوه', type: 'select', options: [{ v: 'no', l: 'لا' }, { v: 'yes', l: 'نعم' }] }, { key: 'ulcer', label: 'قرحة', type: 'select', options: [{ v: 'no', l: 'لا' }, { v: 'active', l: 'نشطة' }, { v: 'history', l: 'سابقة/بتر' }] }, { key: 'risk', label: 'IWGDF risk', type: 'select', options: [{ v: '0', l: '0 (very low)' }, { v: '1', l: '1 (low)' }, { v: '2', l: '2 (moderate)' }, { v: '3', l: '3 (high)' }] }] },
  { id: 'ecg', ar: 'رسم قلب', fields: [{ key: 'qtc', label: 'QTc (ms)', type: 'number' }] },
  { id: 'echo', ar: 'إيكو', fields: [{ key: 'ef', label: 'EF %', type: 'number' }] },
  { id: 'fibroscan', ar: 'Fibroscan', fields: [{ key: 'lsm', label: 'LSM (kPa)', type: 'number' }, { key: 'cap', label: 'CAP (dB/m)', type: 'number' }] },
  { id: 'us', ar: 'سونار', fields: [] },
  { id: 'dexa', ar: 'DEXA', fields: [{ key: 't', label: 'أقل T-score', type: 'number' }] },
  { id: 'other', ar: 'فحص آخر', fields: [] },
];
