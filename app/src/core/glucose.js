// قراءات السكر المنزلية (SMBG)، تقارير CGM، نوبات الهبوط، والأهداف العلاجية للمريض.
import { SMBG_SLOTS, TARGET_PROFILES } from '../config/catalog/care.js';
import { patientEntries } from './state.js';
import { addDays, cmp } from './util.js';
import { gmiFromMean } from './calc.js';

// الأهداف الفعلية: مجموعة الأهداف المختارة للمريض (أو المقترحة) + أي تعديل خاص به.
export function suggestedProfile(patient, { age = null, pregnant = false, frail = false } = {}) {
  if (pregnant) return patient?.dm?.type === 'GDM' ? 'gdm' : 'pregnancy';
  if (patient?.dm?.type === 'GDM') return 'gdm';
  if (age !== null && age >= 65) return frail ? 'older-complex' : 'older-healthy';
  return 'standard';
}
export function targetsFor(patient, ctx = {}, defaultProfile = 'standard') {
  const auto = suggestedProfile(patient, ctx);
  const id = patient?.targetProfile || (auto !== 'standard' ? auto : defaultProfile);
  const base = TARGET_PROFILES.find((p) => p.id === id) || TARGET_PROFILES[0];
  const o = patient?.targets || {};
  return { ...base, a1c: o.a1c ?? base.a1c, fpg: o.fpg ?? base.fpg, ppg: o.ppg ?? base.ppg, custom: !!(o.a1c || o.fpg || o.ppg), auto: !patient?.targetProfile, profileId: id };
}

// ---------- SMBG ----------
export function smbgReadings(state, patientId, { from = null, to = null } = {}) {
  const out = [];
  for (const e of patientEntries(state, patientId, 'smbg')) {
    for (const d of e.days) {
      if ((from && d.d < from) || (to && d.d > to)) continue;
      for (const [slot, v] of Object.entries(d.r || {})) out.push({ date: d.d, slot, v, entryId: e.id });
    }
  }
  const order = SMBG_SLOTS.map((s) => s.id);
  return out.sort((a, b) => cmp(a.date, b.date) || order.indexOf(a.slot) - order.indexOf(b.slot));
}

function basic(vals) {
  if (!vals.length) return null;
  const n = vals.length;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, sd, cv: mean ? (sd / mean) * 100 : null, min: Math.min(...vals), max: Math.max(...vals) };
}

// إحصاء القراءات: الكل + لكل ميعاد، ونسب تحت/في/فوق المدى.
export function smbgStats(readings, targets = null) {
  const vals = readings.map((r) => r.v);
  const all = basic(vals);
  if (!all) return null;
  const pct = (f) => (vals.filter(f).length / vals.length) * 100;
  const bySlot = SMBG_SLOTS.map((s) => {
    const vs = readings.filter((r) => r.slot === s.id).map((r) => r.v);
    const b = basic(vs);
    if (!b) return null;
    let above = null;
    if (targets) {
      if (s.kind === 'fasting' || s.kind === 'pre') above = vs.filter((v) => targets.fpg && v > targets.fpg[1]).length;
      else if (s.kind === 'post') above = targets.ppg ? vs.filter((v) => v > targets.ppg).length : null;
    }
    return { slot: s, ...b, low: vs.filter((v) => v < 70).length, above };
  }).filter(Boolean);
  const days = new Set(readings.map((r) => r.date)).size;
  return {
    ...all,
    days,
    perDay: readings.length / Math.max(1, days),
    below70: pct((v) => v < 70),
    below54: pct((v) => v < 54),
    inRange: pct((v) => v >= 70 && v <= 180),
    above180: pct((v) => v > 180),
    above250: pct((v) => v > 250),
    bySlot,
    lows: readings.filter((r) => r.v < 70),
    from: readings[0].date,
    to: readings[readings.length - 1].date,
  };
}

// ---------- CGM ----------
export function cgmReports(state, patientId) {
  return patientEntries(state, patientId, 'cgm').sort((a, b) => cmp(a.date, b.date) || cmp(a.ts, b.ts));
}
export const tbrTotal = (r) => (typeof r.tbr1 === 'number' || typeof r.tbr2 === 'number' ? (r.tbr1 || 0) + (r.tbr2 || 0) : null);
export const tarTotal = (r) => (typeof r.tar1 === 'number' || typeof r.tar2 === 'number' ? (r.tar1 || 0) + (r.tar2 || 0) : null);
export const cgmGmi = (r) => (typeof r.gmi === 'number' ? r.gmi : gmiFromMean(r.mean));

// تقييم تقرير CGM مقابل الأهداف: [{key, label, value, target, ok}]
export function cgmEvaluate(r, targets) {
  const t = targets?.cgm || TARGET_PROFILES[0].cgm;
  const rows = [];
  const push = (key, label, value, target, good, unit = '%') => {
    if (typeof value !== 'number' || target === null || target === undefined) return;
    rows.push({ key, label, value, target, ok: good(value, target), unit });
  };
  push('active', 'Active time', r.active, 70, (v, x) => v >= x);
  push('tir', `TIR (${t.range ? t.range.join('–') : '70–180'})`, r.tir, t.tir, (v, x) => v > x);
  push('tbr', 'TBR <70 (total)', tbrTotal(r), t.tbr, (v, x) => v < x);
  push('tbr2', 'TBR <54', r.tbr2, t.tbr2, (v, x) => v < x);
  push('tar', 'TAR >180 (total)', tarTotal(r), t.tar, (v, x) => v < x);
  push('tar2', 'TAR >250', r.tar2, t.tar2, (v, x) => v < x);
  push('cv', 'CV', r.cv, t.cv, (v, x) => v <= x);
  return rows;
}

// ---------- الهبوط ----------
export function hypoEvents(state, patientId) {
  return patientEntries(state, patientId, 'hypo').sort((a, b) => cmp(b.date, a.date) || cmp(b.ts, a.ts));
}
export function hypoCount(state, patientId, { days = 90, minLevel = 2, asOf }) {
  const from = addDays(asOf, -days);
  return patientEntries(state, patientId, 'hypo').filter((e) => e.date >= from && e.date <= asOf && e.level >= minLevel).length;
}
