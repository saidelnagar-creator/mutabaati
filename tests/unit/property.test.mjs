// خواص عشوائية: أي تسلسل عمليات صالحة يعطي نفس الحالة عند إعادة البناء من السجل، والإلغاء لا يمسح شيئاً،
// وتقييم التنبيهات والمتابعات لا ينهار على أي بيانات.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Book } from '../../app/src/core/book.js';
import { buildState } from '../../app/src/core/engine.js';
import { patientContext } from '../../app/src/core/patient.js';
import { evaluateAlerts } from '../../app/src/core/alerts.js';
import { screeningFor } from '../../app/src/core/followup.js';
import { compareTable } from '../../app/src/core/labs.js';
import { medList } from '../../app/src/core/meds.js';
import { GENERICS, PRODUCTS } from '../../app/src/config/catalog/drugs.js';
import { CONDITIONS } from '../../app/src/config/catalog/conditions.js';
import { stableStringify } from '../../app/src/core/util.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const day = (r) => `2026-${String(1 + Math.floor(r() * 11)).padStart(2, '0')}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`;
const snapshot = (st) => stableStringify({ e: [...st.entities].map(([k, m]) => [k, [...m.values()].map(({ createdAt, updatedAt, ...x }) => x)]), n: st.entries.map((e) => ({ ...e, ts: undefined })) });

for (const seed of [1, 7, 42, 99, 2026]) {
  test(`تسلسل عشوائي (seed ${seed}): إعادة البناء متطابقة ولا انهيار`, () => {
    const r = rng(seed);
    const b = Book.seeded();
    const pts = [];
    for (let i = 0; i < 4; i++) pts.push(b.upsert('patient', { name: `م${i}`, sex: pick(r, ['M', 'F']), birthYear: 1940 + Math.floor(r() * 60), dm: { type: pick(r, ['T1', 'T2', 'LADA', 'pre']) }, height: 150 + Math.floor(r() * 40) }).id);
    let ok = 0;
    for (let i = 0; i < 160; i++) {
      const pid = pick(r, pts);
      const act = Math.floor(r() * 7);
      try {
        if (act === 0) b.addEntry({ kind: 'labs', patientId: pid, date: day(r), results: [{ test: pick(r, ['a1c', 'creat', 'uacr', 'alt', 'ast', 'plt', 'k', 'ldl']), v: Math.round(r() * 300) / 10 + 0.3 }] });
        else if (act === 1) {
          const p = pick(r, PRODUCTS.filter((x) => x.v.length));
          b.addEntry({ kind: 'med.start', patientId: pid, medId: `m${i}`, date: day(r), drug: { productId: p.id, name: p.name, g: p.g, s: pick(r, p.v) }, dose: { slots: [{ at: 'morning', amount: 1 + Math.floor(r() * 2), unit: p.unit }], freq: 'daily' } });
        } else if (act === 2) {
          const m = pick(r, medList(b.state, pid));
          if (m) b.addEntry({ kind: pick(r, ['med.change', 'med.stop']), patientId: pid, medId: m.medId, date: '2026-12-01', dose: { slots: [{ at: 'dinner', amount: 1, unit: 'tab' }] }, reason: 'x' });
        } else if (act === 3) b.upsert('condition', { patientId: pid, code: pick(r, CONDITIONS).id, details: {} });
        else if (act === 4) b.addEntry({ kind: 'visit', patientId: pid, date: day(r), vitals: { weight: 50 + Math.floor(r() * 60), sbp: 100 + Math.floor(r() * 60) } });
        else if (act === 5) {
          const e = pick(r, b.state.entries.filter((x) => !x.voided && !x.kind.startsWith('med.')));
          if (e) b.voidEntry(e.id, 'خطأ');
        } else b.addEntry({ kind: 'hypo', patientId: pid, date: day(r), level: pick(r, [1, 2, 3]) });
        ok++;
      } catch (e) {
        if (e.name !== 'ValidationError') throw e;
      }
    }
    assert.ok(ok > 80, `عمليات ناجحة قليلة: ${ok}`);
    const rebuilt = buildState(JSON.parse(JSON.stringify(b.events)));
    const A = snapshot(rebuilt), B = snapshot(b.state);
    if (A !== B) { let k = 0; while (A[k] === B[k]) k++; console.log("DIFF@", k, A.slice(k - 200, k + 150), "\n---\n", B.slice(k - 200, k + 150)); }
    assert.equal(A, B);
    assert.equal(b.state.entries.length, b.events.filter((e) => e.type === 'entry.add').length, 'الإلغاء لا يحذف قيوداً');
    for (const pid of pts) {
      const c = patientContext(b.state, pid, '2026-12-15');
      const alerts = evaluateAlerts(b.state, c);
      for (const a of alerts) assert.ok(!/\{[a-z$_]+\}/i.test(a.msg), `نص فيه متغير مش متعوض: ${a.msg}`);
      screeningFor(b.state, c, '2026-12-15');
      compareTable(b.state, b.state.entities.get('patient').get(pid));
    }
  });
}

test('كل المنتجات تشير لمواد فعالة موجودة وتركيزاتها بعدد المواد', () => {
  const ids = new Set(GENERICS.map((g) => g.id));
  assert.equal(ids.size, GENERICS.length, 'معرّفات مكررة');
  for (const p of PRODUCTS) {
    for (const g of p.g) assert.ok(ids.has(g), `${p.id}: ${g}`);
    for (const v of p.v) assert.equal(v.length, p.g.length, `${p.id}: ${v}`);
  }
});
