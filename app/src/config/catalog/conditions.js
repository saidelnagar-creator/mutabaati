// التصنيفات والحالات المصاحبة. نوع السكر صفة في ملف المريض؛ الحالات المصاحبة «حالات» لها تاريخ بداية ونهاية
// (الحمل مثلاً ينتهي بالولادة) وتفاصيل تؤثر على اختيار الأدوية والتنبيهات.
// أكواد ICD-10 (WHO، ومن ICD-10-CM حيث يلزم) — تظهر أو تُخفى من الإعدادات. المعرّفات ثابتة للأبد.

export const DM_TYPES = [
  { id: 'T2', label: 'Type 2 diabetes', ar: 'سكر نوع تاني', icd: 'E11' },
  { id: 'T1', label: 'Type 1 diabetes', ar: 'سكر نوع أول', icd: 'E10' },
  { id: 'LADA', label: 'LADA (autoimmune, adult onset)', ar: 'LADA', icd: 'E10' },
  { id: 'GDM', label: 'Gestational diabetes', ar: 'سكر الحمل', icd: 'O24.4' },
  { id: 'MODY', label: 'MODY (monogenic)', ar: 'MODY', icd: 'E13' },
  { id: '3c', label: 'Pancreatogenic (type 3c)', ar: 'سكر بنكرياسي', icd: 'E13' },
  { id: 'drug', label: 'Drug-induced (e.g. steroid)', ar: 'سكر دوائي (كورتيزون…)', icd: 'E13' },
  { id: 'PTDM', label: 'Post-transplant diabetes', ar: 'سكر بعد زرع', icd: 'E13' },
  { id: 'pre', label: 'Prediabetes (IFG/IGT/HbA1c 5.7–6.4%)', ar: 'ما قبل السكر', icd: 'R73.03' },
  { id: 'other', label: 'Other specified diabetes', ar: 'نوع آخر', icd: 'E13' },
  { id: 'none', label: 'No diabetes', ar: 'مفيش سكر', icd: '' },
];
export const T1_STAGES = [
  { id: '1', label: 'Stage 1 (≥2 autoantibodies, normoglycemia)' },
  { id: '2', label: 'Stage 2 (autoantibodies + dysglycemia)' },
  { id: '3', label: 'Stage 3 (clinical)' },
];
// أنواع لها طبيعة «نقص إنسولين» (لتنبيهات SGLT2i/DKA).
export const INSULIN_DEFICIENT_TYPES = ['T1', 'LADA', '3c'];
export const DIABETES_TYPES = DM_TYPES.filter((t) => !['pre', 'none'].includes(t.id)).map((t) => t.id);

export const CONDITION_GROUPS = Object.freeze({
  pregnancy: 'الحمل والرضاعة',
  renal: 'الكلى',
  liver: 'الكبد',
  cardio: 'القلب والأوعية',
  dmcomp: 'مضاعفات السكر',
  risk: 'تاريخ مرضي يؤثر على الأدوية',
  endo: 'غدد أخرى',
  other: 'أخرى',
});

const YN = [
  { v: 'yes', l: 'نعم' },
  { v: 'no', l: 'لا' },
];
const sel = (key, label, opts) => ({ key, label, type: 'select', options: opts.map((o) => (typeof o === 'string' ? { v: o, l: o } : o)) });

