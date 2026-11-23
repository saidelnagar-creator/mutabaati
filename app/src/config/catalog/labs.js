// قائمة التحاليل الافتراضية: الوحدة الأساسية (زي معامل مصر غالباً) + وحدات بديلة بمعامل تحويل + مدى مرجعي افتراضي.
// المدى المرجعي يختلف من معمل لمعمل: كله قابل للتعديل من الواجهة (المزيد ← التحاليل) ويُحفظ كـ «تعديل» فوق هذه القيم.
// التحويل: القيمة بالوحدة البديلة = القيمة الأساسية × f + (o أو 0).
// معرّفات التحاليل ثابتة للأبد (مخزنة في النتائج). أضف ولا تحذف.

const R = (lo, hi) => ({ lo, hi });
const S = (m, f) => ({ M: m, F: f });

export const LAB_CATEGORIES = Object.freeze({
  glycemic: 'السكر',
  renal: 'الكلى',
  urine: 'البول',
  liver: 'الكبد',
  lipid: 'الدهون',
  cbc: 'صورة الدم',
  electrolytes: 'الأملاح',
  thyroid: 'الغدة الدرقية',
  pancreas: 'أجسام مضادة / وظيفة البنكرياس',
  vitamins: 'فيتامينات وحديد',
  other: 'أخرى',
});

