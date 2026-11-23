// عناصر مشتركة خاصة بالتطبيق: تاريخ بدقة متغيرة، اختيار دواء/تحليل، بناء الجرعة، شارات المستوى، نصوص المريض.
import { h, clear } from './dom.js';
import { ctx, F } from './ctx.js';
import { badge, checkbox, field, intInput, numInput, openSheet, pickFromList, selectInput, textInput, segmented } from './components.js';
import { FUZZY, SLOT_TIMES, FREQS, fuzzyToDate } from '../core/kinds.js';
import { MEALS, DOSE_UNITS, DRUG_CLASSES, FORMS } from '../config/catalog/drugs.js';
import { LEVELS } from '../config/catalog/alerts.js';
import { DM_TYPES } from '../config/catalog/conditions.js';
import { LAB_CATEGORIES } from '../config/catalog/labs.js';
import { generic, genericsMap, labTestsMap, productsMap, searchDrugs } from '../core/catalog.js';
import { ageAt, ageIsApprox } from '../core/age.js';
import { entity } from '../core/state.js';
import { WEEKDAYS, mealOf, mealText } from '../core/meds.js';
import { plainNum } from '../core/num.js';
import { ValidationError } from '../core/util.js';

export const collator = new Intl.Collator('ar', { numeric: true });

// ---------- نصوص ----------
export function fuzzyText(f) {
  if (!f || f.p === 'unknown') return 'غير معروف';
  if (f.p === 'day') return F.date(f.v);
  if (f.p === 'month') return F.month(f.v);
  if (f.p === 'year') return F.digits(f.v);
  return f.t ? `${f.t} (${F.digits(f.v.slice(0, 4))})` : `حوالي ${F.digits(f.v)}`;
}
export const sexText = (s) => (s === 'F' ? 'أنثى' : 'ذكر');
export function ageText(p, date = ctx.today()) {
  const a = ageAt(p, date);
  return a === null ? '' : `${F.int(a)} سنة${ageIsApprox(p) ? ' تقريباً' : ''}`;
}
export const dmShort = (p) => DM_TYPES.find((t) => t.id === p?.dm?.type)?.ar || '';
export const sourceName = (id) => entity(ctx.state, 'source', id)?.name || '';
export function patientSubtitle(p) {
  return [ageText(p), sexText(p.sex), dmShort(p), sourceName(p.sourceId)].filter(Boolean).join(' · ');
}
export const levelBadge = (level) => badge(LEVELS[level]?.ar || level, LEVELS[level]?.cls || '');
export const icd = (code) => (ctx.state.settings.showIcd !== false && code ? ` [${code}]` : '');

