// سيناريوهات سريرية: الدفتر ← السياق ← التنبيهات والمتابعات والجرعات. بيانات وهمية فقط.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Book } from '../../app/src/core/book.js';
import { patientContext } from '../../app/src/core/patient.js';
import { evaluateAlerts } from '../../app/src/core/alerts.js';
import { activeMeds, amountsByGeneric, doseText, insulinTotals, medList } from '../../app/src/core/meds.js';
import { screeningFor, openTasks, tasksCoveredByLabs } from '../../app/src/core/followup.js';
import { compareTable, derivedByDate, toCanonical } from '../../app/src/core/labs.js';
import { labTest } from '../../app/src/core/catalog.js';
import { smbgReadings, smbgStats, cgmEvaluate, targetsFor } from '../../app/src/core/glucose.js';

const TODAY = '2026-11-20';
const now = { now: '2026-11-20T10:00:00.000Z' };

function base({ sex = 'M', dob = '1960-03-01', dm = 'T2' } = {}) {
  const b = Book.seeded();
  b.upsert('patient', { id: 'p1', name: 'مريض تجريبي', sex, dob, sourceId: 'institute', followStart: { p: 'year', v: '2020' }, dm: { type: dm, since: { p: 'approx', v: '2015', t: 'من حوالي 10 سنين' } }, height: 170 }, now);
  return b;
}
const labs = (b, date, results) => b.addEntry({ kind: 'labs', patientId: 'p1', date, results }, now);
const start = (b, medId, drug, dose, date = '2026-01-01') => b.addEntry({ kind: 'med.start', patientId: 'p1', medId, date, drug, dose }, now);
const alertIds = (b, date = TODAY) => evaluateAlerts(b.state, patientContext(b.state, 'p1', date)).map((a) => a.ruleId);

const METFORMIN_1000 = { name: 'Glucophage', productId: 'glucophage', g: ['metformin'], s: [1000] };
const BID = (amount = 1, unit = 'tab') => ({ slots: [{ at: 'breakfast', amount, unit }, { at: 'dinner', amount, unit }], freq: 'daily' });

test('Metformin: ممنوع تحت 30 وتعديل جرعة بين 30 و 45', () => {
  const b = base();
  start(b, 'm1', METFORMIN_1000, BID());
  labs(b, '2026-11-01', [{ test: 'creat', v: 2.4 }]); // ذكر 66 سنة → eGFR ≈ 28
  const ctx = patientContext(b.state, 'p1', TODAY);
  assert.ok(ctx.f.egfr < 30, String(ctx.f.egfr));
  assert.ok(alertIds(b).includes('metformin-egfr30'));
  const b2 = base();
  start(b2, 'm1', METFORMIN_1000, BID());
  labs(b2, '2026-11-01', [{ test: 'creat', v: 1.8 }]); // eGFR ≈ 40
  const ids = alertIds(b2);
  assert.ok(ids.includes('metformin-egfr45-dose'), ids.join());
  assert.ok(!ids.includes('metformin-egfr30'));
  const a = evaluateAlerts(b2.state, patientContext(b2.state, 'p1', TODAY)).find((x) => x.ruleId === 'metformin-egfr45-dose');
  assert.match(a.msg, /2000/, 'الرسالة فيها الجرعة الحالية');
});

test('الوحدات البديلة: كرياتينين بالـ µmol/L يتحول قبل الحساب', () => {
  const t = labTest(Book.seeded().state, 'creat');
  assert.ok(Math.abs(toCanonical(t, 176.84, 'µmol/L') - 2) < 1e-9);
  const b = base();
  labs(b, '2026-11-01', [{ test: 'creat', v: 176.84, unit: 'µmol/L' }]);
  const ctx = patientContext(b.state, 'p1', TODAY);
  assert.ok(ctx.f.egfr > 30 && ctx.f.egfr < 40, String(ctx.f.egfr));
  const a1c = labTest(b.state, 'a1c');
  assert.ok(Math.abs(toCanonical(a1c, 53, 'mmol/mol') - 7) < 0.01);
});

test('نتيجة أقدم من سنة لا تُستخدم في التنبيهات، وقاعدة نقص البيانات تنبّه', () => {
  const b = base();
  start(b, 'm1', METFORMIN_1000, BID());
  labs(b, '2025-01-01', [{ test: 'creat', v: 2.6 }]);
  const ids = alertIds(b);
  assert.ok(!ids.includes('metformin-egfr30'));
  assert.ok(ids.includes('renal-monitor'));
});

