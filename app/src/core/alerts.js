// محرك التنبيهات: يقيّم القواعد (config/catalog/alerts.js + تعديلات الطبيب) على سياق المريض.
// منطق ثلاثي مبسّط: شرط بيانات ناقصة = لا ينطبق (لا تنبيه بدون بيانات)، وقواعد «missing» تنبّه لنقص البيانات نفسه.
import { LEVELS } from '../config/catalog/alerts.js';
import { DIABETES_TYPES } from '../config/catalog/conditions.js';
import { generic, rulesMap } from './catalog.js';
import { listEntities } from './state.js';
import { amountsByGeneric, medTitle } from './meds.js';
import { daysBetween } from './util.js';
import { plainNum } from './num.js';

const DP = { egfr: 0, crcl: 0, uacr: 0, a1c: 1, k: 1, alt_uln: 1, ast_uln: 1, bmi: 1, fib4: 2, basal_kg: 2, tdd_kg: 2, ldl: 0, age: 0, weight: 1, sbp: 0, dbp: 0, hypo2_90: 0, cpep: 2 };

function hasTok(tok, det, ctx, med) {
  const [a, b, c] = tok.split(':');
  if (a === 'cond') {
    const cond = ctx.conds.get(b);
    if (!cond) return false;
    if (!det) return true;
    return Object.entries(det).every(([k, vals]) => vals.includes(String(cond.details?.[k] ?? '')));
  }
  if (a === 'class') return ctx.classes.has(b);
  if (a === 'generic') return ctx.generics.has(b);
  if (a === 'other') {
    const others = ctx.meds.filter((m) => !med || m.medId !== med.medId);
    if (b === 'class') return others.some((m) => m.classes.has(c));
    if (b === 'generic') return others.some((m) => (m.drug.g || []).includes(c));
    return false;
  }
  if (a === 'dm') return b === 'any' ? DIABETES_TYPES.includes(ctx.dmType) : ctx.dmType === b;
  if (a === 'sex') return ctx.sex === b;
  if (a === 'flag') return b === 'insulinDeficient' ? !!ctx.insulinDeficient : false;
  return false;
}

function matchedGenerics(state, rule, med) {
  const gs = med.drug.g || [];
  if (!rule.med) return gs;
  return gs.filter((g) => (rule.med.g || []).includes(g) || (rule.med.c || []).some((c) => (generic(state, g)?.classes || []).includes(c)));
}

function fieldValue(name, ctx, med, rule, gens) {
  if (name === 'dose_day' || name === 'dose_week') {
    if (!med) return null;
    const amounts = amountsByGeneric(ctx.state, med, med.dose);
    let sum = null;
    for (const g of gens) {
      const a = amounts.get(g);
      if (!a || a.day === null) continue;
      sum = (sum || 0) + (name === 'dose_day' ? a.day : a.week);
    }
    return sum === null ? null : Math.round(sum * 1000) / 1000;
  }
  const v = ctx.f[name];
  return typeof v === 'number' ? v : null;
}

const resolve = (val, params) => (typeof val === 'string' && val.startsWith('$') ? params[val.slice(1)] : val);

function evalPred(p, ctx, med, rule, gens, params) {
  if (Array.isArray(p)) {
    const [name, op, raw] = p;
    const v = fieldValue(name, ctx, med, rule, gens);
    const x = resolve(raw, params);
    if (v === null || typeof x !== 'number') return false;
    switch (op) {
      case '<':
        return v < x;
      case '<=':
        return v <= x;
      case '>':
        return v > x;
      case '>=':
        return v >= x;
      case '=':
        return v === x;
      case '!=':
        return v !== x;
      default:
        return false;
    }
  }
  if (p.has) return hasTok(p.has, p.d, ctx, med);
  if (p.lacks) return !hasTok(p.lacks, p.d, ctx, med);
  if (p.missing) {
    const days = resolve(p.days, params) ?? 365;
    const last = ctx.d[p.missing];
    return !last || daysBetween(last, ctx.date) > days;
  }
  if (p.any) return p.any.some((q) => evalPred(q, ctx, med, rule, gens, params));
  if (p.all) return p.all.every((q) => evalPred(q, ctx, med, rule, gens, params));
  return false;
}

export function ruleMatches(rule, ctx, med = null) {
  const params = { ...(rule.defaults || {}), ...(rule.params || {}) };
  const gens = med ? matchedGenerics(ctx.state, rule, med) : [];
  const all = rule.all || [];
  const any = rule.any || [];
  return all.every((p) => evalPred(p, ctx, med, rule, gens, params)) && (!any.length || any.some((p) => evalPred(p, ctx, med, rule, gens, params)));
}

const medMatches = (rule, med) => {
  const m = rule.med || {};
  const gs = med.drug.g || [];
  if ((m.xg || []).some((g) => gs.includes(g))) return false;
  return gs.some((g) => (m.g || []).includes(g)) || (m.c || []).some((c) => med.classes.has(c));
};

function fill(text, ctx, med, rule, params, gens) {
  return String(text || '').replace(/\{(\$?)([a-z0-9_]+)\}/gi, (all, dollar, key) => {
    if (dollar) return params[key] !== undefined ? plainNum(params[key]) : all;
    const v = fieldValue(key, ctx, med, rule, gens);
    if (v === null) return '—';
    const dp = DP[key];
    return dp === undefined ? plainNum(v) : v.toFixed(dp);
  });
}

// كل التنبيهات المنطبقة على المريض. ctx من patientContext مع state.
export function evaluateAlerts(state, ctx) {
  const out = [];
  const c = { ...ctx, state };
  const acks = listEntities(state, 'alert.ack').filter((a) => a.patientId === ctx.patient.id);
  const ackOf = (ruleId, medId) => acks.find((a) => a.ruleId === ruleId && (a.medId || null) === (medId || null)) || null;
  for (const rule of rulesMap(state).values()) {
    if (!rule.enabled) continue;
    const params = { ...(rule.defaults || {}), ...(rule.params || {}) };
    const push = (med) => {
      const gens = med ? matchedGenerics(state, rule, med) : [];
      out.push({
        key: `${rule.id}|${med?.medId || ''}`,
        ruleId: rule.id,
        medId: med?.medId || null,
        medTitle: med ? medTitle(med) : '',
        level: rule.level,
        title: rule.title,
        msg: fill(rule.msg, c, med, rule, params, gens),
        suggest: fill(rule.suggest, c, med, rule, params, gens),
        ref: rule.ref || '',
        custom: !!rule.custom,
        ack: ackOf(rule.id, med?.medId),
      });
    };
    if ((rule.scope || 'med') === 'med') {
      for (const med of ctx.meds) if (medMatches(rule, med) && ruleMatches(rule, c, med)) push(med);
    } else if (ruleMatches(rule, c, null)) push(null);
  }
  out.sort((a, b) => (LEVELS[a.level]?.order ?? 9) - (LEVELS[b.level]?.order ?? 9));
  return out;
}

// قواعد تنطبق على دواء معيّن لو اتضاف (معاينة قبل الحفظ). med: {drug, classes, dose, medId:'__new'}.
export function previewAlertsForMed(state, ctx, med) {
  const c = { ...ctx, state, meds: [...ctx.meds, med], classes: new Set([...ctx.classes, ...med.classes]), generics: new Set([...ctx.generics, ...(med.drug.g || [])]) };
  const before = new Set(evaluateAlerts(state, ctx).map((x) => x.key));
  return evaluateAlerts(state, c).filter((a) => a.medId === med.medId || !before.has(a.key));
}