// ---------- تاريخ بدقة متغيرة ----------
// يعيد عنصر فيه .read() → {p, v, t} أو يرمي ValidationError. allowNow: زر «بيبدأ دلوقتي».
export function fuzzyDateInput(value = null, { allowNow = false, label = 'التاريخ' } = {}) {
  const wrap = h('div', { class: 'fuzzy' });
  const today = ctx.today();
  let p = value?.p || (allowNow ? 'now' : 'day');
  if (allowNow && value?.p === 'day' && value.v === today) p = 'now';
  const day = h('input', { type: 'date', value: value?.p === 'day' ? value.v : today });
  const month = h('input', { type: 'month', value: value?.p === 'month' ? value.v : today.slice(0, 7) });
  const year = intInput(value?.p === 'year' ? value.v : '');
  year.placeholder = 'مثال: 2019';
  const approxN = intInput(value?.p === 'approx' ? '' : '');
  const approxU = selectInput(
    [
      { value: 'y', label: 'سنين' },
      { value: 'm', label: 'شهور' },
    ],
    'y',
  );
  const approxBox = h('div', { class: 'inline' }, h('span', { text: 'من حوالي' }), approxN, approxU);
  if (value?.p === 'approx' && value.t) approxBox.append(h('div', { class: 'hint', text: `المسجل: ${value.t}` }));
  const boxes = { day, month, year, approx: approxBox };
  const opts = [...(allowNow ? [{ value: 'now', label: 'بيبدأ دلوقتي' }] : []), { value: 'day', label: 'يوم' }, { value: 'month', label: 'شهر' }, { value: 'year', label: 'سنة' }, { value: 'approx', label: 'تقريبي' }, { value: 'unknown', label: 'مش فاكر' }];
  const seg = segmented(opts, p, (v) => {
    p = v;
    show();
  });
  const holder = h('div', {});
  const show = () => {
    clear(holder);
    if (boxes[p]) holder.append(boxes[p]);
  };
  show();
  wrap.append(seg, holder);
  wrap.read = () => {
    if (p === 'now') return { p: 'day', v: today };
    if (p === 'unknown') return { p: 'unknown', v: null };
    if (p === 'day') {
      if (!day.value) throw new ValidationError(`${label}: اختار اليوم`);
      return { p, v: day.value };
    }
    if (p === 'month') {
      if (!month.value) throw new ValidationError(`${label}: اختار الشهر`);
      return { p, v: month.value };
    }
    if (p === 'year') {
      const y = year.int();
      if (!Number.isInteger(y) || y < 1900 || y > Number(today.slice(0, 4))) throw new ValidationError(`${label}: السنة غير صالحة`);
      return { p, v: String(y) };
    }
    const n = approxN.int();
    if (!Number.isInteger(n) || n < 0 || n > 90) {
      if (value?.p === 'approx' && approxN.value === '') return value; // بدون تغيير
      throw new ValidationError(`${label}: اكتب العدد التقريبي`);
    }
    const years = approxU.value === 'y';
    const d = new Date(today + 'T00:00:00Z');
    if (years) d.setUTCFullYear(d.getUTCFullYear() - n);
    else d.setUTCMonth(d.getUTCMonth() - n);
    const iso = d.toISOString().slice(0, 10);
    return { p: 'approx', v: years ? iso.slice(0, 4) : iso.slice(0, 7), t: `من حوالي ${n} ${years ? (n > 10 || n < 3 ? 'سنة' : 'سنين') : n > 10 || n < 3 ? 'شهر' : 'شهور'}` };
  };
  return wrap;
}
export { fuzzyToDate };

// ---------- اختيار دواء من المكتبة ----------
// يعيد { productId?, g:[...], name, s?: [...], unit, form } أو null.
export async function pickDrug({ title = 'اختار الدواء' } = {}) {
  const state = ctx.state;
  const gm = genericsMap(state);
  const items = searchDrugs(state, '', { limit: 1000 }).map(({ type, item }) => ({
    id: `${type}:${item.id}`,
    title: item.name,
    dir: 'ltr',
    subtitle: type === 'product' ? (item.g || []).map((g) => gm.get(g)?.name || g).join(' + ') : (item.classes || []).map((c) => DRUG_CLASSES[c] || c).join('، '),
    keywords: type === 'product' ? '' : item.id,
    badge: type === 'product' ? (item.needsReview ? badge('تجاري · محتاج مراجعة', 'warn') : badge('تجاري', 'info')) : badge('علمي', ''),
  }));
  const picked = await pickFromList({
    title,
    items,
    placeholder: 'اكتب الاسم التجاري أو العلمي…',
    extra: (close, set) =>
      h('button', {
        type: 'button',
        class: 'btn small',
        style: { margin: '8px 0' },
        text: '+ دواء مش موجود في القائمة',
        onclick: () => {
          set('new');
          close();
        },
      }),
  });
  if (!picked) return null;
  if (picked === 'new') return quickNewProduct();
  const [type, id] = picked.split(':');
  if (type === 'product') {
    const p = productsMap(state).get(id);
    const s = await pickStrength(p);
    if (s === undefined) return null;
    return { productId: p.id, g: p.g.slice(), name: p.name, s, unit: p.unit, form: p.form };
  }
  const g = gm.get(id);
  const form = await pickGenericForm(g);
  if (!form) return null;
  return { g: [g.id], name: g.name, s: form.s ? [form.s] : null, unit: form.unit, form: form.f };
}

