// الحاسبات الطبية: كل حاسبة مدخلات + نتائج فورية + مرجع، مع إمكانية الملء من بيانات مريض.
import { h, clear } from '../dom.js';
import { ctx, F } from '../ctx.js';
import { badge, card, empty, field, kv, list, numInput, pickFromList, row, segmented, selectInput } from '../components.js';
import { collator } from '../widgets.js';
import * as C from '../../core/calc.js';
import { listEntities, entity } from '../../core/state.js';
import { patientContext } from '../../core/patient.js';

const S = { M: 'ذكر', F: 'أنثى' };
const n = (key, label, unit = '') => ({ key, label, unit, type: 'num' });
const sex = { key: 'sex', label: 'النوع', type: 'sex' };
const sel = (key, label, options) => ({ key, label, type: 'select', options });

// out(label, value, {dp, note, cls})
const out = (label, value, o = {}) => ({ label, value, ...o });

export const CALCS = [
  {
    id: 'egfr',
    title: 'eGFR (CKD-EPI 2021)',
    group: 'الكلى',
    inputs: [n('creat', 'الكرياتينين', 'mg/dL'), n('age', 'السن', 'سنة'), sex, n('cysc', 'Cystatin C (اختياري)', 'mg/L')],
    compute: (v) => {
      const cr = C.egfrCkdEpi2021(v.creat, v.age, v.sex);
      const crcys = C.egfrCrCys2021(v.creat, v.cysc, v.age, v.sex);
      const cys = C.egfrCys2012(v.cysc, v.age, v.sex);
      const best = crcys ?? cr;
      return [out('eGFR (كرياتينين)', cr, { dp: 0, unit: 'mL/min/1.73m²' }), crcys !== null ? out('eGFR (كرياتينين + Cystatin)', crcys, { dp: 0 }) : null, cys !== null ? out('eGFR (Cystatin وحده، 2012)', cys, { dp: 0 }) : null, best !== null ? out('المرحلة', C.gStage(best), { text: true }) : null].filter(Boolean);
    },
    ref: 'Inker NEJM 2021; KDIGO 2024 — بدون عامل العرق',
  },
  {
    id: 'crcl',
    title: 'Creatinine clearance (Cockcroft-Gault)',
    group: 'الكلى',
    inputs: [n('creat', 'الكرياتينين', 'mg/dL'), n('age', 'السن'), n('weight', 'الوزن', 'كجم'), n('height', 'الطول (للوزن المثالي)', 'سم'), sex],
    compute: (v) => {
      const ib = C.ibw(v.height, v.sex);
      const ab = C.adjbw(v.weight, v.height, v.sex);
      return [out('بالوزن الفعلي', C.crclCG(v.creat, v.age, v.weight, v.sex), { dp: 0, unit: 'mL/min' }), ib ? out('بالوزن المثالي', C.crclCG(v.creat, v.age, Math.min(ib, v.weight || ib), v.sex), { dp: 0 }) : null, ab ? out('بالوزن المعدّل', C.crclCG(v.creat, v.age, ab, v.sex), { dp: 0 }) : null, ib ? out('الوزن المثالي (Devine)', ib, { dp: 1, unit: 'كجم' }) : null].filter(Boolean);
    },
    ref: 'Cockcroft-Gault 1976. لتعديل جرعات الأدوية اللي نشرتها بالـ CrCl؛ المعدّل لو BMI ≥ 30',
  },
  {
    id: 'kdigo',
    title: 'تصنيف CKD (KDIGO)',
    group: 'الكلى',
    inputs: [n('egfr', 'eGFR'), n('uacr', 'UACR', 'mg/g')],
    compute: (v) => {
      const g = C.gStage(v.egfr);
      const a = C.aStage(v.uacr);
      const r = C.kdigoRisk(g, a);
      return [out('G', g, { text: true }), out('A', a, { text: true }), r ? out('الخطورة', C.KDIGO_RISK_AR[r], { text: true, cls: r === 'low' ? 'pos' : 'neg' }) : null].filter(Boolean);
    },
    ref: 'KDIGO 2024 heat map — التشخيص يحتاج استمرار > 3 شهور',
  },
  {
    id: 'body',
    title: 'BMI والوزن المثالي و BSA',
    group: 'الجسم',
    inputs: [n('weight', 'الوزن', 'كجم'), n('height', 'الطول', 'سم'), sex, n('waist', 'الوسط (اختياري)', 'سم')],
    compute: (v) => {
      const b = C.bmi(v.weight, v.height);
      const wh = C.waistHeight(v.waist, v.height);
      return [out('BMI', b, { dp: 1, note: C.bmiClass(b)?.ar }), out('الوزن المثالي', C.ibw(v.height, v.sex), { dp: 1, unit: 'كجم' }), out('الوزن المعدّل', C.adjbw(v.weight, v.height, v.sex), { dp: 1, unit: 'كجم' }), out('BSA (Mosteller)', C.bsaMosteller(v.weight, v.height), { dp: 2, unit: 'm²' }), wh !== null ? out('الوسط/الطول', wh, { dp: 2, note: wh >= 0.5 ? 'خطورة أعلى (≥ 0.5)' : '' }) : null].filter(Boolean);
    },
    ref: 'WHO BMI classes',
  },
  {
    id: 'fib4',
    title: 'FIB-4 و NFS و APRI',
    group: 'الكبد',
    inputs: [n('age', 'السن'), n('ast', 'AST', 'U/L'), n('alt', 'ALT', 'U/L'), n('plt', 'Platelets', '×10³/µL'), n('astUln', 'AST ULN (لـ APRI)', 'U/L'), n('bmi', 'BMI (لـ NFS)'), n('alb', 'Albumin (لـ NFS)', 'g/dL'), sel('dm', 'سكر/ما قبل السكر (لـ NFS)', [{ value: '1', label: 'نعم' }, { value: '0', label: 'لا' }])],
    compute: (v) => {
      const f4 = C.fib4(v.age, v.ast, v.alt, v.plt);
      const r = C.fib4Risk(f4, v.age);
      const nf = C.nfs(v.age, v.bmi, v.dm === '1', v.ast, v.alt, v.plt, v.alb);
      return [out('FIB-4', f4, { dp: 2, note: r?.ar, cls: r?.cls === 'bad' ? 'neg' : r?.cls === 'ok' ? 'pos' : '' }), nf !== null ? out('NAFLD fibrosis score', nf, { dp: 2, note: nf < -1.455 ? 'منخفض' : nf > 0.676 ? 'عالي' : 'غير محدد' }) : null, out('APRI', C.apri(v.ast, v.astUln || 40, v.plt), { dp: 2 })].filter(Boolean);
    },
    ref: 'AASLD 2023; ADA 2026 §4: FIB-4 < 1.3 منخفض (< 2.0 لو ≥ 65)، ≥ 1.3 → Fibroscan، > 2.67 → إحالة',
  },
  {
    id: 'child',
    title: 'Child-Pugh',
    group: 'الكبد',
    inputs: [n('bili', 'Bilirubin', 'mg/dL'), n('alb', 'Albumin', 'g/dL'), n('inr', 'INR'), sel('asc', 'استسقاء', [{ value: '1', label: 'لا' }, { value: '2', label: 'بسيط' }, { value: '3', label: 'متوسط/شديد' }]), sel('enc', 'غيبوبة كبدية', [{ value: '1', label: 'لا' }, { value: '2', label: 'درجة 1–2' }, { value: '3', label: 'درجة 3–4' }])],
    compute: (v) => {
      const r = C.childPugh(v.bili, v.alb, v.inr, Number(v.asc || 1), Number(v.enc || 1));
      return r ? [out('النقاط', r.score, { dp: 0 }), out('الفئة', r.cls, { text: true, cls: r.cls === 'A' ? 'pos' : 'neg' })] : [];
    },
    ref: 'Child-Turcotte-Pugh',
  },
  {
    id: 'meld',
    title: 'MELD-Na و MELD 3.0',
    group: 'الكبد',
    inputs: [n('creat', 'Creatinine', 'mg/dL'), n('bili', 'Bilirubin', 'mg/dL'), n('inr', 'INR'), n('na', 'Na', 'mmol/L'), n('alb', 'Albumin (لـ 3.0)', 'g/dL'), sex, sel('dial', 'غسيل مرتين آخر أسبوع', [{ value: '0', label: 'لا' }, { value: '1', label: 'نعم' }])],
    compute: (v) => [out('MELD-Na', C.meldNa(v.creat, v.bili, v.inr, v.na, v.dial === '1'), { dp: 0 }), out('MELD 3.0', C.meld3(v.creat, v.bili, v.inr, v.na, v.alb, v.sex === 'F', v.dial === '1'), { dp: 0 })],
    ref: 'UNOS MELD-Na 2016; Kim et al. Gastroenterology 2021 (MELD 3.0)',
  },
  {
    id: 'a1c',
    title: 'HbA1c ↔ eAG / IFCC / GMI',
    group: 'السكر',
    inputs: [n('a1c', 'HbA1c', '%'), n('mean', 'متوسط السكر (CGM) لـ GMI', 'mg/dL')],
    compute: (v) => [out('eAG', C.eagFromA1c(v.a1c), { dp: 0, unit: 'mg/dL' }), out('IFCC', C.a1cToIfcc(v.a1c), { dp: 0, unit: 'mmol/mol' }), out('GMI', C.gmiFromMean(v.mean), { dp: 1, unit: '%' }), out('HbA1c المقابل لمتوسط', C.a1cFromEag(v.mean), { dp: 1, unit: '%' })],
    ref: 'ADAG (Nathan 2008); Bergenstal 2018 (GMI)',
  },
  {
    id: 'glucose',
    title: 'تحويل السكر mg/dL ↔ mmol/L',
    group: 'السكر',
    inputs: [n('mg', 'mg/dL'), n('mmol', 'mmol/L')],
    compute: (v) => [out('mmol/L', v.mg !== null && v.mg !== undefined ? v.mg / 18.016 : null, { dp: 1 }), out('mg/dL', v.mmol !== null && v.mmol !== undefined ? v.mmol * 18.016 : null, { dp: 0 })],
    ref: '1 mmol/L = 18.016 mg/dL',
  },
  {
    id: 'insulin',
    title: 'بداية الإنسولين و ICR و ISF',
    group: 'السكر',
    inputs: [n('weight', 'الوزن', 'كجم'), sel('type', 'النوع', [{ value: 'T2', label: 'تاني' }, { value: 'T1', label: 'أول' }]), n('tdd', 'إجمالي الجرعة الحالية (لو متاح)', 'وحدة/يوم')],
    compute: (v) => {
      const s = C.insulinStart(v.weight, { type: v.type || 'T2' });
      const tdd = v.tdd ?? (s?.tdd ? (s.tdd[0] + s.tdd[1]) / 2 : null);
      const r = [];
      if (s?.basal) r.push(out('قاعدي مبدئي', `${F.int(s.basal[0])}–${F.int(s.basal[1])} وحدة`, { text: true, note: s.note }));
      if (s?.tdd) r.push(out('إجمالي يومي (TDD)', `${F.int(s.tdd[0])}–${F.int(s.tdd[1])} وحدة`, { text: true }));
      if (tdd) r.push(out('ICR (قاعدة 500)', C.icr(tdd), { dp: 0, unit: 'جم كربوهيدرات/وحدة', note: `على TDD ${F.int(tdd)}` }), out('ISF (قاعدة 1800)', C.isf(tdd), { dp: 0, unit: 'mg/dL لكل وحدة' }));
      return r;
    },
    ref: 'ADA 2026 §9: T2D قاعدي 10 وحدات أو 0.1–0.2 و/كجم وزيادة 2 وحدة كل 3 أيام لحد الصايم 80–130 (الهبوط: قلل 10–20%)',
  },
  {
    id: 'lipid',
    title: 'LDL المحسوب و Non-HDL',
    group: 'الدهون',
    inputs: [n('tc', 'Total cholesterol', 'mg/dL'), n('hdl', 'HDL', 'mg/dL'), n('tg', 'TG', 'mg/dL')],
    compute: (v) => [out('LDL (Sampson/NIH)', C.ldlSampson(v.tc, v.hdl, v.tg), { dp: 0, note: 'صالحة لحد TG 800' }), out('LDL (Friedewald)', C.ldlFriedewald(v.tc, v.hdl, v.tg), { dp: 0, note: 'غير صالحة لو TG ≥ 400' }), out('Non-HDL', C.nonHdl(v.tc, v.hdl), { dp: 0 })],
    ref: 'Sampson JAMA Cardiol 2020; ADA 2026 §10',
  },
  {
    id: 'dka',
    title: 'DKA/HHS: Na المصحح، Anion gap، Osmolality',
    group: 'طوارئ',
    inputs: [n('glucose', 'Glucose', 'mg/dL'), n('na', 'Na', 'mmol/L'), n('cl', 'Cl', 'mmol/L'), n('hco3', 'HCO₃', 'mmol/L'), n('bun', 'BUN (اختياري)', 'mg/dL'), n('alb', 'Albumin (اختياري)', 'g/dL')],
    compute: (v) => {
      const ag = C.anionGap(v.na, v.cl, v.hco3);
      return [out('Na المصحح (1.6)', C.correctedNa(v.na, v.glucose, 1.6), { dp: 1 }), out('Na المصحح (2.4)', C.correctedNa(v.na, v.glucose, 2.4), { dp: 1 }), out('Anion gap', ag, { dp: 0, note: ag > 12 ? 'مرتفع' : '' }), v.alb ? out('AG مصحح للألبومين', C.anionGapAlb(ag, v.alb), { dp: 0 }) : null, out('Effective osmolality', C.effOsm(v.na, v.glucose), { dp: 0, note: C.effOsm(v.na, v.glucose) > 320 ? '> 320: HHS محتمل' : '' }), v.bun ? out('Total osmolality', C.totalOsm(v.na, v.glucose, v.bun), { dp: 0 }) : null].filter(Boolean);
    },
    ref: 'ADA/EASD/JBDS hyperglycemic crises consensus 2024',
  },
  {
    id: 'ca',
    title: 'الكالسيوم المصحح',
    group: 'طوارئ',
    inputs: [n('ca', 'Calcium', 'mg/dL'), n('alb', 'Albumin', 'g/dL')],
    compute: (v) => [out('Ca المصحح', C.correctedCa(v.ca, v.alb), { dp: 1, unit: 'mg/dL' })],
    ref: 'Payne formula',
  },
  {
    id: 'qtc',
    title: 'QTc',
    group: 'طوارئ',
    inputs: [n('qt', 'QT', 'ms'), n('hr', 'Heart rate', 'bpm')],
    compute: (v) => [out('Bazett', C.qtcBazett(v.qt, v.hr), { dp: 0, unit: 'ms' }), out('Fridericia', C.qtcFridericia(v.qt, v.hr), { dp: 0, unit: 'ms' })],
    ref: 'Fridericia أدق مع سرعة النبض العالية',
  },
  {
    id: 'homa',
    title: 'HOMA-IR و TyG',
    group: 'السكر',
    inputs: [n('glucose', 'Fasting glucose', 'mg/dL'), n('insulin', 'Fasting insulin', 'µIU/mL'), n('tg', 'TG', 'mg/dL')],
    compute: (v) => [out('HOMA-IR', C.homaIR(v.insulin, v.glucose), { dp: 2 }), out('HOMA-B %', C.homaB(v.insulin, v.glucose), { dp: 0 }), out('TyG index', C.tyg(v.tg, v.glucose), { dp: 2 })],
    ref: 'Matthews 1985; Simental-Mendía 2008',
  },
];

