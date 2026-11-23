// أنواع الكيانات والقيود الطبية: التحقق (رسائل عربية) والوصف المختصر للقوائم.
// إضافة نوع جديد = تعريف هنا (+ واجهته). لا تحذف نوعاً له بيانات منشورة ولا تغيّر معنى حقل مخزَّن.
import { DM_TYPES, T1_STAGES } from '../config/catalog/conditions.js';
import { MEALS } from '../config/catalog/drugs.js';
import { EXAMS, HYPO_CAUSES, SMBG_SLOTS, TARGET_PROFILES } from '../config/catalog/care.js';
import { conditionsMap, generic, labTest, product } from './catalog.js';
import { entity } from './state.js';
import { check, isDate, isId, nonEmpty } from './util.js';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const optNum = (x, lo, hi, label) => {
  if (x === undefined || x === null) return;
  check(isNum(x) && x >= lo && x <= hi, `${label}: القيمة خارج المعقول (${lo}–${hi})`);
};
const optText = (x, max, label) => {
  if (x === undefined || x === null) return;
  check(typeof x === 'string' && x.length <= max, `${label} طويل جداً`);
};
const optDate = (x, label) => {
  if (x === undefined || x === null || x === '') return;
  check(isDate(x), `${label}: تاريخ غير صالح`);
};

// ---------- تاريخ بدقة متغيرة (بداية المتابعة، تاريخ التشخيص) ----------
// { p: 'day'|'month'|'year'|'approx'|'unknown', v: 'YYYY-MM-DD'|'YYYY-MM'|'YYYY'|null, t?: نص }
export const FUZZY = { day: 'تاريخ محدد', month: 'شهر وسنة', year: 'سنة بس', approx: 'تقريبي (من حوالي…)', unknown: 'مش معروف' };
export function checkFuzzy(f, label) {
  if (f === undefined || f === null) return;
  check(typeof f === 'object' && Object.keys(FUZZY).includes(f.p), `${label}: نوع التاريخ غير صالح`);
  if (f.p === 'unknown') return;
  const v = String(f.v || '');
  const okV = f.p === 'day' ? isDate(v) : f.p === 'month' ? /^\d{4}-(0[1-9]|1[0-2])$/.test(v) : f.p === 'year' ? /^\d{4}$/.test(v) : /^\d{4}(-(0[1-9]|1[0-2]))?$/.test(v);
  check(okV, `${label}: التاريخ غير صالح`);
  optText(f.t, 80, label);
}
// أقرب تاريخ يوم لتاريخ بدقة متغيرة (للحساب والترتيب). null لو غير معروف.
export function fuzzyToDate(f) {
  if (!f || f.p === 'unknown' || !f.v) return null;
  const v = f.v;
  if (v.length === 10) return v;
  if (v.length === 7) return `${v}-01`;
  return `${v}-01-01`;
}

// ---------- الجرعة ----------
export const SLOT_TIMES = Object.freeze({ morning: 'الصبح', breakfast: 'الفطار', noon: 'الضهر', lunch: 'الغدا', afternoon: 'العصر', dinner: 'العشا', evening: 'بالليل', bedtime: 'قبل النوم', any: 'أي وقت' });
export const SLOT_TIMES_EN = Object.freeze({ morning: 'morning', breakfast: 'breakfast', noon: 'noon', lunch: 'lunch', afternoon: 'afternoon', dinner: 'dinner', evening: 'evening', bedtime: 'bedtime', any: 'any time' });
export const FREQS = Object.freeze({ daily: 'يومياً', weekly: 'أسبوعياً', eod: 'يوم بعد يوم', every: 'كل عدد أيام', monthly: 'شهرياً', prn: 'عند اللزوم', once: 'مرة واحدة' });
export const DOSE_UNITS_ALL = ['tab', 'cap', 'U', 'mg', 'mcg', 'IU', 'ml', 'g', 'amp', 'sachet', 'drop', 'puff', 'application'];

