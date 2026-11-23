// سلامة القوائم: كل قاعدة تشير لحقول ومواد ومجموعات وحالات معروفة، ومعرّفات فريدة، ونصوصها متغيراتها معرّفة.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALERT_RULES, LEVELS } from '../../app/src/config/catalog/alerts.js';
import { GENERICS, DRUG_CLASSES } from '../../app/src/config/catalog/drugs.js';
import { CONDITIONS } from '../../app/src/config/catalog/conditions.js';
import { LAB_TESTS, LAB_PANELS } from '../../app/src/config/catalog/labs.js';
import { SCREENING } from '../../app/src/config/catalog/care.js';

const FIELDS = new Set(['age', 'egfr', 'crcl', 'uacr', 'a1c', 'k', 'alt_uln', 'ast_uln', 'bmi', 'weight', 'ldl', 'fib4', 'cpep', 'tdd_kg', 'basal_kg', 'dose_day', 'dose_week', 'hypo2_90', 'sbp', 'dbp', 'b12', 'egfr', 'cgm']);
const G = new Set(GENERICS.map((g) => g.id));
const C = new Set(Object.keys(DRUG_CLASSES));
const CO = new Set(CONDITIONS.map((c) => c.id));

function checkPred(p, r) {
  if (Array.isArray(p)) {
    assert.ok(FIELDS.has(p[0]), `${r.id}: حقل ${p[0]}`);
    assert.ok(['<', '<=', '>', '>=', '=', '!='].includes(p[1]), `${r.id}: op`);
    if (typeof p[2] === 'string') assert.ok(r.params && p[2].slice(1) in r.params, `${r.id}: معامل ${p[2]}`);
    return;
  }
  const tok = p.has || p.lacks;
  if (tok) {
    const [a, b, c] = tok.split(':');
    if (a === 'cond') assert.ok(CO.has(b), `${r.id}: حالة ${b}`);
    if (a === 'class') assert.ok(C.has(b), `${r.id}: مجموعة ${b}`);
    if (a === 'generic') assert.ok(G.has(b), `${r.id}: مادة ${b}`);
    if (a === 'other') assert.ok(b === 'class' ? C.has(c) : G.has(c), `${r.id}: ${tok}`);
    return;
  }
  if (p.missing) {
    assert.ok(FIELDS.has(p.missing), `${r.id}: missing ${p.missing}`);
    return;
  }
  for (const q of p.any || p.all || []) checkPred(q, r);
}

test('القواعد سليمة', () => {
  const ids = new Set();
  for (const r of ALERT_RULES) {
    assert.ok(!ids.has(r.id), `معرّف مكرر ${r.id}`);
    ids.add(r.id);
    assert.ok(LEVELS[r.level], `${r.id}: level`);
    assert.ok(r.ref, `${r.id}: مرجع`);
    if ((r.scope || 'med') === 'med') {
      for (const g of r.med.g || []) assert.ok(G.has(g), `${r.id}: ${g}`);
      for (const c of r.med.c || []) assert.ok(C.has(c), `${r.id}: ${c}`);
    }
    for (const p of [...(r.all || []), ...(r.any || [])]) checkPred(p, r);
    for (const m of `${r.msg} ${r.suggest}`.matchAll(/\{\$([a-z0-9_]+)\}/gi)) assert.ok(r.params && m[1] in r.params, `${r.id}: {$${m[1]}}`);
  }
});

test('المواد الفعالة والتحاليل والمتابعات سليمة', () => {
  for (const g of GENERICS) for (const c of g.classes) assert.ok(C.has(c), `${g.id}: ${c}`);
  const T = new Set(LAB_TESTS.map((t) => t.id));
  assert.equal(T.size, LAB_TESTS.length);
  for (const p of LAB_PANELS) for (const t of p.tests) assert.ok(T.has(t), `${p.id}: ${t}`);
  for (const s of SCREENING) for (const t of s.tests || []) assert.ok(T.has(t), `${s.id}: ${t}`);
});