// ملء المدخلات من مريض.
function prefill(pid) {
  const c = patientContext(ctx.state, pid, ctx.today());
  if (!c) return {};
  const f = c.f;
  return { age: c.age, sex: c.sex, weight: c.weight, height: c.height, creat: f.creat, cysc: f.cysc, egfr: f.egfr, uacr: f.uacr, ast: f.ast, alt: f.alt, plt: f.plt, bmi: c.bmi, alb: f.alb, a1c: f.a1c, na: f.na, tc: f.tc, hdl: f.hdl, tg: f.tg, type: c.dmType === 'T1' ? 'T1' : 'T2', dm: c.isDiabetic || c.dmType === 'pre' ? '1' : '0', tdd: c.insulin?.tdd };
}

export function calcListScreen() {
  const groups = [...new Set(CALCS.map((x) => x.group))];
  const body = h('div', {});
  for (const g of groups) body.append(h('div', { class: 'section-title' }, h('span', { text: g })), list(CALCS.filter((x) => x.group === g).map((x) => row({ title: x.title, dir: 'auto', onclick: () => ctx.nav(`#/calc/${x.id}`) }))));
  return { title: 'الحاسبات', root: true, body };
}

let lastPatient = null;
export function calcScreen({ id }) {
  const def = CALCS.find((x) => x.id === id);
  if (!def) return { title: 'غير موجود', body: empty('الحاسبة غير موجودة') };
  const body = h('div', {});
  const els = {};
  const results = h('div', {});
  const read = () => {
    const v = {};
    for (const inp of def.inputs) {
      const el = els[inp.key];
      if (inp.type === 'num') {
        const x = el.num();
        v[inp.key] = x === null || Number.isNaN(x) ? null : x;
      } else v[inp.key] = el.value || null;
    }
    return v;
  };
  const compute = () => {
    clear(results);
    let rows;
    try {
      rows = def.compute(read());
    } catch {
      rows = [];
    }
    const shown = rows.filter((r) => r.value !== null && r.value !== undefined && (r.text || Number.isFinite(r.value)));
    if (!shown.length) return results.append(empty('أدخل القيم المطلوبة'));
    results.append(card(...shown.map((r) => kv(r.label, h('span', {}, h('b', { class: `num ${r.cls || ''}`, text: r.text ? String(r.value) : F.num(r.value, r.dp ?? 1) }), r.unit ? ` ${r.unit}` : '', r.note ? h('div', { class: 'muted small', text: r.note }) : null)))));
  };
  const fill = (vals) => {
    for (const inp of def.inputs) {
      const el = els[inp.key];
      const x = vals[inp.key];
      if (x === undefined || x === null) continue;
      if (inp.type === 'num') el.value = String(Math.round(x * 100) / 100);
      else if (inp.type === 'sex') el.set(x);
      else el.value = x;
    }
    compute();
  };
  const inputs = h('div', { class: 'calc-inputs' });
  for (const inp of def.inputs) {
    let el;
    if (inp.type === 'num') el = numInput(null, { placeholder: inp.unit });
    else if (inp.type === 'sex') el = segmented([{ value: 'M', label: S.M }, { value: 'F', label: S.F }], 'M', () => compute());
    else el = selectInput(inp.options, inp.options[0].value);
    el.addEventListener('input', compute);
    el.addEventListener('change', compute);
    els[inp.key] = el;
    inputs.append(field(`${inp.label}${inp.unit && inp.type === 'num' ? ` (${inp.unit})` : ''}`, el));
  }
  const pickBtn = h('button', {
    type: 'button',
    class: 'btn small',
    text: lastPatient ? `من: ${entity(ctx.state, 'patient', lastPatient)?.name || 'مريض'}` : 'املأ من بيانات مريض',
    onclick: async () => {
      const pid = await pickFromList({ title: 'اختار المريض', items: listEntities(ctx.state, 'patient').sort((a, b) => collator.compare(a.name, b.name)).map((p) => ({ id: p.id, title: p.name })) });
      if (!pid) return;
      lastPatient = pid;
      pickBtn.textContent = `من: ${entity(ctx.state, 'patient', pid)?.name}`;
      fill(prefill(pid));
    },
  });
  body.append(h('div', { class: 'btn-row' }, pickBtn), inputs, h('div', { class: 'section-title' }, h('span', { text: 'النتيجة' })), results, h('p', { class: 'muted small', dir: 'auto', text: def.ref }));
  if (lastPatient && entity(ctx.state, 'patient', lastPatient)) fill(prefill(lastPatient));
  compute();
  return { title: def.title, body };
}
