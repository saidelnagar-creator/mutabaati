// سياق المريض في تاريخ: السن، الوزن، آخر التحاليل (بشرط حداثتها)، eGFR و CrCl و FIB-4، الحالات النشطة،
// العلاج النشط وتصنيفاته، الإنسولين، الهبوط، والأهداف. هو مدخل محرك التنبيهات والتقارير.
import { RULES } from '../config/rules.js';
import { DIABETES_TYPES, INSULIN_DEFICIENT_TYPES, DM_TYPES } from '../config/catalog/conditions.js';
import { conditionsMap } from './catalog.js';
import { entity, listEntities, patientEntries } from './state.js';
import { ageAt } from './age.js';
import { labResults, derivedByDate, latestLab, latestDerived, refFor } from './labs.js';
import { labTest } from './catalog.js';
import { activeMeds, insulinTotals } from './meds.js';
import { hypoCount, cgmReports, targetsFor } from './glucose.js';
import { fuzzyToDate } from './kinds.js';
import * as C from './calc.js';
import { addDays, cmp, daysBetween } from './util.js';

export const isPregnantOn = (c, date) => c.code === 'pregnancy' && condActiveOn(c, date);
export const condActiveOn = (c, date) => (!c.since || c.since <= date) && (!c.until || c.until > date) && !c.archived;

export function patientConditions(state, patientId, { all = false, date = null } = {}) {
  const list = listEntities(state, 'condition').filter((c) => c.patientId === patientId);
  const out = all ? list : list.filter((c) => condActiveOn(c, date || '9999-12-31'));
  const defs = conditionsMap(state);
  return out.map((c) => ({ ...c, def: defs.get(c.code) || { id: c.code, ar: c.label || c.code, label: c.label || c.code, icd: '' } })).sort((a, b) => cmp(a.def.group || '', b.def.group || ''));
}

// عمر الحمل بالأسابيع من LMP أو EDD.
export function gestationalWeeks(cond, date) {
  const d = cond?.details || {};
  if (d.lmp) return Math.floor(daysBetween(d.lmp, date) / 7);
  if (d.edd) return Math.floor((280 - daysBetween(date, d.edd)) / 7);
  return null;
}

// آخر وزن/طول/ضغط من المتابعات.
export function latestVitals(state, patientId, asOf = '9999-12-31') {
  const visits = patientEntries(state, patientId, 'visit').filter((v) => v.date <= asOf).sort((a, b) => cmp(a.date, b.date) || cmp(a.ts, b.ts));
  const out = {};
  for (const v of visits) for (const [k, x] of Object.entries(v.vitals || {})) if (typeof x === 'number') out[k] = { v: x, date: v.date };
  return out;
}

export function dmTypeLabel(patient) {
  return DM_TYPES.find((t) => t.id === patient?.dm?.type) || null;
}

