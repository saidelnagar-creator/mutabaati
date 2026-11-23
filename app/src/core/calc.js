// المعادلات الطبية — دوال خالصة بلا واجهة. كل دالة تعيد null لو المدخلات ناقصة أو خارج المعقول.
// الوحدات: الكرياتينين mg/dL، السكر mg/dL، الوزن kg، الطول cm، الألبومين g/dL، الصفائح ×10³/µL.

const ok = (...xs) => xs.every((x) => typeof x === 'number' && Number.isFinite(x));
export const round = (x, dp = 0) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** dp) / 10 ** dp);

// eGFR — CKD-EPI 2021 (بدون عرق)، بالكرياتينين. NKF-ASN 2021, KDIGO 2024.
export function egfrCkdEpi2021(scr, age, sex) {
  if (!ok(scr, age) || scr <= 0 || age < 18 || !['M', 'F'].includes(sex)) return null;
  const f = sex === 'F';
  const k = f ? 0.7 : 0.9;
  const a = f ? -0.241 : -0.302;
  return 142 * Math.min(scr / k, 1) ** a * Math.max(scr / k, 1) ** -1.2 * 0.9938 ** age * (f ? 1.012 : 1);
}

// eGFR — CKD-EPI 2021 بالكرياتينين + Cystatin C.
export function egfrCrCys2021(scr, scys, age, sex) {
  if (!ok(scr, scys, age) || scr <= 0 || scys <= 0 || age < 18 || !['M', 'F'].includes(sex)) return null;
  const f = sex === 'F';
  const k = f ? 0.7 : 0.9;
  const a = f ? -0.219 : -0.144;
  return 135 * Math.min(scr / k, 1) ** a * Math.max(scr / k, 1) ** -0.544 * Math.min(scys / 0.8, 1) ** -0.323 * Math.max(scys / 0.8, 1) ** -0.778 * 0.9961 ** age * (f ? 0.963 : 1);
}

// eGFR — CKD-EPI 2012 بالـ Cystatin C وحده.
export function egfrCys2012(scys, age, sex) {
  if (!ok(scys, age) || scys <= 0 || age < 18 || !['M', 'F'].includes(sex)) return null;
  return 133 * Math.min(scys / 0.8, 1) ** -0.499 * Math.max(scys / 0.8, 1) ** -1.328 * 0.996 ** age * (sex === 'F' ? 0.932 : 1);
}

// الوزن المثالي (Devine) والمعدّل.
export function ibw(heightCm, sex) {
  if (!ok(heightCm) || heightCm < 100 || !['M', 'F'].includes(sex)) return null;
  const inchesOver60 = heightCm / 2.54 - 60;
  return (sex === 'M' ? 50 : 45.5) + 2.3 * inchesOver60;
}
export function adjbw(weight, heightCm, sex) {
  const i = ibw(heightCm, sex);
  if (!ok(weight, i)) return null;
  return i + 0.4 * (weight - i);
}

// Cockcroft-Gault (mL/min). weight: الوزن المستخدم (فعلي/مثالي/معدّل).
export function crclCG(scr, age, weight, sex) {
  if (!ok(scr, age, weight) || scr <= 0 || weight <= 0 || !['M', 'F'].includes(sex)) return null;
  return (((140 - age) * weight) / (72 * scr)) * (sex === 'F' ? 0.85 : 1);
}

// اختيار الوزن المناسب لـ CG: الفعلي، إلا لو BMI ≥ 30 فالمعدّل، ولو الفعلي أقل من المثالي فالفعلي.
export function crclAuto(scr, age, weight, heightCm, sex) {
  const b = bmi(weight, heightCm);
  const i = ibw(heightCm, sex);
  let w = weight;
  let basis = 'actual';
  if (ok(b, i) && b >= 30) {
    w = adjbw(weight, heightCm, sex);
    basis = 'adjusted';
  }
  const v = crclCG(scr, age, w, sex);
  return v === null ? null : { value: v, basis, weightUsed: w };
}

export function bmi(weight, heightCm) {
  if (!ok(weight, heightCm) || weight <= 0 || heightCm < 50) return null;
  return weight / (heightCm / 100) ** 2;
}
export function bmiClass(b) {
  if (!ok(b)) return null;
  if (b < 18.5) return { id: 'under', ar: 'نحافة', en: 'Underweight' };
  if (b < 25) return { id: 'normal', ar: 'طبيعي', en: 'Normal' };
  if (b < 30) return { id: 'over', ar: 'زيادة وزن', en: 'Overweight' };
  if (b < 35) return { id: 'ob1', ar: 'سمنة درجة 1', en: 'Obesity class I' };
  if (b < 40) return { id: 'ob2', ar: 'سمنة درجة 2', en: 'Obesity class II' };
  return { id: 'ob3', ar: 'سمنة درجة 3', en: 'Obesity class III' };
}
export const bsaMosteller = (w, h) => (ok(w, h) && w > 0 && h > 0 ? Math.sqrt((w * h) / 3600) : null);
export const waistHeight = (waist, h) => (ok(waist, h) && h > 0 ? waist / h : null);