// اختيار التركيز من تركيزات المنتج (أو بدون لو مش محدد). undefined = إلغاء.
function pickStrength(p) {
  const vs = p.v || [];
  if (!vs.length) return Promise.resolve(null);
  if (vs.length === 1) return Promise.resolve(vs[0]);
  return new Promise((resolve) => {
    let picked;
    openSheet(
      `${p.name}: التركيز`,
      (body, close) => {
        body.append(
          h(
            'div',
            { class: 'grid-btns' },
            vs.map((v) =>
              h('button', {
                type: 'button',
                class: 'btn',
                dir: 'ltr',
                text: v.map(plainNum).join('/') + (p.g.length === 1 ? ` ${generic(ctx.state, p.g[0])?.unit || ''}` : ''),
                onclick: () => {
                  picked = v;
                  close();
                },
              }),
            ),
          ),
          p.note ? h('p', { class: 'muted small', text: p.note }) : null,
        );
      },
      { onClose: () => resolve(picked) },
    );
  });
}

// الاسم العلمي: اختيار الشكل والتركيز.
function pickGenericForm(g) {
  const opts = [];
  for (const f of g.forms || [{ f: 'tab', s: [] }]) {
    const countable = ['tab', 'tab-xr', 'tab-mr', 'tab-sr', 'cap', 'sachet'].includes(f.f);
    const unit = countable ? (f.f === 'cap' ? 'cap' : f.f === 'sachet' ? 'sachet' : 'tab') : g.unit;
    if (countable && f.s?.length) for (const s of f.s) opts.push({ f: f.f, s, unit, label: `${FORMS[f.f] || f.f} ${plainNum(s)} ${g.unit}` });
    else opts.push({ f: f.f, s: null, unit: g.unit, label: `${FORMS[f.f] || f.f} (الجرعة بالـ ${DOSE_UNITS[g.unit] || g.unit})` });
  }
  if (opts.length === 1) return Promise.resolve(opts[0]);
  return new Promise((resolve) => {
    let picked = null;
    openSheet(
      `${g.name}: الشكل والتركيز`,
      (body, close) => {
        body.append(
          h(
            'div',
            { class: 'grid-btns' },
            opts.map((o) =>
              h('button', {
                type: 'button',
                class: 'btn',
                text: o.label,
                onclick: () => {
                  picked = o;
                  close();
                },
              }),
            ),
          ),
        );
      },
      { onClose: () => resolve(picked) },
    );
  });
}

