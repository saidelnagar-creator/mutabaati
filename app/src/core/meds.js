// العلاج: تجميع قيود (بدء/تعديل/إيقاف) كل دواء في خط زمني، العلاج النشط في تاريخ، حساب الجرعة اليومية لكل مادة فعالة،
// إجمالي الإنسولين، ونص الجرعة بالعربي والإنجليزي. كله دوال خالصة.
import { MEALS, DOSE_UNITS, DOSE_UNITS_EN } from '../config/catalog/drugs.js';
import { classesOf, generic } from './catalog.js';
import { FREQS, SLOT_TIMES, SLOT_TIMES_EN } from './kinds.js';
import { patientEntries } from './state.js';
import { cmp } from './util.js';
import { plainNum } from './num.js';

export const WEEKDAYS = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
export const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const STOP_REASONS = { effect: 'عرض جانبي', ineffective: 'غير فعال', target: 'وصل للهدف', contraindication: 'مانع/تنبيه', cost: 'السعر', unavailable: 'غير متوفر', switch: 'تبديل لدواء آخر', patient: 'رغبة المريض', pregnancy: 'حمل', other: 'سبب آخر' };

const byDate = (a, b) => cmp(a.date, b.date) || cmp(a.ts, b.ts);

// كل أدوية المريض (نشطة ومتوقفة) بتاريخها الكامل.
export function medList(state, patientId) {
  const entries = patientEntries(state, patientId, ['med.start', 'med.change', 'med.stop']).sort(byDate);
  const meds = new Map();
  for (const e of entries) {
    if (e.kind === 'med.start') {
      meds.set(e.medId, { medId: e.medId, start: e, drug: e.drug, prior: !!e.prior, startDate: e.date, datePrecision: e.datePrecision || 'day', stop: null, history: [{ date: e.date, kind: 'start', dose: e.dose, reason: e.reason || '', entry: e }] });
    } else {
      const m = meds.get(e.medId);
      if (!m) continue;
      if (e.kind === 'med.change') m.history.push({ date: e.date, kind: 'change', dose: e.dose, reason: e.reason || '', entry: e });
      else {
        m.stop = e;
        m.history.push({ date: e.date, kind: 'stop', dose: null, reason: e.reason || '', reasonCode: e.reasonCode || null, entry: e });
      }
    }
  }
  for (const m of meds.values()) {
    m.classes = classesOf(state, m.drug.g);
    m.dose = doseAsOf(m, '9999-12-31');
  }
  return [...meds.values()];
}

export function doseAsOf(med, date) {
  let dose = null;
  for (const h of med.history) {
    if (h.date > date && !(h.kind === 'start' && med.datePrecision === 'unknown')) break;
    if (h.kind !== 'stop') dose = h.dose;
  }
  return dose;
}

export const isActiveOn = (med, date) => (med.startDate <= date || med.datePrecision === 'unknown') && (!med.stop || med.stop.date > date);

// العلاج النشط في تاريخ (افتراضياً اليوم) مع جرعته في ذلك التاريخ.
export function activeMeds(state, patientId, date) {
  return medList(state, patientId)
    .filter((m) => isActiveOn(m, date))
    .map((m) => ({ ...m, dose: doseAsOf(m, date) }));
}

// عدد مرات الإعطاء في اليوم لكل «إعطاء». null = غير محدد (عند اللزوم/مرة واحدة).
export function perDayFactor(dose) {
  switch (dose?.freq || 'daily') {
    case 'daily':
      return 1;
    case 'weekly':
      return 1 / 7;
    case 'eod':
      return 1 / 2;
    case 'every':
      return 1 / (dose.every || 1);
    case 'monthly':
      return 1 / 30;
    default:
      return null;
  }
}

const COUNTABLE = new Set(['tab', 'cap', 'sachet', 'amp', 'drop', 'puff', 'application']);

// الكمية لكل مادة فعالة: Map(genericId → { day, week, unit }). الأقراص تتحول بتركيز المنتج المختار (drug.s).
export function amountsByGeneric(state, med, dose = med.dose) {
  const out = new Map();
  if (!dose || !dose.slots?.length) return out;
  const f = perDayFactor(dose);
  const g = med.drug.g || [];
  const s = med.drug.s || null;
  const perAdminByUnit = new Map();
  for (const sl of dose.slots) perAdminByUnit.set(sl.unit, (perAdminByUnit.get(sl.unit) || 0) + sl.amount);
  for (const [unit, amount] of perAdminByUnit) {
    if (COUNTABLE.has(unit)) {
      if (!s) continue;
      g.forEach((gid, i) => add(out, gid, amount * s[i], generic(state, gid)?.unit || 'mg', f));
    } else if (g.length === 1) add(out, g[0], amount, unit, f);
    else if (g.length > 1 && unit === 'U') add(out, g[0], amount, unit, f); // تركيبة إنسولين ثابتة: الجرعة بوحدات الإنسولين
  }
  return out;
}
function add(out, gid, perAdmin, unit, f) {
  const prev = out.get(gid) || { perAdmin: 0, day: 0, week: 0, unit };
  prev.perAdmin += perAdmin;
  prev.day = f === null ? null : prev.day === null ? null : prev.day + perAdmin * f;
  prev.week = prev.day === null ? null : prev.day * 7;
  out.set(gid, prev);
}