export function checkDose(d) {
  check(d && typeof d === 'object', 'الجرعة ناقصة');
  const slots = d.slots || [];
  check(Array.isArray(slots) && slots.length <= 8, 'مواعيد الجرعة غير صالحة');
  check(slots.length > 0 || nonEmpty(d.text), 'اكتب الجرعة (كمية وميعاد) أو وصفها نصاً');
  for (const s of slots) {
    check(Object.keys(SLOT_TIMES).includes(s.at), 'ميعاد الجرعة غير صالح');
    check(isNum(s.amount) && s.amount > 0 && s.amount <= 100000, 'كمية الجرعة غير صالحة');
    check(DOSE_UNITS_ALL.includes(s.unit), 'وحدة الجرعة غير صالحة');
  }
  check(Object.keys(FREQS).includes(d.freq || 'daily'), 'تكرار الجرعة غير صالح');
  if (d.freq === 'every') check(Number.isInteger(d.every) && d.every >= 2 && d.every <= 90, 'كل كام يوم؟ (2–90)');
  if (d.weekday !== undefined && d.weekday !== null) check(Number.isInteger(d.weekday) && d.weekday >= 0 && d.weekday <= 6, 'يوم الأسبوع غير صالح');
  if (d.meal !== undefined && d.meal !== null) check(Object.keys(MEALS).includes(d.meal), 'العلاقة بالأكل غير صالحة');
  optNum(d.mealMin, 0, 180, 'الدقائق قبل الأكل');
  optText(d.text, 300, 'وصف الجرعة');
  optText(d.sig, 300, 'تعليمات إضافية');
}

const needPatient = (s, e) => {
  const p = entity(s, 'patient', e.patientId);
  check(p, 'المريض غير موجود');
  return p;
};

