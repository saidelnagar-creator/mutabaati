// المتابعة: الفحوصات الدورية المستحقة (ADA) والمهام المنتظرة (تحاليل منتظرة، ميعاد المتابعة الجاية، أسئلة للمريض).
import { SCREENING } from '../config/catalog/care.js';
import { listEntities, patientEntries } from './state.js';
import { labResults } from './labs.js';
import { addDays, addMonths, cmp } from './util.js';

export const monthsFor = (state, item) => {
  const v = state.settings[`screen.${item.id}`];
  return Number.isInteger(v) && v > 0 ? v : item.months;
};
export const monthsAltFor = (state, item) => {
  const v = state.settings[`screen.${item.id}.alt`];
  return Number.isInteger(v) && v > 0 ? v : item.monthsAlt;
};

function applies(item, ctx) {
  switch (item.when) {
    case 'dm':
      return ctx.isDiabetic;
    case 'T1':
      return ctx.dmType === 'T1';
    case 'T2':
      return ctx.dmType === 'T2';
    case 'metformin':
      return ctx.generics.has('metformin');
    case 'ras':
      return ['acei', 'arb', 'arni', 'mra', 'ns-mra'].some((c) => ctx.classes.has(c));
    default:
      return true;
  }
}

const addM = (date, m) => {
  const ym = addMonths(date.slice(0, 7), m);
  const day = Math.min(Number(date.slice(8, 10)), 28);
  return `${ym}-${String(day).padStart(2, '0')}`;
};

// بنود المتابعة الدورية للمريض: [{item, last, due, months, status: overdue|soon|ok|never}]
export function screeningFor(state, ctx, today) {
  if (!ctx) return [];
  const results = labResults(state, ctx.patient.id);
  const exams = patientEntries(state, ctx.patient.id, 'exam');
  const out = [];
  for (const item of SCREENING) {
    if (!applies(item, ctx)) continue;
    if (state.settings[`screen.${item.id}.off`]) continue;
    let last = null;
    let lastExam = null;
    if (item.tests) for (const r of results) if (item.tests.includes(r.test) && (!last || r.date > last)) last = r.date;
    if (item.exam)
      for (const e of exams)
        if (e.exam === item.exam && (!last || e.date >= last)) {
          last = e.date;
          lastExam = e;
        }
    let months = monthsFor(state, item);
    const alt = monthsAltFor(state, item);
    if (alt) {
      const a1c = ctx.f.a1c;
      const tgt = ctx.targets?.a1c;
      if (item.altWhen === 'above-target' && a1c !== undefined && tgt && a1c > tgt) months = alt;
      if (item.altWhen === 'ckd' && ((ctx.f.egfr !== undefined && ctx.f.egfr < 60) || (ctx.f.uacr !== undefined && ctx.f.uacr >= 30))) months = ctx.f.egfr !== undefined && ctx.f.egfr < 30 ? Math.min(alt, 3) : alt;
      if (item.altWhen === 'no-retinopathy-controlled' && lastExam?.result?.grade === 'none' && !ctx.conds.has('retinopathy') && a1c !== undefined && tgt && a1c <= tgt) months = alt;
      if (item.altWhen === 'foot-risk' && (ctx.conds.has('foot') || ['2', '3'].includes(lastExam?.result?.risk))) months = alt;
    }
    const due = last ? addM(last, months) : null;
    const status = !last ? 'never' : due < today ? 'overdue' : due <= addDays(today, 30) ? 'soon' : 'ok';
    out.push({ item, last, due, months, status });
  }
  const rank = { overdue: 0, never: 1, soon: 2, ok: 3 };
  return out.sort((a, b) => rank[a.status] - rank[b.status] || cmp(a.due || '', b.due || ''));
}

// ---------- المهام المنتظرة ----------
export const TASK_TYPES = { visit: 'ميعاد متابعة', lab: 'تحاليل منتظرة', ask: 'أسأله عن', other: 'أخرى' };

export function taskLevel(t, today) {
  if (!t.due) return 'nodate';
  if (t.due < today) return 'overdue';
  if (t.due === today) return 'today';
  return 'upcoming';
}

export function openTasks(state, { patientId = null, today, horizon = null } = {}) {
  const list = listEntities(state, 'task').filter((t) => (t.status || 'open') === 'open' && (!patientId || t.patientId === patientId));
  const out = list.map((t) => ({ ...t, level: taskLevel(t, today) })).filter((t) => !horizon || !t.due || t.due <= addDays(today, horizon) || t.level === 'nodate');
  const rank = { overdue: 0, today: 1, upcoming: 2, nodate: 3 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || cmp(a.due || '9999', b.due || '9999'));
}

export function nextVisit(state, patientId, today) {
  return openTasks(state, { patientId, today }).find((t) => t.type === 'visit') || null;
}

// عند حفظ تحاليل: المهام المنتظرة اللي اتغطت تحاليلها. يعيد [{task, done: bool, remaining: [...]}]
export function tasksCoveredByLabs(state, patientId, testIds, date) {
  const got = new Set(testIds);
  const out = [];
  for (const t of listEntities(state, 'task')) {
    if (t.patientId !== patientId || (t.status || 'open') !== 'open' || t.type !== 'lab' || !t.tests?.length) continue;
    if (t.created && t.created > date) continue;
    const remaining = t.tests.filter((x) => !got.has(x));
    if (remaining.length < t.tests.length) out.push({ task: t, done: remaining.length === 0, remaining });
  }
  return out;
}

export function lastVisit(state, patientId) {
  return patientEntries(state, patientId, 'visit').sort((a, b) => cmp(b.date, a.date) || cmp(b.ts, a.ts))[0] || null;
}
