// التحاليل: التحويل بين الوحدات، المدى المرجعي حسب النوع، علامة الارتفاع/الانخفاض، السلاسل الزمنية،
// والمؤشرات المحسوبة من تحاليل نفس اليوم (eGFR، FIB-4، Non-HDL، LDL المحسوب، eAG، UACR، HOMA-IR، TyG).
import { labTest, labTestsMap } from './catalog.js';
import { patientEntries } from './state.js';
import { ageAt } from './age.js';
import * as C from './calc.js';
import { cmp } from './util.js';

export function toCanonical(test, value, unit) {
  if (typeof value !== 'number' || !unit || unit === test.unit) return value;
  const u = (test.units || []).find((x) => x.u === unit);
  return u ? (value - (u.o || 0)) / u.f : value;
}
export function fromCanonical(test, value, unit) {
  if (typeof value !== 'number' || !unit || unit === test.unit) return value;
  const u = (test.units || []).find((x) => x.u === unit);
  return u ? value * u.f + (u.o || 0) : value;
}

export function refFor(test, sex) {
  if (!test?.ref) return null;
  if (test.ref.M || test.ref.F) return test.ref[sex] || test.ref.M || test.ref.F;
  return test.ref;
}
export function flagOf(test, v, sex) {
  const r = refFor(test, sex);
  if (!r || typeof v !== 'number') return null;
  if (r.hi !== null && r.hi !== undefined && v > r.hi) return 'H';
  if (r.lo !== null && r.lo !== undefined && v < r.lo) return 'L';
  return null;
}
export function refText(test, sex) {
  const r = refFor(test, sex);
  if (!r) return '';
  if ((r.lo === null || r.lo === 0) && r.hi !== null) return `< ${r.hi}`;
  if (r.hi === null || r.hi >= 200) return `> ${r.lo}`;
  return `${r.lo}–${r.hi}`;
}

// كل النتائج الرقمية والوصفية للمريض بالوحدة الأساسية، مرتبة تصاعدياً بالتاريخ.
export function labResults(state, patientId) {
  const out = [];
  for (const e of patientEntries(state, patientId, 'labs')) {
    for (const r of e.results) {
      const t = labTest(state, r.test);
      if (!t) continue;
      out.push({ date: e.date, entryId: e.id, ts: e.ts, test: r.test, v: typeof r.v === 'number' ? toCanonical(t, r.v, r.unit) : null, raw: r.v, unit: r.unit || t.unit, t: r.t || null });
    }
  }
  return out.sort((a, b) => cmp(a.date, b.date) || cmp(a.ts, b.ts));
}

export function seriesByTest(state, patientId) {
  const m = new Map();
  for (const r of labResults(state, patientId)) {
    if (!m.has(r.test)) m.set(r.test, []);
    m.get(r.test).push(r);
  }
  return m;
}

// آخر قيمة لتحليل في تاريخ أو قبله (الرقمية فقط إلا لو text).
export function latestLab(state, patientId, testId, asOf = '9999-12-31', results = null) {
  const rs = (results || labResults(state, patientId)).filter((r) => r.test === testId && r.date <= asOf && (r.v !== null || r.t));
  return rs.length ? rs[rs.length - 1] : null;
}

// المؤشرات المحسوبة لكل تاريخ فيه تحاليل. patient لازم للسن والنوع.
export function derivedByDate(state, patient, results = null) {
  const rs = results || labResults(state, patient.id);
  const byDate = new Map();
  for (const r of rs) {
    if (r.v === null) continue;
    if (!byDate.has(r.date)) byDate.set(r.date, {});
    byDate.get(r.date)[r.test] = r.v;
  }
  const out = new Map();
  for (const [date, v] of byDate) {
    const age = ageAt(patient, date);
    const d = {};
    if (v.creat !== undefined) d.egfr = v.cysc !== undefined ? C.egfrCrCys2021(v.creat, v.cysc, age, patient.sex) : C.egfrCkdEpi2021(v.creat, age, patient.sex);
    if (v.ast !== undefined && v.alt !== undefined && v.plt !== undefined) d.fib4 = C.fib4(age, v.ast, v.alt, v.plt);
    if (v.tc !== undefined && v.hdl !== undefined) d.nonhdl = C.nonHdl(v.tc, v.hdl);
    if (v.tc !== undefined && v.hdl !== undefined && v.tg !== undefined && v.ldl === undefined) d.ldlc = C.ldlSampson(v.tc, v.hdl, v.tg);
    if (v.a1c !== undefined) d.eag = C.eagFromA1c(v.a1c);
    if (v.uacr === undefined && v.ualb !== undefined && v.ucr !== undefined) d.uacrc = C.uacrFromSpot(v.ualb, v.ucr);
    if (v.insulin !== undefined && v.fbg !== undefined) d.homa = C.homaIR(v.insulin, v.fbg);
    if (v.tg !== undefined && v.fbg !== undefined) d.tyg = C.tyg(v.tg, v.fbg);
    for (const k of Object.keys(d)) if (d[k] === null || !Number.isFinite(d[k])) delete d[k];
    if (Object.keys(d).length) out.set(date, d);
  }
  return out;
}

// آخر قيمة لمؤشر محسوب في تاريخ أو قبله.
export function latestDerived(derived, key, asOf = '9999-12-31') {
  let best = null;
  for (const [date, d] of derived) if (date <= asOf && d[key] !== undefined && (!best || date > best.date)) best = { date, v: d[key] };
  return best;
}

// جدول مقارنة: آخر N تواريخ × التحاليل المختارة (أو كل اللي ليها نتائج)، مع الفرق عن القيمة السابقة.
export function compareTable(state, patient, { maxDates = 8, tests = null, cats = null } = {}) {
  const rs = labResults(state, patient.id);
  const derived = derivedByDate(state, patient, rs);
  const allDates = [...new Set([...rs.map((r) => r.date), ...derived.keys()])].sort();
  const dates = allDates.slice(-maxDates);
  const map = labTestsMap(state);
  const present = [...new Set(rs.map((r) => r.test))].filter((t) => (!tests || tests.includes(t)) && (!cats || cats.includes(map.get(t)?.cat)));
  const order = [...map.keys()];
  present.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const rows = present.map((tid) => {
    const t = map.get(tid);
    const series = rs.filter((r) => r.test === tid);
    let prev = null;
    const cells = new Map();
    for (const r of series) {
      const cell = { v: r.v, t: r.t, flag: r.v !== null ? flagOf(t, r.v, patient.sex) : null, delta: prev !== null && r.v !== null ? r.v - prev : null };
      cells.set(r.date, cell);
      if (r.v !== null) prev = r.v;
    }
    return { id: tid, test: t, cells: dates.map((d) => cells.get(d) || null), last: series[series.length - 1] || null };
  });
  return { dates, rows, derived: dates.map((d) => derived.get(d) || null) };
}