// الإنسولين: الإجمالي اليومي (TDD) والقاعدي بالوحدات.
export function insulinTotals(state, meds) {
  let tdd = 0;
  let basal = 0;
  let any = false;
  for (const m of meds) {
    if (!m.classes.has('insulin') || !m.dose) continue;
    const f = perDayFactor(m.dose);
    if (f === null) continue;
    const units = (m.dose.slots || []).filter((s) => s.unit === 'U').reduce((a, s) => a + s.amount, 0) * f;
    if (!units) continue;
    any = true;
    tdd += units;
    if (m.classes.has('insulin-basal') || m.classes.has('insulin-intermediate')) basal += units;
  }
  return any ? { tdd: round1(tdd), basal: round1(basal) } : null;
}
const round1 = (x) => Math.round(x * 10) / 10;

// اسم الدواء للعرض: الاسم + التركيز (Janumet 50/1000).
export function medTitle(med) {
  const d = med.drug || med;
  return `${d.name}${d.s && d.s.length ? ' ' + d.s.map(plainNum).join('/') : ''}`;
}
export function genericNames(state, med) {
  return (med.drug.g || []).map((g) => generic(state, g)?.name || g).join(' + ');
}

// العلاقة بالأكل الفعلية: من الجرعة، وإلا من المادة الفعالة الأولى.
// في التركيبات: العلاقة الأشد بين مكوناتها (مثلاً Janumet = مع الأكل بسبب الميتفورمين).
const MEAL_RANK = ['empty', 'before', 'first', 'with', 'after', 'bedtime', 'any'];
export function mealOf(state, med, dose = med.dose) {
  const gs = (med.drug.g || []).map((id) => generic(state, id)).filter(Boolean);
  const g = gs.slice().sort((a, b) => MEAL_RANK.indexOf(a.meal || 'any') - MEAL_RANK.indexOf(b.meal || 'any'))[0] || null;
  const meal = dose?.meal || g?.meal || null;
  const mealMin = dose?.mealMin ?? (dose?.meal ? null : g?.mealMin ?? null);
  return { meal, mealMin, note: dose?.meal ? '' : g?.mealNote || '' };
}

export function mealText(meal, mealMin, lang = 'ar') {
  if (!meal) return '';
  const m = MEALS[meal];
  if (!m) return '';
  if ((meal === 'before' || meal === 'empty') && mealMin) return lang === 'ar' ? `${m.ar} بـ ${mealMin} دقيقة` : `${mealMin} min ${meal === 'empty' ? 'before food, empty stomach' : 'before meals'}`;
  return lang === 'ar' ? m.ar : m.en;
}

// نص الجرعة: «1 قرص الفطار + 1 قرص العشا • مع الأكل».
export function doseText(state, med, dose = med.dose, { lang = 'ar', withMeal = true } = {}) {
  if (!dose) return lang === 'ar' ? 'متوقف' : 'stopped';
  const U = lang === 'ar' ? DOSE_UNITS : DOSE_UNITS_EN;
  const T = lang === 'ar' ? SLOT_TIMES : SLOT_TIMES_EN;
  const parts = [];
  const slots = (dose.slots || []).map((s) => `${plainNum(s.amount)} ${U[s.unit] || s.unit}${s.at && s.at !== 'any' ? ` ${lang === 'ar' ? '' : '@ '}${T[s.at]}` : ''}`.replace(/\s+/g, ' ').trim());
  if (slots.length) parts.push(slots.join(' + '));
  if (dose.text) parts.push(dose.text);
  const freq = dose.freq || 'daily';
  if (freq !== 'daily') {
    if (lang === 'ar') parts.push(freq === 'every' ? `كل ${dose.every} أيام` : freq === 'weekly' && Number.isInteger(dose.weekday) ? `أسبوعياً يوم ${WEEKDAYS[dose.weekday]}` : FREQS[freq]);
    else parts.push(freq === 'every' ? `every ${dose.every} days` : freq === 'weekly' ? `weekly${Number.isInteger(dose.weekday) ? ` (${WEEKDAYS_EN[dose.weekday]})` : ''}` : { eod: 'every other day', monthly: 'monthly', prn: 'as needed', once: 'once' }[freq] || freq);
  }
  if (withMeal) {
    const m = mealOf(state, med, dose);
    const t = mealText(m.meal, m.mealMin, lang);
    if (t) parts.push(t);
  }
  if (dose.sig) parts.push(dose.sig);
  return parts.join(' • ');
}

// ملخص تغيير الجرعة بين نسختين («زيادة» / «تقليل» / «تعديل») بالمقارنة بالكمية اليومية للمادة الأولى.
export function changeDirection(state, med, before, after) {
  const a = [...amountsByGeneric(state, med, before).values()][0]?.day;
  const b = [...amountsByGeneric(state, med, after).values()][0]?.day;
  if (a == null || b == null || a === b) return 'change';
  return b > a ? 'up' : 'down';
}
