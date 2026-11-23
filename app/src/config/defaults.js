// قوائم افتراضية يملكها المستخدم ويعدّلها (تُزرع مرة واحدة عند أول تشغيل بمعرّفات ثابتة).
export const DEFAULT_SOURCES = [
  { id: 'institute', name: 'المعهد', order: 1 },
  { id: 'local', name: 'معارف البلد', order: 2 },
  { id: 'other', name: 'مصدر آخر', order: 3 },
];

// إعدادات افتراضية (تتغير من شاشة الإعدادات بحدث settings.set).
export const DEFAULT_SETTINGS = Object.freeze({
  digits: 'latin', // latin | arab
  showIcd: true, // إظهار أكواد ICD-10 جنب التشخيصات
  dialect: 'egy', // لغة تعليمات المريض: egy (عامية مصرية) | msa (فصحى مبسطة)
  defaultTargets: 'standard',
  labMaxAgeDays: 365,
  showSI: false, // إظهار الوحدة الدولية بجانب النتائج
});