test('Sitagliptin: جرعة الكلى من التركيبة (Janumet) بالمجم اليومي', () => {
  const b = base();
  start(b, 'j', { name: 'Janumet', productId: 'janumet', g: ['sitagliptin', 'metformin'], s: [50, 1000] }, BID());
  labs(b, '2026-11-01', [{ test: 'creat', v: 1.8 }]);
  const med = activeMeds(b.state, 'p1', TODAY)[0];
  const am = amountsByGeneric(b.state, med);
  assert.equal(am.get('sitagliptin').day, 100);
  assert.equal(am.get('metformin').day, 2000);
  const ids = alertIds(b);
  assert.ok(ids.includes('sita-egfr45'), ids.join());
  assert.ok(ids.includes('metformin-egfr45-dose'));
});

test('الحمل: تنبيهات SGLT2i و ACEi و statin والاقتراح بالإنسولين', () => {
  const b = base({ sex: 'F', dob: '1994-05-05' });
  start(b, 'e', { name: 'Jardiance', productId: 'jardiance', g: ['empagliflozin'], s: [10] }, { slots: [{ at: 'morning', amount: 1, unit: 'tab' }] });
  start(b, 'r', { name: 'Tritace', productId: 'tritace', g: ['ramipril'], s: [5] }, { slots: [{ at: 'morning', amount: 1, unit: 'tab' }] });
  start(b, 's', { name: 'Lipitor', productId: 'lipitor', g: ['atorvastatin'], s: [20] }, { slots: [{ at: 'evening', amount: 1, unit: 'tab' }] });
  b.upsert('condition', { patientId: 'p1', code: 'pregnancy', since: '2026-10-01', details: { lmp: '2026-09-01' } }, now);
  const ctx = patientContext(b.state, 'p1', TODAY);
  assert.equal(ctx.pregnant, true);
  assert.equal(ctx.pregnancyWeeks, 11);
  assert.equal(ctx.targets.profileId, 'pregnancy');
  const ids = alertIds(b);
  for (const id of ['sglt2-pregnancy', 'ras-pregnancy', 'statin-pregnancy', 'pregnancy-insulin']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes('gap-statin'), 'لا اقتراح ستاتين في الحمل');
});

test('HF: Pioglitazone ممنوع مع NYHA III واقتراح SGLT2i', () => {
  const b = base();
  start(b, 'pio', { name: 'Pioglitazone', g: ['pioglitazone'], s: [30] }, { slots: [{ at: 'morning', amount: 1, unit: 'tab' }] });
  b.upsert('condition', { patientId: 'p1', code: 'hf', details: { type: 'HFrEF', nyha: 'III' } }, now);
  const ids = alertIds(b);
  assert.ok(ids.includes('pio-hf-severe'));
  assert.ok(ids.includes('gap-sglt2-hf'));
});

test('GLP-1 RA: MTC ممنوع، والتكرار مع DPP-4i', () => {
  const b = base();
  start(b, 'oz', { name: 'Ozempic', productId: 'ozempic', g: ['semaglutide'] }, { slots: [{ at: 'any', amount: 1, unit: 'mg' }], freq: 'weekly', weekday: 5 });
  start(b, 'jv', { name: 'Januvia', productId: 'januvia', g: ['sitagliptin'], s: [100] }, { slots: [{ at: 'morning', amount: 1, unit: 'tab' }] });
  b.upsert('condition', { patientId: 'p1', code: 'mtc-men2', details: { who: 'family' } }, now);
  const ids = alertIds(b);
  assert.ok(ids.includes('incretin-mtc'));
  assert.ok(ids.includes('dpp4-incretin'));
  const oz = activeMeds(b.state, 'p1', TODAY).find((m) => m.medId === 'oz');
  assert.equal(amountsByGeneric(b.state, oz).get('semaglutide').week, 1);
  assert.match(doseText(b.state, oz), /أسبوعياً يوم الجمعة/);
});

test('الإنسولين: TDD والقاعدي و Overbasalization والجلوكاجون', () => {
  const b = base({ dm: 'T1' });
  b.addEntry({ kind: 'visit', patientId: 'p1', date: '2026-11-01', vitals: { weight: 60 } }, now);
  start(b, 'g', { name: 'Lantus', productId: 'lantus', g: ['glargine-u100'] }, { slots: [{ at: 'bedtime', amount: 36, unit: 'U' }] });
  start(b, 'a', { name: 'NovoRapid', productId: 'novorapid', g: ['aspart'] }, { slots: [{ at: 'breakfast', amount: 6, unit: 'U' }, { at: 'lunch', amount: 8, unit: 'U' }, { at: 'dinner', amount: 6, unit: 'U' }] });
  const tot = insulinTotals(b.state, activeMeds(b.state, 'p1', TODAY));
  assert.deepEqual(tot, { tdd: 56, basal: 36 });
  const ids = alertIds(b);
  assert.ok(ids.includes('insulin-overbasal'), '36/60 = 0.6 وحدة/كجم');
  assert.ok(ids.includes('gap-glucagon'));
  assert.ok(ids.includes('gap-cgm'));
});