// FIB-4 = (Age × AST) / (PLT × √ALT). حدود AASLD 2023 / ADA §4: < 1.3 منخفض (< 2.0 لو ≥ 65)، > 2.67 عالي.
export function fib4(age, ast, alt, plt) {
  if (!ok(age, ast, alt, plt) || alt <= 0 || plt <= 0) return null;
  return (age * ast) / (plt * Math.sqrt(alt));
}
export function fib4Risk(v, age) {
  if (!ok(v)) return null;
  const low = ok(age) && age >= 65 ? 2.0 : 1.3;
  if (ok(age) && age < 35) return { id: 'unreliable', ar: 'غير موثوق تحت 35 سنة', cls: '' };
  if (v < low) return { id: 'low', ar: `خطر منخفض (< ${low})`, cls: 'ok' };
  if (v <= 2.67) return { id: 'mid', ar: 'غير محدد — Fibroscan', cls: 'warn' };
  return { id: 'high', ar: 'خطر تليف متقدم (> 2.67)', cls: 'bad' };
}

// NAFLD fibrosis score. ifgOrDm: 1/0. albumin g/dL.
export function nfs(age, bmiV, ifgOrDm, ast, alt, plt, albumin) {
  if (!ok(age, bmiV, ast, alt, plt, albumin) || alt <= 0) return null;
  return -1.675 + 0.037 * age + 0.094 * bmiV + 1.13 * (ifgOrDm ? 1 : 0) + 0.99 * (ast / alt) - 0.013 * plt - 0.66 * albumin;
}
export const apri = (ast, astUln, plt) => (ok(ast, astUln, plt) && astUln > 0 && plt > 0 ? ((ast / astUln) * 100) / plt : null);

// Child-Pugh: bili mg/dL، alb g/dL، inr، ascites/enceph: 1 (none) 2 (mild) 3 (moderate-severe).
export function childPugh(bili, alb, inr, ascites, enceph) {
  if (!ok(bili, alb, inr, ascites, enceph)) return null;
  const s = (bili < 2 ? 1 : bili <= 3 ? 2 : 3) + (alb > 3.5 ? 1 : alb >= 2.8 ? 2 : 3) + (inr < 1.7 ? 1 : inr <= 2.3 ? 2 : 3) + ascites + enceph;
  return { score: s, cls: s <= 6 ? 'A' : s <= 9 ? 'B' : 'C' };
}

// MELD-Na (UNOS 2016). cr/bili/inr حد أدنى 1، cr أقصى 4 (أو 4 مع الغسيل)، Na 125–137.
export function meldNa(cr, bili, inr, na, dialysis = false) {
  if (!ok(cr, bili, inr, na)) return null;
  const c = dialysis ? 4 : Math.min(Math.max(cr, 1), 4);
  const b = Math.max(bili, 1);
  const i = Math.max(inr, 1);
  const n = Math.min(Math.max(na, 125), 137);
  let m = 0.957 * Math.log(c) + 0.378 * Math.log(b) + 1.12 * Math.log(i) + 0.643;
  m = Math.round(m * 100) / 10; // ×10 مقرب لأقرب عُشر
  if (m > 11) m = m + 1.32 * (137 - n) - 0.033 * m * (137 - n);
  return Math.round(m);
}

// MELD 3.0 (Kim 2021). female: true/false. alb g/dL.
export function meld3(cr, bili, inr, na, alb, female, dialysis = false) {
  if (!ok(cr, bili, inr, na, alb)) return null;
  const c = dialysis ? 3 : Math.min(Math.max(cr, 1), 3);
  const b = Math.max(bili, 1);
  const i = Math.max(inr, 1);
  const n = Math.min(Math.max(na, 125), 137);
  const a = Math.min(Math.max(alb, 1.5), 3.5);
  const v = 1.33 * (female ? 1 : 0) + 4.56 * Math.log(b) + 0.82 * (137 - n) - 0.24 * (137 - n) * Math.log(b) + 9.09 * Math.log(i) + 11.14 * Math.log(c) + 1.85 * (3.5 - a) - 1.83 * (3.5 - a) * Math.log(c) + 6;
  return Math.round(v);
}

// السكر
export const eagFromA1c = (a1c) => (ok(a1c) ? 28.7 * a1c - 46.7 : null);
export const a1cFromEag = (eag) => (ok(eag) ? (eag + 46.7) / 28.7 : null);
export const gmiFromMean = (mean) => (ok(mean) && mean > 0 ? 3.31 + 0.02392 * mean : null);
export const a1cToIfcc = (a1c) => (ok(a1c) ? 10.929 * (a1c - 2.15) : null);
export const ifccToA1c = (mmol) => (ok(mmol) ? mmol / 10.929 + 2.15 : null);
export const homaIR = (insulin, glucose) => (ok(insulin, glucose) ? (insulin * glucose) / 405 : null);
export const homaB = (insulin, glucose) => (ok(insulin, glucose) && glucose > 63 ? (360 * insulin) / (glucose - 63) : null);
export const tyg = (tg, glucose) => (ok(tg, glucose) && tg > 0 && glucose > 0 ? Math.log((tg * glucose) / 2) : null);