// إضافة منتج جديد سريعاً للمكتبة ثم استخدامه.
function quickNewProduct() {
  return new Promise((resolve) => {
    let out = null;
    openSheet(
      'دواء جديد',
      (body, close) => {
        const name = textInput('', 'الاسم التجاري');
        name.dir = 'ltr';
        let gs = [];
        const gBox = h('div', { class: 'muted', text: 'لم تُختر' });
        const strength = textInput('', 'مثال: 500 أو 50/1000');
        strength.dir = 'ltr';
        const unit = selectInput(
          Object.entries(DOSE_UNITS).map(([v, l]) => ({ value: v, label: l })),
          'tab',
        );
        const err = h('div', { class: 'form-error', style: { display: 'none' } });
        body.append(
          err,
          field('الاسم', name),
          field('المادة الفعالة', h('div', {}, gBox, h('button', { type: 'button', class: 'btn small', text: '+ مادة فعالة', onclick: async () => {
            const id = await pickFromList({ title: 'المادة الفعالة', items: [...genericsMap(ctx.state).values()].filter((g) => !g.hidden).map((g) => ({ id: g.id, title: g.name, dir: 'ltr', subtitle: (g.classes || []).map((c) => DRUG_CLASSES[c] || c).join('، ') })) });
            if (id && !gs.includes(id)) gs.push(id);
            gBox.textContent = gs.map((g) => generic(ctx.state, g)?.name).join(' + ') || 'لم تُختر';
          } })), 'لو المادة نفسها مش موجودة ضيفها من «الأدوية ← + مادة فعالة»'),
          field('التركيز', strength, 'بنفس ترتيب المواد الفعالة، مفصولة بـ /'),
          field('وحدة الجرعة في الروشتة', unit),
          h('button', {
            type: 'button',
            class: 'btn primary block',
            text: 'حفظ في المكتبة واستخدامه',
            onclick: async () => {
              try {
                if (!name.value.trim()) throw new Error('اكتب الاسم');
                if (!gs.length) throw new Error('اختار المادة الفعالة (عشان التنبيهات تشتغل)');
                const parts = strength.value.trim() ? strength.value.split('/').map((x) => Number(x.trim())) : [];
                if (parts.length && (parts.length !== gs.length || parts.some((n) => !(n > 0)))) throw new Error('التركيز لازم بعدد المواد الفعالة');
                const { result } = await ctx.run((b) => b.upsert('drug.product', { name: name.value.trim(), g: gs, v: parts.length ? [parts] : [], unit: unit.value, form: unit.value === 'U' ? 'pen' : 'tab' }));
                out = { productId: result.id, g: gs, name: result.name, s: parts.length ? parts : null, unit: unit.value, form: result.form };
                close();
              } catch (e) {
                err.textContent = e.message;
                err.style.display = '';
              }
            },
          }),
        );
      },
      { onClose: () => resolve(out) },
    );
  });
}

// ---------- اختيار تحليل ----------
export function pickTest({ title = 'اختار التحليل', exclude = [] } = {}) {
  const items = [...labTestsMap(ctx.state).values()]
    .filter((t) => !t.hidden && !exclude.includes(t.id))
    .map((t) => ({ id: t.id, title: `${t.abbr} — ${t.name}`, dir: 'ltr', subtitle: `${LAB_CATEGORIES[t.cat] || ''}${t.unit ? ' · ' + t.unit : ''}`, keywords: t.id }));
  return pickFromList({ title, items, placeholder: 'ابحث: HbA1c, creat, LDL…' });
}

// ---------- بناء الجرعة ----------
const PRESETS = [
  ['مرة الصبح', [['morning', 1]]],
  ['فطار + عشا', [['breakfast', 1], ['dinner', 1]]],
  ['3 وجبات', [['breakfast', 1], ['lunch', 1], ['dinner', 1]]],
  ['قبل النوم', [['bedtime', 1]]],
];