// السياق الكامل. date: تاريخ التقييم (افتراضياً اليوم الممرر).
export function patientContext(state, patientId, date) {
  const patient = entity(state, 'patient', patientId);
  if (!patient) return null;
  const maxAge = state.settings.labMaxAgeDays ?? RULES.labMaxAgeDays;
  const fresh = (x) => x && daysBetween(x.date, date) <= maxAge;
  const results = labResults(state, patientId).filter((r) => r.date <= date);
  const derived = derivedByDate(state, patient, results);
  const age = ageAt(patient, date);
  const vit = latestVitals(state, patientId, date);
  const height = patient.height ?? vit.height?.v ?? null;
  const weight = vit.weight?.v ?? null;
  const f = {}; // القيم الرقمية الحديثة (مدخلات القواعد)
  const d = {}; // تاريخ كل قيمة (لشرط missing)
  const setF = (k, x) => {
    if (x && typeof x.v === 'number') {
      d[k] = x.date;
      if (fresh(x)) f[k] = x.v;
    }
  };
  for (const t of ['a1c', 'k', 'alt', 'ast', 'plt', 'ldl', 'tc', 'hdl', 'tg', 'b12', 'cpep', 'creat', 'cysc', 'alb', 'na', 'hb', 'tsh', 'fbg', 'uacr']) setF(t, latestLab(state, patientId, t, date, results));
  // eGFR: من الكرياتينين (CKD-EPI 2021) أو المسجل من المعمل، أيهما أحدث.
  const eCalc = latestDerived(derived, 'egfr', date);
  const eLab = latestLab(state, patientId, 'egfr_lab', date, results);
  const egfr = eCalc && (!eLab || eCalc.date >= eLab.date) ? { ...eCalc, method: 'CKD-EPI 2021' } : eLab ? { v: eLab.v, date: eLab.date, method: 'lab' } : null;
  setF('egfr', egfr);
  // UACR: المسجل أو المحسوب من ألبومين/كرياتينين البول.
  const uCalc = latestDerived(derived, 'uacrc', date);
  const uLab = latestLab(state, patientId, 'uacr', date, results);
  const uacr = uLab && (!uCalc || uLab.date >= uCalc.date) ? uLab : uCalc;
  if (uacr) {
    delete f.uacr;
    setF('uacr', uacr);
  }
  const fib = latestDerived(derived, 'fib4', date);
  setF('fib4', fib);
  const ldlCalc = latestDerived(derived, 'ldlc', date);
  if (ldlCalc && (!d.ldl || ldlCalc.date > d.ldl)) setF('ldl', ldlCalc);
  // CrCl (Cockcroft-Gault) من آخر كرياتينين حديث.
  let crcl = null;
  if (f.creat !== undefined && age !== null && weight) {
    crcl = height ? C.crclAuto(f.creat, age, weight, height, patient.sex) : { value: C.crclCG(f.creat, age, weight, patient.sex), basis: 'actual', weightUsed: weight };
    if (crcl?.value !== null && crcl?.value !== undefined) {
      f.crcl = crcl.value;
      d.crcl = d.creat;
    }
  }
  const ratio = (t, v) => {
    const r = refFor(labTest(state, t), patient.sex);
    return r?.hi ? v / r.hi : null;
  };
  if (f.alt !== undefined) f.alt_uln = ratio('alt', f.alt);
  if (f.ast !== undefined) f.ast_uln = ratio('ast', f.ast);
  if (age !== null) f.age = age;
  if (weight) f.weight = weight;
  const b = C.bmi(weight, height);
  if (b) f.bmi = b;
  if (vit.sbp && daysBetween(vit.sbp.date, date) <= 180) f.sbp = vit.sbp.v;
  if (vit.dbp && daysBetween(vit.dbp.date, date) <= 180) f.dbp = vit.dbp.v;
  const meds = activeMeds(state, patientId, date);
  const classes = new Set();
  const generics = new Set();
  for (const m of meds) {
    for (const c of m.classes) classes.add(c);
    for (const g of m.drug.g || []) generics.add(g);
  }
  const insulin = insulinTotals(state, meds);
  if (insulin && weight) {
    f.tdd_kg = insulin.tdd / weight;
    f.basal_kg = insulin.basal / weight;
  }
  f.hypo2_90 = hypoCount(state, patientId, { days: 90, minLevel: 2, asOf: date });
  const lastCgm = cgmReports(state, patientId).filter((r) => r.date <= date).pop();
  if (lastCgm) d.cgm = lastCgm.date;
  const conds = new Map();
  for (const c of patientConditions(state, patientId, { date })) conds.set(c.code, c);
  const dmType = patient.dm?.type || null;
  const pregnant = conds.has('pregnancy');
  const g = C.gStage(f.egfr);
  const a = C.aStage(f.uacr);
  const targets = targetsFor(patient, { age, pregnant, frail: conds.has('frailty') }, state.settings.defaultTargets || 'standard');
  return {
    patient,
    date,
    age,
    sex: patient.sex,
    dmType,
    isDiabetic: DIABETES_TYPES.includes(dmType),
    insulinDeficient: INSULIN_DEFICIENT_TYPES.includes(dmType) || (f.cpep !== undefined && f.cpep < 0.6),
    weight,
    height,
    bmi: b,
    f,
    d,
    egfr,
    crcl,
    uacr,
    fib4: fib,
    gStage: g,
    aStage: a,
    kdigo: C.kdigoRisk(g, a),
    conds,
    pregnant,
    pregnancyWeeks: pregnant ? gestationalWeeks(conds.get('pregnancy'), date) : null,
    meds,
    classes,
    generics,
    insulin,
    targets,
    vitals: vit,
    derived,
  };
}

// مدة المتابعة ومدة المرض كنص.
export function durationText(fromDate, toDate) {
  if (!fromDate) return '';
  const days = daysBetween(fromDate, toDate);
  if (days < 0) return '';
  if (days < 60) return `${days} يوم`;
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months} شهر`;
  const years = Math.floor(days / 365.25);
  const rem = Math.floor((days - years * 365.25) / 30.44);
  return rem ? `${years} سنة و${rem} شهر` : `${years} سنة`;
}
export const followStartDate = (patient) => fuzzyToDate(patient?.followStart);
export const dmSinceDate = (patient) => fuzzyToDate(patient?.dm?.since);
export { addDays };