// الدهون
export const nonHdl = (tc, hdl) => (ok(tc, hdl) ? tc - hdl : null);
export const ldlFriedewald = (tc, hdl, tg) => (ok(tc, hdl, tg) && tg < 400 ? tc - hdl - tg / 5 : null);
// Sampson/NIH Equation 2 (2020): صالحة حتى TG ≤ 800.
export function ldlSampson(tc, hdl, tg) {
  if (!ok(tc, hdl, tg) || tg > 800) return null;
  const nh = tc - hdl;
  return tc / 0.948 - hdl / 0.971 - (tg / 8.56 + (tg * nh) / 2140 - (tg * tg) / 16100) - 9.44;
}

// الأملاح والطوارئ
export const correctedCa = (ca, alb) => (ok(ca, alb) ? ca + 0.8 * (4 - alb) : null);
export const correctedNa = (na, glucose, factor = 1.6) => (ok(na, glucose) ? na + (factor * (glucose - 100)) / 100 : null);
export const anionGap = (na, cl, hco3) => (ok(na, cl, hco3) ? na - (cl + hco3) : null);
export const anionGapAlb = (ag, alb) => (ok(ag, alb) ? ag + 2.5 * (4 - alb) : null);
export const effOsm = (na, glucose) => (ok(na, glucose) ? 2 * na + glucose / 18 : null);
export const totalOsm = (na, glucose, bun) => (ok(na, glucose, bun) ? 2 * na + glucose / 18 + bun / 2.8 : null);
export const qtcBazett = (qt, hr) => (ok(qt, hr) && hr > 0 ? qt / Math.sqrt(60 / hr) : null);
export const qtcFridericia = (qt, hr) => (ok(qt, hr) && hr > 0 ? qt / Math.cbrt(60 / hr) : null);

// UACR من ألبومين (mg/L) وكرياتينين (mg/dL) عينة بول عشوائية ← mg/g.
export const uacrFromSpot = (ualb, ucr) => (ok(ualb, ucr) && ucr > 0 ? (ualb / ucr) * 100 : null);

// مراحل KDIGO.
export function gStage(egfr) {
  if (!ok(egfr)) return null;
  return egfr >= 90 ? 'G1' : egfr >= 60 ? 'G2' : egfr >= 45 ? 'G3a' : egfr >= 30 ? 'G3b' : egfr >= 15 ? 'G4' : 'G5';
}
export function aStage(uacr) {
  if (!ok(uacr)) return null;
  return uacr < 30 ? 'A1' : uacr <= 300 ? 'A2' : 'A3';
}
// خريطة الخطورة (KDIGO heat map): low | moderate | high | very-high.
export function kdigoRisk(g, a) {
  if (!g || !a) return null;
  const gi = ['G1', 'G2', 'G3a', 'G3b', 'G4', 'G5'].indexOf(g);
  const ai = ['A1', 'A2', 'A3'].indexOf(a);
  const M = [
    ['low', 'moderate', 'high'],
    ['low', 'moderate', 'high'],
    ['moderate', 'high', 'very-high'],
    ['high', 'very-high', 'very-high'],
    ['very-high', 'very-high', 'very-high'],
    ['very-high', 'very-high', 'very-high'],
  ];
  return gi < 0 || ai < 0 ? null : M[gi][ai];
}
export const KDIGO_RISK_AR = { low: 'خطر منخفض', moderate: 'خطر متوسط', high: 'خطر عالي', 'very-high': 'خطر عالي جداً' };

// الإنسولين (تقديرات مبدئية — ADA §9 وإرشادات المعايرة).
export function insulinStart(weight, { type = 'T2' } = {}) {
  if (!ok(weight) || weight <= 0) return null;
  if (type === 'T1') {
    const tdd = [0.4 * weight, 0.6 * weight];
    return { tdd, basal: tdd.map((x) => x * 0.5), note: 'النوع الأول: 0.4–0.6 وحدة/كجم/يوم (حتى 1.0)، نصها تقريباً قاعدي' };
  }
  return { basal: [0.1 * weight, 0.2 * weight], fixed: 10, note: 'النوع التاني: 10 وحدات أو 0.1–0.2 وحدة/كجم قاعدي' };
}
export const icr = (tdd, rule = 500) => (ok(tdd) && tdd > 0 ? rule / tdd : null); // جرام كربوهيدرات لكل وحدة
export const isf = (tdd, rule = 1800) => (ok(tdd) && tdd > 0 ? rule / tdd : null); // mg/dL لكل وحدة