// ---------- الكيانات ----------
export const ENTITY_KINDS = {
  patient: {
    label: 'مريض',
    validate(s, x) {
      check(nonEmpty(x.name) && x.name.trim().length <= 100, 'اكتب اسم المريض');
      check(['M', 'F'].includes(x.sex), 'اختار النوع (ذكر/أنثى)');
      optDate(x.dob, 'تاريخ الميلاد');
      if (x.birthYear !== undefined && x.birthYear !== null) check(Number.isInteger(x.birthYear) && x.birthYear >= 1900 && x.birthYear <= 2100, 'سنة الميلاد غير صالحة');
      optText(x.phone, 40, 'التليفون');
      optText(x.address, 150, 'العنوان');
      optText(x.referral, 150, 'مصدر معرفته بيك');
      optText(x.note, 2000, 'الملاحظة');
      optText(x.chief, 1000, 'الشكوى الأساسية');
      if (x.sourceId) check(entity(s, 'source', x.sourceId), 'المصدر غير موجود');
      checkFuzzy(x.followStart, 'بداية المتابعة');
      if (x.dm) {
        check(DM_TYPES.some((t) => t.id === x.dm.type), 'نوع السكر غير صالح');
        checkFuzzy(x.dm.since, 'تاريخ التشخيص');
        if (x.dm.t1Stage) check(T1_STAGES.some((t) => t.id === x.dm.t1Stage), 'مرحلة النوع الأول غير صالحة');
      }
      optNum(x.height, 50, 250, 'الطول (سم)');
      if (x.status) check(['active', 'inactive', 'transferred', 'deceased'].includes(x.status), 'حالة المتابعة غير صالحة');
      if (x.targetProfile) check(TARGET_PROFILES.some((t) => t.id === x.targetProfile), 'مجموعة الأهداف غير صالحة');
      if (x.targets) {
        optNum(x.targets.a1c, 4, 12, 'هدف HbA1c');
        if (x.targets.fpg) check(Array.isArray(x.targets.fpg) && x.targets.fpg.length === 2 && x.targets.fpg.every((v) => isNum(v) && v >= 50 && v <= 300) && x.targets.fpg[0] < x.targets.fpg[1], 'هدف الصايم غير صالح');
        optNum(x.targets.ppg, 80, 350, 'هدف بعد الأكل');
      }
    },
  },
  condition: {
    label: 'حالة مصاحبة',
    validate(s, x) {
      needPatient(s, x);
      check(conditionsMap(s).has(x.code) || (x.code === 'custom' && nonEmpty(x.label)), 'الحالة غير معروفة');
      optDate(x.since, 'تاريخ البداية');
      optDate(x.until, 'تاريخ الانتهاء');
      if (x.since && x.until) check(x.until >= x.since, 'تاريخ الانتهاء قبل البداية');
      check(!x.details || typeof x.details === 'object', 'تفاصيل غير صالحة');
      optText(x.note, 1000, 'الملاحظة');
    },
  },
  task: {
    label: 'متابعة منتظرة',
    validate(s, x) {
      if (x.patientId) needPatient(s, x);
      check(['visit', 'lab', 'ask', 'other'].includes(x.type), 'نوع المتابعة غير صالح');
      check(nonEmpty(x.title) || (x.type === 'lab' && Array.isArray(x.tests) && x.tests.length), 'اكتب المطلوب');
      if (x.tests) check(Array.isArray(x.tests) && x.tests.every((t) => labTest(s, t)), 'تحليل غير معروف');
      optDate(x.due, 'الميعاد المتوقع');
      check(['open', 'done', 'cancelled'].includes(x.status || 'open'), 'حالة غير صالحة');
      optDate(x.doneDate, 'تاريخ الإنجاز');
      optText(x.title, 300, 'العنوان');
      optText(x.note, 1000, 'الملاحظة');
    },
  },
  source: { label: 'مصدر', validate: (s, x) => check(nonEmpty(x.name) && x.name.length <= 60, 'اكتب اسم المصدر') },
  'drug.generic': {
    label: 'مادة فعالة',
    validate(s, x) {
      check(nonEmpty(x.name) && x.name.length <= 120, 'اكتب اسم المادة الفعالة');
      check(Array.isArray(x.classes || []), 'التصنيفات غير صالحة');
      if (x.meal) check(Object.keys(MEALS).includes(x.meal), 'العلاقة بالأكل غير صالحة');
      optNum(x.maxDay, 0, 1e7, 'أقصى جرعة يومية');
      optNum(x.maxWeek, 0, 1e7, 'أقصى جرعة أسبوعية');
    },
  },
  'drug.product': {
    label: 'منتج دوائي',
    validate(s, x) {
      check(nonEmpty(x.name) && x.name.length <= 120, 'اكتب اسم الدواء');
      check(Array.isArray(x.g) && x.g.every((g) => generic(s, g)), 'المادة الفعالة غير معروفة');
      check(Array.isArray(x.v || []) && (x.v || []).every((v) => Array.isArray(v) && v.length === x.g.length && v.every((n) => isNum(n) && n > 0)), 'التركيزات لازم تكون بعدد المواد الفعالة');
      check(DOSE_UNITS_ALL.includes(x.unit), 'وحدة الجرعة غير صالحة');
    },
  },
  'lab.test': {
    label: 'تحليل',
    validate(s, x) {
      check(nonEmpty(x.name) && x.name.length <= 120, 'اكتب اسم التحليل');
      check(nonEmpty(x.abbr || x.name), 'اكتب اختصار التحليل');
      if (!x.text) check(typeof x.unit === 'string' && x.unit.length <= 30, 'الوحدة غير صالحة');
      if (x.ref) {
        const rs = x.ref.M ? [x.ref.M, x.ref.F] : [x.ref];
        for (const r of rs) check(r && (r.lo === null || isNum(r.lo)) && (r.hi === null || isNum(r.hi)) && (r.lo === null || r.hi === null || r.lo <= r.hi), 'المدى المرجعي غير صالح');
      }
    },
  },
  'lab.panel': { label: 'مجموعة تحاليل', validate: (s, x) => check(nonEmpty(x.name) && Array.isArray(x.tests) && x.tests.length && x.tests.every((t) => labTest(s, t)), 'المجموعة لازم فيها تحاليل معروفة') },
  rule: {
    label: 'قاعدة',
    validate(s, x) {
      if (x.params) check(Object.values(x.params).every(isNum), 'معاملات القاعدة لازم تكون أرقام');
      optText(x.msg, 600, 'نص الرسالة');
      optText(x.suggest, 600, 'البديل المقترح');
      if (x.scope) check(['med', 'patient'].includes(x.scope), 'نطاق القاعدة غير صالح');
    },
  },
  'alert.ack': {
    label: 'مراجعة تنبيه',
    validate(s, x) {
      needPatient(s, x);
      check(nonEmpty(x.ruleId), 'القاعدة غير محددة');
      optText(x.note, 500, 'الملاحظة');
    },
  },
};