test('تعديل وإيقاف الدواء بخط زمني، والجرعة في تاريخ سابق', () => {
  const b = base();
  start(b, 'm1', METFORMIN_1000, { slots: [{ at: 'dinner', amount: 1, unit: 'tab' }] }, '2026-01-01');
  b.addEntry({ kind: 'med.change', patientId: 'p1', medId: 'm1', date: '2026-03-01', dose: BID(), reason: 'زيادة' }, now);
  assert.throws(() => b.addEntry({ kind: 'med.change', patientId: 'p1', medId: 'm1', date: '2025-12-01', dose: BID() }, now), /قبل بداية/);
  b.addEntry({ kind: 'med.stop', patientId: 'p1', medId: 'm1', date: '2026-06-01', reason: 'إسهال' }, now);
  assert.equal(activeMeds(b.state, 'p1', TODAY).length, 0);
  const on = activeMeds(b.state, 'p1', '2026-02-01')[0];
  assert.equal(amountsByGeneric(b.state, on).get('metformin').day, 1000);
  const m = medList(b.state, 'p1')[0];
  assert.deepEqual(m.history.map((h) => h.kind), ['start', 'change', 'stop']);
  assert.throws(() => b.addEntry({ kind: 'med.change', patientId: 'p1', medId: 'm1', date: '2026-07-01', dose: BID() }, now), /متوقف/);
});

test('قاعدة معدّلة (معامل) وقاعدة مقفولة وإقرار التنبيه', () => {
  const b = base();
  start(b, 'm1', METFORMIN_1000, BID());
  labs(b, '2026-11-01', [{ test: 'creat', v: 1.8 }]); // eGFR ≈ 40
  b.upsert('rule', { id: 'metformin-egfr30', params: { egfr: 45 } }, now);
  assert.ok(alertIds(b).includes('metformin-egfr30'), 'الحد اتعدل لـ 45');
  b.upsert('rule', { id: 'metformin-egfr30', enabled: false }, now);
  assert.ok(!alertIds(b).includes('metformin-egfr30'));
  b.upsert('alert.ack', { patientId: 'p1', ruleId: 'metformin-egfr45-dose', medId: 'm1', note: 'مقصود' }, now);
  const a = evaluateAlerts(b.state, patientContext(b.state, 'p1', TODAY)).find((x) => x.ruleId === 'metformin-egfr45-dose');
  assert.ok(a.ack, 'التنبيه متعلّم عليه');
});

test('اقتراحات CKD: SGLT2i و ACEi/ARB و finerenone وتصنيف KDIGO', () => {
  const b = base();
  labs(b, '2026-11-01', [{ test: 'creat', v: 1.6 }, { test: 'uacr', v: 250 }, { test: 'k', v: 4.6 }]);
  let ctx = patientContext(b.state, 'p1', TODAY);
  assert.equal(ctx.aStage, 'A2');
  assert.ok(['G3a', 'G3b'].includes(ctx.gStage));
  let ids = alertIds(b);
  assert.ok(ids.includes('gap-sglt2-ckd') && ids.includes('gap-ras') && ids.includes('ckd-unlabeled'));
  start(b, 'l', { name: 'Losartan', g: ['losartan'], s: [50] }, { slots: [{ at: 'morning', amount: 1, unit: 'tab' }] });
  ids = alertIds(b);
  assert.ok(ids.includes('gap-finerenone') && !ids.includes('gap-ras'));
});

test('مقارنة التحاليل والمؤشرات المحسوبة (eGFR و FIB-4 و LDL)', () => {
  const b = base();
  labs(b, '2026-05-01', [{ test: 'a1c', v: 8.4 }, { test: 'creat', v: 1.1 }, { test: 'tc', v: 220 }, { test: 'hdl', v: 40 }, { test: 'tg', v: 200 }]);
  labs(b, '2026-11-01', [{ test: 'a1c', v: 7.2 }, { test: 'alt', v: 36 }, { test: 'ast', v: 40 }, { test: 'plt', v: 200 }]);
  const p = b.state.entities.get('patient').get('p1');
  const d = derivedByDate(b.state, p);
  assert.ok(d.get('2026-05-01').egfr > 60);
  assert.ok(d.get('2026-05-01').ldlc > 100);
  assert.ok(Math.abs(d.get('2026-11-01').fib4 - (66 * 40) / (200 * 6)) < 1e-9);
  const t = compareTable(b.state, p);
  assert.deepEqual(t.dates, ['2026-05-01', '2026-11-01']);
  const a1c = t.rows.find((r) => r.id === 'a1c');
  assert.equal(a1c.cells[1].flag, 'H');
  assert.ok(Math.abs(a1c.cells[1].delta + 1.2) < 1e-9);
});