// dp: عدد الخانات العشرية في العرض. text: نتيجة وصفية (اختيار من options أو نص).
export const LAB_TESTS = [
  // ----- السكر -----
  { id: 'fbg', name: 'Fasting blood glucose', abbr: 'FBG', cat: 'glycemic', unit: 'mg/dL', units: [{ u: 'mmol/L', f: 0.0555 }], dp: 0, ref: R(70, 99) },
  { id: 'ppg2', name: '2-h postprandial glucose', abbr: '2hPP', cat: 'glycemic', unit: 'mg/dL', units: [{ u: 'mmol/L', f: 0.0555 }], dp: 0, ref: R(70, 139) },
  { id: 'rbg', name: 'Random blood glucose', abbr: 'RBG', cat: 'glycemic', unit: 'mg/dL', units: [{ u: 'mmol/L', f: 0.0555 }], dp: 0, ref: R(70, 139) },
  { id: 'a1c', name: 'HbA1c', abbr: 'HbA1c', cat: 'glycemic', unit: '%', units: [{ u: 'mmol/mol', f: 10.929, o: -23.497 }], dp: 1, ref: R(4, 5.6) },
  { id: 'fruct', name: 'Fructosamine', abbr: 'Fructosamine', cat: 'glycemic', unit: 'µmol/L', units: [], dp: 0, ref: R(200, 285) },
  { id: 'ogtt2', name: 'OGTT 2-h (75 g)', abbr: 'OGTT-2h', cat: 'glycemic', unit: 'mg/dL', units: [{ u: 'mmol/L', f: 0.0555 }], dp: 0, ref: R(0, 139) },
  { id: 'insulin', name: 'Fasting insulin', abbr: 'Insulin', cat: 'pancreas', unit: 'µIU/mL', units: [{ u: 'pmol/L', f: 6 }], dp: 1, ref: R(2, 25) },
  { id: 'cpep', name: 'C-peptide', abbr: 'C-peptide', cat: 'pancreas', unit: 'ng/mL', units: [{ u: 'nmol/L', f: 0.331 }, { u: 'pmol/L', f: 331 }], dp: 2, ref: R(0.8, 3.1) },
  { id: 'gad', name: 'Anti-GAD65 antibodies', abbr: 'GAD65 Ab', cat: 'pancreas', unit: 'IU/mL', units: [], dp: 1, ref: R(0, 5), note: 'المدى يختلف حسب طريقة المعمل' },
  { id: 'ia2', name: 'Anti-IA-2 antibodies', abbr: 'IA-2 Ab', cat: 'pancreas', unit: 'U/mL', units: [], dp: 1, ref: R(0, 7.5), note: 'المدى يختلف حسب طريقة المعمل' },
  { id: 'znt8', name: 'Anti-ZnT8 antibodies', abbr: 'ZnT8 Ab', cat: 'pancreas', unit: 'U/mL', units: [], dp: 1, ref: R(0, 15), note: 'المدى يختلف حسب طريقة المعمل' },
  { id: 'bhb', name: 'Serum β-hydroxybutyrate', abbr: 'BHB', cat: 'glycemic', unit: 'mmol/L', units: [], dp: 1, ref: R(0, 0.6) },
  // ----- الكلى -----
  { id: 'creat', name: 'Serum creatinine', abbr: 'Creat', cat: 'renal', unit: 'mg/dL', units: [{ u: 'µmol/L', f: 88.42 }], dp: 2, ref: S(R(0.7, 1.3), R(0.5, 1.1)) },
  { id: 'urea', name: 'Urea', abbr: 'Urea', cat: 'renal', unit: 'mg/dL', units: [{ u: 'mmol/L', f: 0.1665 }], dp: 0, ref: R(15, 45) },
  { id: 'bun', name: 'Blood urea nitrogen', abbr: 'BUN', cat: 'renal', unit: 'mg/dL', units: [{ u: 'mmol/L', f: 0.357 }], dp: 0, ref: R(7, 20) },
  { id: 'cysc', name: 'Cystatin C', abbr: 'Cys-C', cat: 'renal', unit: 'mg/L', units: [], dp: 2, ref: R(0.6, 1.0) },
  { id: 'egfr_lab', name: 'eGFR (as reported by lab)', abbr: 'eGFR (lab)', cat: 'renal', unit: 'mL/min/1.73m²', units: [], dp: 0, ref: R(90, 200) },
  { id: 'uric', name: 'Uric acid', abbr: 'Uric acid', cat: 'renal', unit: 'mg/dL', units: [{ u: 'µmol/L', f: 59.48 }], dp: 1, ref: S(R(3.5, 7.2), R(2.6, 6.0)) },
  // ----- البول -----
  { id: 'uacr', name: 'Urine albumin/creatinine ratio', abbr: 'UACR', cat: 'urine', unit: 'mg/g', units: [{ u: 'mg/mmol', f: 0.113 }], dp: 0, ref: R(0, 29) },
  { id: 'ualb', name: 'Urine albumin (spot)', abbr: 'U-Alb', cat: 'urine', unit: 'mg/L', units: [], dp: 1, ref: R(0, 20) },
  { id: 'ucr', name: 'Urine creatinine (spot)', abbr: 'U-Creat', cat: 'urine', unit: 'mg/dL', units: [{ u: 'mmol/L', f: 0.08842 }], dp: 0, ref: R(20, 320) },
  { id: 'upcr', name: 'Urine protein/creatinine ratio', abbr: 'UPCR', cat: 'urine', unit: 'mg/g', units: [{ u: 'mg/mmol', f: 0.113 }], dp: 0, ref: R(0, 150) },
  { id: 'uket', name: 'Urine ketones', abbr: 'U-Ketones', cat: 'urine', text: true, options: ['Negative', 'Trace', '+', '++', '+++'], ref: null },
  { id: 'uglu', name: 'Urine glucose', abbr: 'U-Glucose', cat: 'urine', text: true, options: ['Negative', 'Trace', '+', '++', '+++', '++++'], ref: null },
  { id: 'upus', name: 'Urine pus cells', abbr: 'Pus cells', cat: 'urine', unit: '/HPF', units: [], dp: 0, ref: R(0, 5) },
  // ----- الكبد -----
  { id: 'alt', name: 'ALT (SGPT)', abbr: 'ALT', cat: 'liver', unit: 'U/L', units: [], dp: 0, ref: R(0, 40) },
  { id: 'ast', name: 'AST (SGOT)', abbr: 'AST', cat: 'liver', unit: 'U/L', units: [], dp: 0, ref: R(0, 40) },
  { id: 'alp', name: 'Alkaline phosphatase', abbr: 'ALP', cat: 'liver', unit: 'U/L', units: [], dp: 0, ref: R(40, 130) },
  { id: 'ggt', name: 'Gamma-GT', abbr: 'GGT', cat: 'liver', unit: 'U/L', units: [], dp: 0, ref: S(R(0, 60), R(0, 40)) },
  { id: 'tbil', name: 'Total bilirubin', abbr: 'T.Bil', cat: 'liver', unit: 'mg/dL', units: [{ u: 'µmol/L', f: 17.1 }], dp: 2, ref: R(0.2, 1.2) },
  { id: 'dbil', name: 'Direct bilirubin', abbr: 'D.Bil', cat: 'liver', unit: 'mg/dL', units: [{ u: 'µmol/L', f: 17.1 }], dp: 2, ref: R(0, 0.3) },
  { id: 'alb', name: 'Serum albumin', abbr: 'Albumin', cat: 'liver', unit: 'g/dL', units: [{ u: 'g/L', f: 10 }], dp: 1, ref: R(3.5, 5.2) },
  { id: 'tp', name: 'Total protein', abbr: 'T.Protein', cat: 'liver', unit: 'g/dL', units: [{ u: 'g/L', f: 10 }], dp: 1, ref: R(6.4, 8.3) },
  { id: 'inr', name: 'INR', abbr: 'INR', cat: 'liver', unit: '', units: [], dp: 2, ref: R(0.8, 1.2) },
  // ----- الدهون -----
  { id: 'tc', name: 'Total cholesterol', abbr: 'TC', cat: 'lipid', unit: 'mg/dL', units: [{ u: 'mmol/L', f: 0.02586 }], dp: 0, ref: R(0, 199) },
  { id: 'tg', name: 'Triglycerides', abbr: 'TG', cat: 'lipid', unit: 'mg/dL', units: [{ u: 'mmol/L', f: 0.01129 }], dp: 0, ref: R(0, 149) },
  { id: 'hdl', name: 'HDL cholesterol', abbr: 'HDL', cat: 'lipid', unit: 'mg/dL', units: [{ u: 'mmol/L', f: 0.02586 }], dp: 0, ref: S(R(40, 200), R(50, 200)) },
  { id: 'ldl', name: 'LDL cholesterol (measured)', abbr: 'LDL', cat: 'lipid', unit: 'mg/dL', units: [{ u: 'mmol/L', f: 0.02586 }], dp: 0, ref: R(0, 99), note: 'الهدف حسب الخطورة: <70 أو <55 مع ASCVD' },
  { id: 'apob', name: 'Apolipoprotein B', abbr: 'ApoB', cat: 'lipid', unit: 'mg/dL', units: [{ u: 'g/L', f: 0.01 }], dp: 0, ref: R(0, 89) },
  { id: 'lpa', name: 'Lipoprotein(a)', abbr: 'Lp(a)', cat: 'lipid', unit: 'mg/dL', units: [], dp: 0, ref: R(0, 49), note: 'لو المعمل بـ nmol/L ضيف تحليل مخصص (التحويل غير ثابت)' },
  // ----- صورة الدم -----
  { id: 'hb', name: 'Hemoglobin', abbr: 'Hb', cat: 'cbc', unit: 'g/dL', units: [{ u: 'g/L', f: 10 }], dp: 1, ref: S(R(13.5, 17.5), R(12, 15.5)) },
  { id: 'hct', name: 'Hematocrit', abbr: 'HCT', cat: 'cbc', unit: '%', units: [], dp: 1, ref: S(R(40, 52), R(36, 46)) },
  { id: 'mcv', name: 'MCV', abbr: 'MCV', cat: 'cbc', unit: 'fL', units: [], dp: 0, ref: R(80, 100) },
  { id: 'wbc', name: 'WBC', abbr: 'WBC', cat: 'cbc', unit: '×10³/µL', units: [], dp: 1, ref: R(4, 11) },
  { id: 'plt', name: 'Platelets', abbr: 'PLT', cat: 'cbc', unit: '×10³/µL', units: [], dp: 0, ref: R(150, 450) },
  // ----- الأملاح -----
  { id: 'na', name: 'Sodium', abbr: 'Na', cat: 'electrolytes', unit: 'mmol/L', units: [], dp: 0, ref: R(135, 145) },
  { id: 'k', name: 'Potassium', abbr: 'K', cat: 'electrolytes', unit: 'mmol/L', units: [], dp: 1, ref: R(3.5, 5.1) },
  { id: 'cl', name: 'Chloride', abbr: 'Cl', cat: 'electrolytes', unit: 'mmol/L', units: [], dp: 0, ref: R(98, 107) },
  { id: 'hco3', name: 'Bicarbonate', abbr: 'HCO₃', cat: 'electrolytes', unit: 'mmol/L', units: [], dp: 0, ref: R(22, 29) },
  { id: 'ca', name: 'Total calcium', abbr: 'Ca', cat: 'electrolytes', unit: 'mg/dL', units: [{ u: 'mmol/L', f: 0.2495 }], dp: 1, ref: R(8.6, 10.3) },
  { id: 'ica', name: 'Ionized calcium', abbr: 'iCa', cat: 'electrolytes', unit: 'mmol/L', units: [], dp: 2, ref: R(1.12, 1.32) },
  { id: 'phos', name: 'Phosphorus', abbr: 'Phos', cat: 'electrolytes', unit: 'mg/dL', units: [{ u: 'mmol/L', f: 0.3229 }], dp: 1, ref: R(2.5, 4.5) },
  { id: 'mg', name: 'Magnesium', abbr: 'Mg', cat: 'electrolytes', unit: 'mg/dL', units: [{ u: 'mmol/L', f: 0.4114 }], dp: 1, ref: R(1.7, 2.4) },
  // ----- الغدة الدرقية (تُستخدم أكثر في المرحلة 2) -----
  { id: 'tsh', name: 'TSH', abbr: 'TSH', cat: 'thyroid', unit: 'mIU/L', units: [], dp: 2, ref: R(0.4, 4.0) },
  { id: 'ft4', name: 'Free T4', abbr: 'FT4', cat: 'thyroid', unit: 'ng/dL', units: [{ u: 'pmol/L', f: 12.87 }], dp: 2, ref: R(0.8, 1.8) },
  { id: 'ft3', name: 'Free T3', abbr: 'FT3', cat: 'thyroid', unit: 'pg/mL', units: [{ u: 'pmol/L', f: 1.536 }], dp: 2, ref: R(2.3, 4.2) },
  { id: 'tpo', name: 'Anti-TPO antibodies', abbr: 'Anti-TPO', cat: 'thyroid', unit: 'IU/mL', units: [], dp: 0, ref: R(0, 34) },
  // ----- فيتامينات وحديد -----
  { id: 'b12', name: 'Vitamin B12', abbr: 'B12', cat: 'vitamins', unit: 'pg/mL', units: [{ u: 'pmol/L', f: 0.7378 }], dp: 0, ref: R(200, 900) },
  { id: 'vitd', name: '25-OH Vitamin D', abbr: 'Vit D', cat: 'vitamins', unit: 'ng/mL', units: [{ u: 'nmol/L', f: 2.496 }], dp: 1, ref: R(30, 100) },
  { id: 'ferritin', name: 'Ferritin', abbr: 'Ferritin', cat: 'vitamins', unit: 'ng/mL', units: [], dp: 0, ref: S(R(30, 400), R(15, 150)) },
  { id: 'iron', name: 'Serum iron', abbr: 'Iron', cat: 'vitamins', unit: 'µg/dL', units: [{ u: 'µmol/L', f: 0.179 }], dp: 0, ref: R(60, 170) },
  { id: 'folate', name: 'Folate', abbr: 'Folate', cat: 'vitamins', unit: 'ng/mL', units: [{ u: 'nmol/L', f: 2.266 }], dp: 1, ref: R(3, 20) },
  // ----- أخرى -----
  { id: 'crp', name: 'C-reactive protein', abbr: 'CRP', cat: 'other', unit: 'mg/L', units: [], dp: 1, ref: R(0, 5) },
  { id: 'esr', name: 'ESR (1st hour)', abbr: 'ESR', cat: 'other', unit: 'mm/h', units: [], dp: 0, ref: R(0, 20) },
  { id: 'ck', name: 'Creatine kinase', abbr: 'CK', cat: 'other', unit: 'U/L', units: [], dp: 0, ref: R(30, 200) },
  { id: 'lipase', name: 'Lipase', abbr: 'Lipase', cat: 'other', unit: 'U/L', units: [], dp: 0, ref: R(0, 60) },
  { id: 'amylase', name: 'Amylase', abbr: 'Amylase', cat: 'other', unit: 'U/L', units: [], dp: 0, ref: R(30, 110) },
  { id: 'pth', name: 'Parathyroid hormone', abbr: 'PTH', cat: 'other', unit: 'pg/mL', units: [{ u: 'pmol/L', f: 0.106 }], dp: 0, ref: R(15, 65) },
];