// ---------- القيود ----------
const VISIT_TYPES = { clinic: 'عيادة', institute: 'المعهد', phone: 'تليفون', online: 'رسائل/أونلاين', ward: 'داخلي', er: 'استقبال', other: 'أخرى' };
export { VISIT_TYPES };

function checkVitals(v) {
  if (!v) return;
  optNum(v.weight, 2, 400, 'الوزن');
  optNum(v.height, 50, 250, 'الطول');
  optNum(v.waist, 30, 250, 'محيط الوسط');
  optNum(v.sbp, 50, 300, 'الضغط الانقباضي');
  optNum(v.dbp, 20, 200, 'الضغط الانبساطي');
  optNum(v.hr, 20, 250, 'النبض');
  optNum(v.temp, 30, 45, 'الحرارة');
  optNum(v.spo2, 50, 100, 'تشبع الأكسجين');
  optNum(v.rbg, 10, 1500, 'السكر العشوائي');
}

export const ENTRY_KINDS = {
  visit: {
    label: 'متابعة',
    validate(s, e) {
      needPatient(s, e);
      check(Object.keys(VISIT_TYPES).includes(e.vtype || 'clinic'), 'نوع المتابعة غير صالح');
      checkVitals(e.vitals);
      for (const k of ['complaint', 'exam', 'assessment', 'plan', 'glucoseNote', 'adherence']) optText(e[k], 4000, 'النص');
      if (e.complaintStatus) check(['new', 'same', 'better', 'worse', 'resolved'].includes(e.complaintStatus), 'حالة الشكوى غير صالحة');
    },
    describe: (s, e) => ({ title: `متابعة (${VISIT_TYPES[e.vtype || 'clinic']})`, sub: e.complaint || e.assessment || '' }),
  },
  labs: {
    label: 'تحاليل',
    validate(s, e) {
      needPatient(s, e);
      check(Array.isArray(e.results) && e.results.length > 0 && e.results.length <= 80, 'أدخل نتيجة واحدة على الأقل');
      const seen = new Set();
      for (const r of e.results) {
        const t = labTest(s, r.test);
        check(t, `تحليل غير معروف: ${r.test}`);
        check(!seen.has(r.test), `${t.abbr} مكرر في نفس الإدخال`);
        seen.add(r.test);
        if (t.text) check(nonEmpty(r.t), `${t.abbr}: النتيجة ناقصة`);
        else {
          check(isNum(r.v), `${t.abbr}: النتيجة لازم تكون رقم`);
          check(r.v >= 0 && r.v < 1e6, `${t.abbr}: النتيجة خارج المعقول`);
          check(!r.unit || r.unit === t.unit || (t.units || []).some((u) => u.u === r.unit), `${t.abbr}: الوحدة غير صالحة`);
        }
        optText(r.t, 200, 'النتيجة');
        if (r.flag) check(['H', 'L', 'N', 'A'].includes(r.flag), 'علامة غير صالحة');
      }
      optText(e.lab, 100, 'اسم المعمل');
    },
    describe: (s, e) => ({ title: 'تحاليل', sub: e.results.map((r) => labTest(s, r.test)?.abbr || r.test).join('، ') }),
  },
  'med.start': {
    label: 'بدء دواء',
    validate(s, e) {
      needPatient(s, e);
      check(isId(e.medId), 'معرّف الدواء غير صالح');
      check(!(s.byPatient.get(e.patientId) || []).some((x) => !x.voided && x.kind === 'med.start' && x.medId === e.medId), 'الدواء مسجل من قبل');
      check(e.drug && nonEmpty(e.drug.name), 'اختار الدواء');
      check(Array.isArray(e.drug.g) && e.drug.g.every((g) => generic(s, g)), 'المادة الفعالة غير معروفة');
      if (e.drug.productId) check(product(s, e.drug.productId), 'المنتج غير موجود في المكتبة');
      if (e.drug.s) check(Array.isArray(e.drug.s) && e.drug.s.length === e.drug.g.length && e.drug.s.every((n) => isNum(n) && n > 0), 'التركيز غير صالح');
      checkDose(e.dose);
      if (e.datePrecision) check(['day', 'month', 'year', 'unknown'].includes(e.datePrecision), 'دقة التاريخ غير صالحة');
      optText(e.reason, 500, 'السبب');
      optText(e.indication, 200, 'الاستخدام');
    },
    describe: (s, e) => ({ title: `${e.prior ? 'كان بياخد' : 'بدء'}: ${e.drug.name}${e.drug.s ? ' ' + e.drug.s.join('/') : ''}`, sub: e.reason || '' }),
  },
  'med.change': {
    label: 'تعديل جرعة',
    validate(s, e) {
      needPatient(s, e);
      const start = medStartOf(s, e.patientId, e.medId);
      check(start, 'الدواء غير موجود');
      check(!medStopOf(s, e.patientId, e.medId), 'الدواء متوقف — ابدأه من جديد بدل التعديل');
      check(e.date >= start.date || start.datePrecision === 'unknown', 'تاريخ التعديل قبل بداية الدواء');
      checkDose(e.dose);
      optText(e.reason, 500, 'السبب');
    },
    describe: (s, e) => ({ title: `تعديل: ${medStartOf(s, e.patientId, e.medId)?.drug.name || ''}`, sub: e.reason || '' }),
  },
  'med.stop': {
    label: 'إيقاف دواء',
    validate(s, e) {
      needPatient(s, e);
      const start = medStartOf(s, e.patientId, e.medId);
      check(start, 'الدواء غير موجود');
      check(!medStopOf(s, e.patientId, e.medId), 'الدواء متوقف من قبل');
      check(e.date >= start.date || start.datePrecision === 'unknown', 'تاريخ الإيقاف قبل بداية الدواء');
      optText(e.reason, 500, 'السبب');
    },
    describe: (s, e) => ({ title: `إيقاف: ${medStartOf(s, e.patientId, e.medId)?.drug.name || ''}`, sub: e.reason || '' }),
  },
  smbg: {
    label: 'قراءات سكر منزلية',
    validate(s, e) {
      needPatient(s, e);
      check(Array.isArray(e.days) && e.days.length > 0 && e.days.length <= 120, 'أدخل قراءات يوم واحد على الأقل');
      let n = 0;
      for (const d of e.days) {
        check(isDate(d.d), 'تاريخ القراءة غير صالح');
        for (const [k, v] of Object.entries(d.r || {})) {
          check(SMBG_SLOTS.some((x) => x.id === k), 'ميعاد القراءة غير صالح');
          check(isNum(v) && v >= 10 && v <= 800, 'قراءة السكر خارج المعقول (10–800)');
          n++;
        }
      }
      check(n > 0, 'أدخل قراءة واحدة على الأقل');
    },
    describe: (s, e) => ({ title: 'قراءات سكر منزلية', sub: `${e.days.length} يوم` }),
  },
  cgm: {
    label: 'تقرير CGM',
    validate(s, e) {
      needPatient(s, e);
      optNum(e.days, 1, 90, 'عدد الأيام');
      for (const k of ['active', 'tir', 'tirTight', 'tar1', 'tar2', 'tbr1', 'tbr2', 'gmi', 'cv']) optNum(e[k], 0, 100, k.toUpperCase());
      optNum(e.mean, 30, 500, 'المتوسط');
      const parts = ['tar2', 'tar1', 'tir', 'tbr1', 'tbr2'].map((k) => e[k]);
      if (parts.every(isNum)) check(Math.abs(parts.reduce((a, b) => a + b, 0) - 100) <= 3, 'مجموع النسب (فوق/في/تحت المدى) لازم يقارب 100%');
      check(['tir', 'mean', 'gmi'].some((k) => isNum(e[k])), 'أدخل TIR أو المتوسط على الأقل');
    },
    describe: (s, e) => ({ title: 'تقرير CGM', sub: [isNum(e.tir) ? `TIR ${e.tir}%` : '', isNum(e.tbr1) || isNum(e.tbr2) ? `TBR ${(e.tbr1 || 0) + (e.tbr2 || 0)}%` : ''].filter(Boolean).join(' · ') }),
  },
  hypo: {
    label: 'نوبة هبوط',
    validate(s, e) {
      needPatient(s, e);
      check([1, 2, 3].includes(e.level), 'اختار مستوى الهبوط');
      optNum(e.value, 10, 99, 'القراءة');
      if (e.value && e.level === 1) check(e.value >= 54 && e.value < 70, 'مستوى 1 = 54–69');
      if (e.value && e.level === 2) check(e.value < 54, 'مستوى 2 = أقل من 54');
      if (e.cause) check(Object.keys(HYPO_CAUSES).includes(e.cause), 'السبب غير صالح');
      if (e.time) check(/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time), 'الوقت غير صالح');
      optText(e.action, 500, 'التصرف');
    },
    describe: (s, e) => ({ title: `هبوط مستوى ${e.level}${e.value ? ` (${e.value})` : ''}`, sub: [e.nocturnal ? 'ليلي' : '', e.cause ? HYPO_CAUSES[e.cause] : ''].filter(Boolean).join(' · ') }),
  },
  exam: {
    label: 'فحص',
    validate(s, e) {
      needPatient(s, e);
      check(EXAMS.some((x) => x.id === e.exam), 'نوع الفحص غير صالح');
      check(!e.result || typeof e.result === 'object', 'النتيجة غير صالحة');
      optText(e.text, 2000, 'النتيجة');
    },
    describe: (s, e) => ({ title: EXAMS.find((x) => x.id === e.exam)?.ar || 'فحص', sub: e.text || '' }),
  },
  photo: {
    label: 'صورة',
    validate(s, e) {
      needPatient(s, e);
      check(isId(e.fileId), 'الصورة غير صالحة');
      check(['lab', 'rx', 'imaging', 'report', 'other'].includes(e.cat || 'other'), 'نوع الصورة غير صالح');
      optText(e.caption, 200, 'الوصف');
    },
    describe: (s, e) => ({ title: 'صورة', sub: e.caption || '' }),
  },
  note: {
    label: 'ملاحظة',
    validate(s, e) {
      needPatient(s, e);
      check(nonEmpty(e.text) && e.text.length <= 4000, 'اكتب الملاحظة');
    },
    describe: (s, e) => ({ title: 'ملاحظة', sub: e.text }),
  },
};

// أدوات بحث صغيرة عن بداية/إيقاف دواء (تستخدمها التحققات و meds.js).
export function medStartOf(s, patientId, medId) {
  return (s.byPatient.get(patientId) || []).find((x) => !x.voided && x.kind === 'med.start' && x.medId === medId) || null;
}
export function medStopOf(s, patientId, medId) {
  return (s.byPatient.get(patientId) || []).find((x) => !x.voided && x.kind === 'med.stop' && x.medId === medId) || null;
}

export function describeEntry(s, e) {
  const def = ENTRY_KINDS[e.kind];
  const d = def?.describe ? def.describe(s, e) : { title: def?.label || e.kind, sub: '' };
  return { label: def?.label || e.kind, ...d };
}