export const CONDITIONS = [
  // الحمل والرضاعة
  { id: 'pregnancy', label: 'Pregnancy', ar: 'حامل', group: 'pregnancy', icd: 'Z33', fields: [{ key: 'lmp', label: 'أول يوم آخر دورة (LMP)', type: 'date' }, { key: 'edd', label: 'الموعد المتوقع للولادة (EDD)', type: 'date' }], endLabel: 'تاريخ الولادة/انتهاء الحمل' },
  { id: 'lactation', label: 'Lactation', ar: 'رضاعة', group: 'pregnancy', icd: 'Z39.1' },
  { id: 'planning-pregnancy', label: 'Planning pregnancy', ar: 'بتخطط للحمل', group: 'pregnancy', icd: '' },
  // الكلى
  { id: 'ckd', label: 'Chronic kidney disease', ar: 'مرض كلى مزمن', group: 'renal', icd: 'N18', fields: [sel('g', 'مرحلة G (يدوي)', ['G1', 'G2', 'G3a', 'G3b', 'G4', 'G5']), sel('a', 'مرحلة A', ['A1', 'A2', 'A3']), sel('dialysis', 'على غسيل', YN), sel('transplant', 'زراعة كلى', YN)], hint: 'المرحلة بتتحسب تلقائياً من eGFR و UACR — اليدوي للتوثيق' },
  { id: 'aki-history', label: 'History of AKI', ar: 'تاريخ فشل كلوي حاد', group: 'renal', icd: 'N17' },
  // الكبد
  { id: 'masld', label: 'MASLD (steatotic liver disease)', ar: 'دهون على الكبد (MASLD)', group: 'liver', icd: 'K76.0', fields: [sel('fibrosis', 'درجة التليف', ['F0', 'F1', 'F2', 'F3', 'F4']), { key: 'lsm', label: 'Fibroscan LSM (kPa)', type: 'number' }] },
  { id: 'mash', label: 'MASH (steatohepatitis)', ar: 'التهاب كبد دهني (MASH)', group: 'liver', icd: 'K75.81', fields: [sel('fibrosis', 'درجة التليف', ['F0', 'F1', 'F2', 'F3', 'F4'])] },
  { id: 'cirrhosis', label: 'Liver cirrhosis', ar: 'تليف كبد', group: 'liver', icd: 'K74.6', fields: [sel('childPugh', 'Child-Pugh', ['A', 'B', 'C']), sel('decompensated', 'غير معاوض (استسقاء/دوالي نازفة/غيبوبة)', YN), { key: 'etiology', label: 'السبب', type: 'text' }] },
  { id: 'hbv', label: 'Chronic hepatitis B', ar: 'فيروس B مزمن', group: 'liver', icd: 'B18.1' },
  { id: 'hcv', label: 'Chronic hepatitis C', ar: 'فيروس C', group: 'liver', icd: 'B18.2', fields: [sel('treated', 'اتعالج (SVR)', YN)] },
  // القلب
  { id: 'hf', label: 'Heart failure', ar: 'هبوط قلب (HF)', group: 'cardio', icd: 'I50', fields: [sel('type', 'النوع', ['HFrEF', 'HFmrEF', 'HFimpEF', 'HFpEF']), sel('nyha', 'NYHA', ['I', 'II', 'III', 'IV']), { key: 'ef', label: 'EF %', type: 'number' }, sel('status', 'الحالة', [{ v: 'stable', l: 'مستقر' }, { v: 'decompensated', l: 'غير مستقر/حاد' }])] },
  { id: 'cad', label: 'Coronary artery disease', ar: 'قصور شرايين تاجية (CAD)', group: 'cardio', icd: 'I25', fields: [sel('mi', 'جلطة قلب سابقة', YN), sel('revasc', 'دعامة/تحويل مسار', YN)] },
  { id: 'stroke', label: 'Stroke / TIA', ar: 'جلطة مخ / TIA', group: 'cardio', icd: 'I63', fields: [sel('type', 'النوع', [{ v: 'ischemic', l: 'إقفارية' }, { v: 'hemorrhagic', l: 'نزفية' }, { v: 'tia', l: 'TIA' }])] },
  { id: 'pad', label: 'Peripheral artery disease', ar: 'قصور شرايين طرفية (PAD)', group: 'cardio', icd: 'I73.9' },
  { id: 'htn', label: 'Hypertension', ar: 'ضغط مرتفع', group: 'cardio', icd: 'I10' },
  { id: 'dyslipidemia', label: 'Dyslipidemia', ar: 'دهون مرتفعة', group: 'cardio', icd: 'E78.5' },
  { id: 'af', label: 'Atrial fibrillation', ar: 'رجفان أذيني (AF)', group: 'cardio', icd: 'I48' },
  { id: 'qt', label: 'Long QT / arrhythmia risk', ar: 'QT طويل / اضطراب نظم', group: 'cardio', icd: 'I45.81' },
  // مضاعفات السكر
  { id: 'retinopathy', label: 'Diabetic retinopathy', ar: 'اعتلال الشبكية', group: 'dmcomp', icd: 'H36.0', fields: [sel('grade', 'الدرجة', [{ v: 'mild', l: 'Mild NPDR' }, { v: 'moderate', l: 'Moderate NPDR' }, { v: 'severe', l: 'Severe NPDR' }, { v: 'pdr', l: 'PDR' }]), sel('dme', 'وذمة بقعية (DME)', YN), sel('treated', 'العلاج', [{ v: 'none', l: 'لا' }, { v: 'laser', l: 'ليزر' }, { v: 'antivegf', l: 'حقن Anti-VEGF' }, { v: 'surgery', l: 'جراحة' }])] },
  { id: 'neuropathy', label: 'Diabetic neuropathy', ar: 'اعتلال الأعصاب', group: 'dmcomp', icd: 'G63.2', fields: [sel('type', 'النوع', [{ v: 'peripheral', l: 'طرفي' }, { v: 'autonomic', l: 'ذاتي' }, { v: 'both', l: 'الاتنين' }]), sel('painful', 'مؤلم', YN)] },
  { id: 'foot', label: 'Diabetic foot (at risk/ulcer/amputation)', ar: 'قدم سكري', group: 'dmcomp', icd: 'E11.62', fields: [sel('status', 'الحالة', [{ v: 'risk', l: 'عالي الخطورة' }, { v: 'ulcer', l: 'قرحة نشطة' }, { v: 'healed', l: 'قرحة سابقة' }, { v: 'amputation', l: 'بتر' }, { v: 'charcot', l: 'Charcot' }])] },
  { id: 'gastroparesis', label: 'Gastroparesis', ar: 'بطء تفريغ المعدة', group: 'dmcomp', icd: 'K31.84' },
  { id: 'ed', label: 'Erectile dysfunction', ar: 'ضعف انتصاب', group: 'dmcomp', icd: 'N52' },
  // تاريخ يؤثر على الأدوية
  { id: 'mtc-men2', label: 'Personal/family history of MTC or MEN2', ar: 'تاريخ MTC أو MEN2 (شخصي/عائلي)', group: 'risk', icd: 'Z80.8', fields: [sel('who', 'التاريخ', [{ v: 'personal', l: 'شخصي' }, { v: 'family', l: 'عائلي' }])] },
  { id: 'pancreatitis', label: 'History of pancreatitis', ar: 'تاريخ التهاب بنكرياس', group: 'risk', icd: 'K85', fields: [sel('type', 'النوع', [{ v: 'acute', l: 'حاد' }, { v: 'chronic', l: 'مزمن' }])] },
  { id: 'dka-history', label: 'History of DKA', ar: 'تاريخ DKA', group: 'risk', icd: 'E11.1' },
  { id: 'severe-hypo', label: 'Severe hypoglycemia / unawareness', ar: 'هبوط شديد أو عدم الإحساس بالهبوط', group: 'risk', icd: 'E16.2' },
  { id: 'bladder-cancer', label: 'Bladder cancer (active or history)', ar: 'سرطان مثانة', group: 'risk', icd: 'C67' },
  { id: 'osteoporosis', label: 'Osteoporosis / fragility fractures', ar: 'هشاشة عظام / كسور', group: 'risk', icd: 'M81' },
  { id: 'gu-infections', label: 'Recurrent genital/urinary infections', ar: 'التهابات بولية/تناسلية متكررة', group: 'risk', icd: 'N39.0' },
  { id: 'surgery-planned', label: 'Planned surgery / procedure', ar: 'عملية أو منظار مخطط', group: 'risk', icd: '', fields: [{ key: 'date', label: 'ميعاد العملية', type: 'date' }] },
  { id: 'alcohol', label: 'Alcohol use', ar: 'كحول', group: 'risk', icd: 'F10' },
  { id: 'smoking', label: 'Smoking', ar: 'تدخين', group: 'risk', icd: 'F17' },
  { id: 'frailty', label: 'Frailty / limited life expectancy', ar: 'ضعف عام / متوسط عمر محدود', group: 'risk', icd: 'R54' },
  { id: 'cognitive', label: 'Cognitive impairment', ar: 'ضعف إدراك', group: 'risk', icd: 'F06.7' },
  // غدد أخرى (تفاصيلها في المراحل القادمة)
  { id: 'hypothyroid', label: 'Hypothyroidism', ar: 'خمول الغدة الدرقية', group: 'endo', icd: 'E03.9' },
  { id: 'hyperthyroid', label: 'Hyperthyroidism', ar: 'نشاط الغدة الدرقية', group: 'endo', icd: 'E05.9' },
  { id: 'obesity', label: 'Obesity', ar: 'سمنة', group: 'endo', icd: 'E66', hint: 'الدرجة بتتحسب من BMI' },
  { id: 'osa', label: 'Obstructive sleep apnea', ar: 'انقطاع النفس أثناء النوم', group: 'other', icd: 'G47.33' },
  { id: 'cancer', label: 'Active cancer', ar: 'ورم نشط', group: 'other', icd: 'C80', fields: [{ key: 'site', label: 'المكان/النوع', type: 'text' }] },
  { id: 'steroids', label: 'Chronic glucocorticoid therapy', ar: 'كورتيزون مزمن', group: 'other', icd: 'Z79.52' },
];

export const ASCVD_CODES = ['cad', 'stroke', 'pad'];