// المجموعات: لإدخال أسرع (اختار المجموعة فتظهر حقولها).
export const LAB_PANELS = [
  { id: 'glycemic', name: 'سكر', tests: ['fbg', 'ppg2', 'rbg', 'a1c'] },
  { id: 'kft', name: 'وظايف كلى', tests: ['creat', 'urea', 'uric', 'na', 'k'] },
  { id: 'urine', name: 'ألبومين البول', tests: ['uacr', 'ualb', 'ucr'] },
  { id: 'lft', name: 'وظايف كبد', tests: ['alt', 'ast', 'alp', 'ggt', 'tbil', 'dbil', 'alb', 'tp', 'inr'] },
  { id: 'lipid', name: 'دهون', tests: ['tc', 'tg', 'hdl', 'ldl'] },
  { id: 'cbc', name: 'صورة دم', tests: ['hb', 'hct', 'mcv', 'wbc', 'plt'] },
  { id: 'lytes', name: 'أملاح', tests: ['na', 'k', 'cl', 'hco3', 'ca', 'phos', 'mg'] },
  { id: 'thyroid', name: 'غدة درقية', tests: ['tsh', 'ft4', 'ft3', 'tpo'] },
  { id: 'dmtype', name: 'تصنيف السكر', tests: ['cpep', 'gad', 'ia2', 'znt8', 'insulin'] },
  { id: 'vitamins', name: 'فيتامينات وحديد', tests: ['b12', 'vitd', 'ferritin', 'iron', 'folate'] },
  { id: 'dka', name: 'كيتونات', tests: ['rbg', 'bhb', 'uket', 'na', 'k', 'cl', 'hco3'] },
];

// المؤشرات المحسوبة التي تظهر في جدول المقارنة (من تحاليل نفس اليوم).
export const DERIVED = [
  { id: 'egfr', name: 'eGFR (CKD-EPI 2021)', abbr: 'eGFR', unit: 'mL/min/1.73m²', dp: 0 },
  { id: 'fib4', name: 'FIB-4', abbr: 'FIB-4', unit: '', dp: 2 },
  { id: 'nonhdl', name: 'Non-HDL cholesterol', abbr: 'Non-HDL', unit: 'mg/dL', dp: 0 },
  { id: 'ldlc', name: 'LDL (calculated, Sampson)', abbr: 'LDL-calc', unit: 'mg/dL', dp: 0 },
  { id: 'eag', name: 'Estimated average glucose', abbr: 'eAG', unit: 'mg/dL', dp: 0 },
  { id: 'uacrc', name: 'UACR (calculated)', abbr: 'UACR-calc', unit: 'mg/g', dp: 0 },
  { id: 'homa', name: 'HOMA-IR', abbr: 'HOMA-IR', unit: '', dp: 2 },
  { id: 'tyg', name: 'TyG index', abbr: 'TyG', unit: '', dp: 2 },
];