test('المتابعات الدورية والمهام المنتظرة وتغطيتها بالتحاليل', () => {
  const b = base();
  labs(b, '2025-06-01', [{ test: 'a1c', v: 9 }]);
  start(b, 'm1', METFORMIN_1000, BID());
  const ctx = patientContext(b.state, 'p1', TODAY);
  const s = screeningFor(b.state, ctx, TODAY);
  const byId = Object.fromEntries(s.map((x) => [x.item.id, x]));
  assert.equal(byId.a1c.status, 'overdue');
  assert.equal(byId.eye.status, 'never');
  assert.ok(byId.b12, 'B12 مع الميتفورمين');
  assert.ok(!byId.tsh, 'TSH للنوع الأول بس');
  b.upsert('task', { patientId: 'p1', type: 'lab', tests: ['a1c', 'uacr'], due: '2026-11-25', created: '2026-11-10', status: 'open' }, now);
  b.upsert('task', { patientId: 'p1', type: 'visit', title: 'متابعة', due: '2026-11-18', status: 'open' }, now);
  const open = openTasks(b.state, { today: TODAY });
  assert.equal(open[0].level, 'overdue');
  const cov = tasksCoveredByLabs(b.state, 'p1', ['a1c'], '2026-11-20');
  assert.equal(cov.length, 1);
  assert.deepEqual(cov[0].remaining, ['uacr']);
});

test('قراءات السكر المنزلية و CGM مقابل الأهداف', () => {
  const b = base();
  b.addEntry({ kind: 'smbg', patientId: 'p1', date: TODAY, days: [{ d: '2026-11-18', r: { fasting: 150, postB: 220, bed: 60 } }, { d: '2026-11-19', r: { fasting: 130, postD: 190 } }] }, now);
  const p = b.state.entities.get('patient').get('p1');
  const tg = targetsFor(p, { age: 66 });
  assert.equal(tg.profileId, 'older-healthy');
  const st = smbgStats(smbgReadings(b.state, 'p1'), tg);
  assert.equal(st.n, 5);
  assert.equal(st.days, 2);
  assert.equal(st.lows.length, 1);
  assert.equal(st.bySlot.find((x) => x.slot.id === 'fasting').above, 1);
  const ev = cgmEvaluate({ tir: 65, tbr1: 3, tbr2: 1.5, tar1: 22, tar2: 8.5, cv: 38 }, targetsFor(p, { age: 50 }));
  const okMap = Object.fromEntries(ev.map((r) => [r.key, r.ok]));
  assert.equal(okMap.tir, false);
  assert.equal(okMap.tbr2, false);
  assert.equal(okMap.cv, false);
  assert.throws(() => b.addEntry({ kind: 'cgm', patientId: 'p1', date: TODAY, tir: 70, tbr1: 3, tbr2: 1, tar1: 10, tar2: 5 }, now), /100%/);
});

test('التحقق: رفض قيم غير معقولة وأنواع غير معروفة', () => {
  const b = base();
  assert.throws(() => labs(b, TODAY, [{ test: 'nope', v: 1 }]), /غير معروف/);
  assert.throws(() => labs(b, TODAY, [{ test: 'a1c', v: 'x' }]), /رقم/);
  assert.throws(() => b.addEntry({ kind: 'visit', patientId: 'p1', date: TODAY, vitals: { sbp: 400 } }, now), /خارج المعقول/);
  assert.throws(() => b.upsert('patient', { name: '', sex: 'M' }, now), /اسم/);
  assert.throws(() => start(b, 'x', { name: 'X', g: ['unknown'] }, BID()), /غير معروفة/);
  assert.throws(() => b.addEntry({ kind: 'hypo', patientId: 'p1', date: TODAY, level: 2, value: 60 }, now), /أقل من 54/);
  assert.throws(() => b.upsert('patient', { id: 'p1', followStart: { p: 'month', v: '2020' } }, now), /التاريخ غير صالح/);
});

test('تعديل عنصر في المكتبة الافتراضية يُدمج (تأكيد مراجعة اسم تجاري)', () => {
  const b = base();
  b.upsert('drug.product', { id: 'glucophage', reviewed: true }, now);
  b.upsert('drug.product', { id: 'glucophage', v: [[500], [850], [1000], [750]] }, now);
  b.upsert('lab.test', { id: 'alt', ref: { lo: 0, hi: 35 } }, now);
  b.upsert('drug.product', { name: 'دواء محلي', g: ['metformin'], v: [[500]], unit: 'tab', form: 'tab' }, now);
});