// drug: الدواء المختار (للوحدة الافتراضية والعلاقة بالأكل). يعيد عنصراً فيه .read() → dose.
export function doseBuilder(dose = null, drug = null) {
  const g = drug ? generic(ctx.state, (drug.g || [])[0]) : null;
  const defUnit = drug?.unit || g?.unit || 'tab';
  const isWeekly = g?.freq === 'weekly';
  const wrap = h('div', { class: 'dose' });
  const slotsBox = h('div', { class: 'lines' });
  const rows = [];
  const addSlot = (at = 'morning', amount = null, unit = defUnit) => {
    const t = selectInput(
      Object.entries(SLOT_TIMES).map(([v, l]) => ({ value: v, label: l })),
      at,
    );
    const a = numInput(amount, { placeholder: 'الكمية' });
    const u = selectInput(
      Object.entries(DOSE_UNITS).map(([v, l]) => ({ value: v, label: l })),
      unit,
    );
    const r = { t, a, u };
    const line = h('div', { class: 'line' }, t, a, u, h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'حذف', text: '✕', onclick: () => (rows.splice(rows.indexOf(r), 1), line.remove()) }));
    r.line = line;
    rows.push(r);
    slotsBox.append(line);
  };
  for (const s of dose?.slots || []) addSlot(s.at, s.amount, s.unit);
  if (!dose) addSlot(isWeekly ? 'any' : 'morning', ['tab', 'cap', 'sachet'].includes(defUnit) ? 1 : null);
  const presets = h(
    'div',
    { class: 'chips' },
    PRESETS.map(([label, list]) =>
      h('button', {
        type: 'button',
        class: 'chip',
        text: label,
        onclick: () => {
          const amt = rows[0]?.a.num() || 1;
          rows.splice(0).forEach((r) => r.line.remove());
          for (const [at] of list) addSlot(at, amt);
        },
      }),
    ),
  );
  const freq = selectInput(
    Object.entries(FREQS).map(([v, l]) => ({ value: v, label: l })),
    dose?.freq || (isWeekly ? 'weekly' : 'daily'),
  );
  const weekday = selectInput(
    WEEKDAYS.map((l, i) => ({ value: String(i), label: l })),
    Number.isInteger(dose?.weekday) ? String(dose.weekday) : '',
    { placeholder: 'اليوم (اختياري)' },
  );
  const every = intInput(dose?.every || '');
  const freqExtra = h('div', {});
  const syncFreq = () => {
    clear(freqExtra);
    if (freq.value === 'weekly') freqExtra.append(field('يوم الحقنة/الجرعة', weekday));
    if (freq.value === 'every') freqExtra.append(field('كل كام يوم', every));
  };
  freq.addEventListener('change', syncFreq);
  syncFreq();
  const m0 = drug ? mealOf(ctx.state, { drug }, null) : null;
  const defMeal = m0?.meal ? `حسب الدواء: ${mealText(m0.meal, m0.mealMin)}${m0.note ? ' — ' + m0.note : ''}` : 'غير محدد';
  const meal = selectInput([{ value: '', label: defMeal }, ...Object.entries(MEALS).map(([v, m]) => ({ value: v, label: m.ar }))], dose?.meal || '');
  const mealMin = intInput(dose?.mealMin ?? '');
  mealMin.placeholder = 'دقائق';
  const mealMinField = field('قبل الأكل بكام دقيقة', mealMin);
  const syncMeal = () => (mealMinField.style.display = ['before', 'empty'].includes(meal.value) ? '' : 'none');
  meal.addEventListener('change', syncMeal);
  syncMeal();
  const text = textInput(dose?.text || '', 'مثال: حسب جدول التصحيح');
  const sig = textInput(dose?.sig || '', 'تعليمات إضافية (اختياري)');
  wrap.append(
    h('div', { class: 'label-row' }, h('span', { class: 'lbl', text: 'المواعيد والكمية' }), presets),
    slotsBox,
    h('button', { type: 'button', class: 'btn small', text: '+ ميعاد', onclick: () => addSlot('any', rows[0]?.a.num() || null) }),
    field('التكرار', freq),
    freqExtra,
    field('العلاقة بالأكل', meal),
    mealMinField,
    field('وصف بديل/إضافي للجرعة', text, 'لو الجرعة متغيرة (مثلاً حسب قراءة السكر)'),
    field('تعليمات', sig),
  );
  wrap.read = () => {
    const slots = [];
    for (const r of rows) {
      const v = r.a.num();
      if (v === null) continue;
      if (Number.isNaN(v) || v <= 0) throw new ValidationError('الكمية لازم تكون رقم أكبر من صفر');
      slots.push({ at: r.t.value, amount: v, unit: r.u.value });
    }
    const d = { slots, freq: freq.value };
    if (freq.value === 'weekly' && weekday.value !== '') d.weekday = Number(weekday.value);
    if (freq.value === 'every') d.every = every.int();
    if (meal.value) d.meal = meal.value;
    if (['before', 'empty'].includes(meal.value) && Number.isInteger(mealMin.int())) d.mealMin = mealMin.int();
    if (text.value.trim()) d.text = text.value.trim();
    if (sig.value.trim()) d.sig = sig.value.trim();
    return d;
  };
  return wrap;
}

// خيار «نعم/لا» بسيط.
export const yesNo = (label, v) => checkbox(label, !!v);
