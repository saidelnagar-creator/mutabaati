// المعادلات: قيم مرجعية محسوبة يدوياً من المعادلات المنشورة.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../app/src/core/calc.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b}`);

test('eGFR CKD-EPI 2021 (كرياتينين)', () => {
  // ذكر 50 سنة، كرياتينين 1.0: 142 × (1/0.9)^-1.2 × 0.9938^50 ≈ 91.7
  near(C.egfrCkdEpi2021(1.0, 50, 'M'), 91.7, 0.2, 'M50 Cr1.0');
  // أنثى 60 سنة، كرياتينين 1.2 → ≈ 51.8
  near(C.egfrCkdEpi2021(1.2, 60, 'F'), 51.8, 0.2, 'F60 Cr1.2');
  // أنثى 40 سنة كرياتينين 0.6 (تحت κ): 142 × (0.6/0.7)^-0.241 × 0.9938^40 × 1.012 ≈ 116
  near(C.egfrCkdEpi2021(0.6, 40, 'F'), 116.3, 0.2, 'F40 Cr0.6');
  assert.equal(C.egfrCkdEpi2021(1, 15, 'M'), null, 'تحت 18 لا يُحسب');
  assert.equal(C.egfrCkdEpi2021(null, 50, 'M'), null);
});

test('eGFR بالكرياتينين + Cystatin C والـ Cystatin وحده', () => {
  const v = C.egfrCrCys2021(1.0, 1.0, 50, 'M');
  // 135 × (1/0.9)^-0.544 × (1/0.8)^-0.778 × 0.9961^50 ≈ 92.5... نتحقق من المدى المعقول والاتجاه
  assert.ok(v > 80 && v < 100, String(v));
  assert.ok(C.egfrCrCys2021(1.0, 1.5, 50, 'M') < v, 'Cystatin أعلى = eGFR أقل');
  near(C.egfrCys2012(0.8, 50, 'M'), 133 * 0.996 ** 50, 0.01, 'Cys 0.8');
});

test('Cockcroft-Gault والوزن المثالي والمعدّل', () => {
  near(C.crclCG(1.0, 60, 70, 'M'), (80 * 70) / 72, 0.001, 'CG M');
  near(C.crclCG(1.0, 60, 70, 'F'), ((80 * 70) / 72) * 0.85, 0.001, 'CG F');
  near(C.ibw(175, 'M'), 50 + 2.3 * (175 / 2.54 - 60), 0.001, 'IBW');
  const r = C.crclAuto(1.0, 60, 120, 170, 'M'); // BMI 41.5 → الوزن المعدّل
  assert.equal(r.basis, 'adjusted');
  assert.ok(r.weightUsed < 120 && r.weightUsed > 66);
});

test('FIB-4 وتصنيفه حسب السن', () => {
  // 55 سنة، AST 40، ALT 36، PLT 200 → 55×40/(200×6) = 1.833
  near(C.fib4(55, 40, 36, 200), 1.8333, 0.001, 'FIB-4');
  assert.equal(C.fib4Risk(1.2, 55).id, 'low');
  assert.equal(C.fib4Risk(1.8, 55).id, 'mid');
  assert.equal(C.fib4Risk(1.8, 70).id, 'low', '≥ 65: الحد الأدنى 2.0');
  assert.equal(C.fib4Risk(3, 55).id, 'high');
  assert.equal(C.fib4Risk(1, 30).id, 'unreliable');
});

test('BMI والتصنيف و BSA', () => {
  near(C.bmi(80, 170), 27.68, 0.01, 'BMI');
  assert.equal(C.bmiClass(27.7).id, 'over');
  assert.equal(C.bmiClass(41).id, 'ob3');
  near(C.bsaMosteller(80, 170), Math.sqrt((80 * 170) / 3600), 1e-9, 'BSA');
});

test('السكر: eAG و GMI و IFCC', () => {
  near(C.eagFromA1c(7), 154.2, 0.05, 'eAG 7%');
  near(C.gmiFromMean(154), 3.31 + 0.02392 * 154, 1e-9, 'GMI');
  near(C.a1cToIfcc(7), 53, 0.1, 'IFCC 7% ≈ 53');
  near(C.ifccToA1c(C.a1cToIfcc(8.3)), 8.3, 1e-9, 'IFCC ذهاب وعودة');
  near(C.homaIR(10, 100), 2.469, 0.001, 'HOMA-IR');
});

test('الدهون: Friedewald و Sampson', () => {
  assert.equal(C.ldlFriedewald(200, 50, 150), 120);
  assert.equal(C.ldlFriedewald(200, 50, 450), null, 'TG ≥ 400');
  const s = C.ldlSampson(200, 50, 150);
  assert.ok(s > 110 && s < 130, String(s));
  assert.equal(C.ldlSampson(200, 50, 900), null, 'TG > 800');
  assert.equal(C.nonHdl(200, 50), 150);
});

test('الطوارئ والأملاح', () => {
  assert.equal(C.correctedCa(8, 2), 9.6);
  assert.equal(C.correctedNa(130, 600), 138);
  assert.equal(C.anionGap(140, 100, 12), 28);
  assert.equal(C.effOsm(140, 540), 310);
  near(C.qtcBazett(400, 60), 400, 1e-9, 'QTc عند نبض 60');
});

test('الكبد: Child-Pugh و MELD', () => {
  assert.deepEqual(C.childPugh(1.5, 3.8, 1.2, 1, 1), { score: 5, cls: 'A' });
  assert.equal(C.childPugh(3.5, 2.5, 2.5, 3, 2).cls, 'C');
  // MELD-Na: Cr 1, Bili 1, INR 1, Na 137 → MELD(i)=6.43→6.4 (لا تعديل Na) → 6
  assert.equal(C.meldNa(1, 1, 1, 137), 6);
  assert.ok(C.meldNa(2, 3, 1.8, 128) > C.meldNa(2, 3, 1.8, 137), 'الصوديوم المنخفض يرفع MELD-Na');
  // MELD 3.0 بقيم طبيعية: 6 + 1.33 (أنثى) ≈ 7
  assert.equal(C.meld3(1, 1, 1, 137, 3.5, true), 7);
  assert.equal(C.meld3(1, 1, 1, 137, 3.5, false), 6);
});

test('مراحل KDIGO وخريطة الخطورة', () => {
  assert.equal(C.gStage(95), 'G1');
  assert.equal(C.gStage(50), 'G3a');
  assert.equal(C.gStage(35), 'G3b');
  assert.equal(C.gStage(10), 'G5');
  assert.equal(C.aStage(25), 'A1');
  assert.equal(C.aStage(300), 'A2');
  assert.equal(C.aStage(301), 'A3');
  assert.equal(C.kdigoRisk('G2', 'A1'), 'low');
  assert.equal(C.kdigoRisk('G3a', 'A2'), 'high');
  assert.equal(C.kdigoRisk('G3b', 'A1'), 'high');
  assert.equal(C.kdigoRisk('G4', 'A1'), 'very-high');
  assert.equal(C.uacrFromSpot(30, 100), 30);
});
