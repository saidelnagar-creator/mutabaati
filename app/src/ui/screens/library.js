// مكتبة الأدوية: البحث بالعلمي والتجاري، التصنيف بالمجموعة/المرض/الاستخدام، تفاصيل المادة الفعالة وقواعدها،
// تأكيد الأسماء التجارية («محتاج مراجعة»)، وتعديل/إضافة/إخفاء أي دواء.
import { h, clear } from '../dom.js';
import { ctx } from '../ctx.js';
import { badge, card, checkbox, chips, empty, errorBox, field, kv, list, numInput, openSheet, row, sectionTitle, selectInput, textArea, textInput, toast, pickFromList } from '../components.js';
import { saveButton } from '../forms-common.js';
import { levelBadge } from '../widgets.js';
import { genericsMap, productsMap, generic, product, rulesMap, searchDrugs } from '../../core/catalog.js';
import { DRUG_CLASSES, DISEASE_TAGS, USE_TAGS, MEALS, FORMS, DOSE_UNITS } from '../../config/catalog/drugs.js';
import { mealText } from '../../core/meds.js';
import { plainNum, parseNum } from '../../core/num.js';
import { ValidationError } from '../../core/util.js';

const f = { q: '', by: 'all', tag: '' };

export function libraryScreen() {
  const state = ctx.state;
  const body = h('div', {});
  const search = h('input', { class: 'search', type: 'search', placeholder: 'اسم تجاري أو علمي أو مجموعة…', value: f.q, 'aria-label': 'بحث' });
  const box = h('div', {});
  const tagBox = h('div', {});
  const review = [...productsMap(state).values()].filter((p) => p.needsReview && !p.hidden).length;
  const render = () => {
    clear(box);
    const gm = genericsMap(state);
    let items = searchDrugs(state, f.q, { limit: 400 });
    if (f.by === 'review') items = items.filter((x) => x.type === 'product' && x.item.needsReview);
    if (f.by === 'custom') items = items.filter((x) => x.item.custom || x.item.edited);
    if (f.tag) {
      const [kind, val] = f.tag.split(':');
      const gOk = (g) => (kind === 'class' ? (g.classes || []).includes(val) : kind === 'dis' ? (g.dis || []).includes(val) : (g.use || []).includes(val));
      items = items.filter((x) => (x.type === 'generic' ? gOk(x.item) : (x.item.g || []).some((gid) => gm.get(gid) && gOk(gm.get(gid)))));
    }
    box.append(
      items.length
        ? list(
            items.map(({ type, item }) =>
              row({
                title: item.name,
                dir: 'ltr',
                subtitle: type === 'product' ? (item.g || []).map((g) => gm.get(g)?.name || g).join(' + ') + (item.v?.length ? ` • ${item.v.map((v) => v.map(plainNum).join('/')).join('، ')}` : '') : (item.classes || []).map((c) => DRUG_CLASSES[c] || c).join('، '),
                badge: type === 'product' ? (item.needsReview ? badge('محتاج مراجعة', 'warn') : badge(item.custom ? 'مضاف' : 'تجاري', 'info')) : badge(item.custom ? 'مضاف' : 'علمي', ''),
                onclick: () => ctx.nav(type === 'product' ? `#/drug/p/${item.id}` : `#/drug/g/${item.id}`),
              }),
            ),
          )
        : empty('مفيش نتائج'),
    );
  };
  const renderTags = () => {
    clear(tagBox);
    if (f.by === 'class') tagBox.append(chips(Object.entries(DRUG_CLASSES).map(([v, l]) => ({ value: `class:${v}`, label: l })), f.tag, (v) => ((f.tag = v), render())));
    if (f.by === 'dis') tagBox.append(chips(Object.entries(DISEASE_TAGS).map(([v, l]) => ({ value: `dis:${v}`, label: l })), f.tag, (v) => ((f.tag = v), render())));
    if (f.by === 'use') tagBox.append(chips(Object.entries(USE_TAGS).map(([v, l]) => ({ value: `use:${v}`, label: l })), f.tag, (v) => ((f.tag = v), render())));
  };
  search.addEventListener('input', () => ((f.q = search.value), render()));
  body.append(
    search,
    chips(
      [
        { value: 'all', label: 'الكل' },
        { value: 'class', label: 'بالمجموعة' },
        { value: 'dis', label: 'بالمرض' },
        { value: 'use', label: 'بالاستخدام' },
        { value: 'review', label: `محتاج مراجعة (${review})` },
        { value: 'custom', label: 'المضاف/المعدّل' },
      ],
      f.by,
      (v) => {
        f.by = v;
        f.tag = '';
        renderTags();
        render();
      },
    ),
    tagBox,
    box,
  );
  renderTags();
  render();
  return {
    title: 'الأدوية',
    root: true,
    body,
    fab: {
      label: 'إضافة',
      onclick: async () => {
        const what = await pickFromList({ title: 'إضافة للمكتبة', items: [{ id: 'p', title: 'اسم تجاري / منتج', subtitle: 'لمادة فعالة موجودة' }, { id: 'g', title: 'مادة فعالة جديدة', subtitle: 'اسم علمي مش موجود' }] });
        if (what === 'p') productForm(null);
        if (what === 'g') genericForm(null);
      },
    },
  };
}

export function genericScreen({ id }) {
  const g = generic(ctx.state, id);
  if (!g) return { title: 'غير موجود', body: empty('غير موجود') };
  const body = h('div', {});
  const n = g.notes || {};
  body.append(
    card(
      kv('الاسم', h('span', { dir: 'ltr', text: g.name })),
      kv('المجموعة', (g.classes || []).map((c) => DRUG_CLASSES[c] || c).join('، ') || '—'),
      kv('المرض', (g.dis || []).map((x) => DISEASE_TAGS[x] || x).join('، ') || '—'),
      kv('الاستخدام', (g.use || []).map((x) => USE_TAGS[x] || x).join('، ') || '—'),
      kv('العلاقة بالأكل', `${mealText(g.meal, g.mealMin) || '—'}${g.mealNote ? ` — ${g.mealNote}` : ''}`),
      kv('التركيزات', (g.forms || []).map((x) => `${FORMS[x.f] || x.f}${x.s?.length ? ' ' + x.s.map(plainNum).join('/') : ''}`).join(' • ') || '—'),
      g.maxDay ? kv('أقصى جرعة يومية', `${plainNum(g.maxDay)} ${g.unit}`) : null,
      g.maxWeek ? kv('أقصى جرعة أسبوعية', `${plainNum(g.maxWeek)} ${g.unit}`) : null,
      kv('يسبب هبوط بذاته', g.hypo ? 'نعم' : 'لا'),
    ),
  );
  if (Object.values(n).some(Boolean)) body.append(sectionTitle('ملاحظات'), card(n.renal ? kv('الكلى', n.renal) : null, n.hepatic ? kv('الكبد', n.hepatic) : null, n.preg ? kv('الحمل', n.preg) : null, n.lact ? kv('الرضاعة', n.lact) : null, n.elderly ? kv('كبار السن', n.elderly) : null, n.other ? kv('أخرى', n.other) : null));
  const rules = [...rulesMap(ctx.state).values()].filter((r) => (r.med?.g || []).includes(g.id) || (r.med?.c || []).some((c) => (g.classes || []).includes(c)));
  if (rules.length) body.append(sectionTitle(`قواعد التنبيه (${rules.length})`), list(rules.map((r) => row({ title: r.title, subtitle: r.enabled ? r.ref : 'مقفولة', badge: levelBadge(r.level), cls: r.enabled ? '' : 'voided', onclick: () => ctx.nav(`#/rule/${r.id}`) }))));
  const prods = [...productsMap(ctx.state).values()].filter((p) => (p.g || []).includes(g.id) && !p.hidden);
  if (prods.length) body.append(sectionTitle('الأسماء التجارية'), list(prods.map((p) => row({ title: p.name, dir: 'ltr', subtitle: p.v?.map((v) => v.map(plainNum).join('/')).join('، '), badge: p.needsReview ? badge('محتاج مراجعة', 'warn') : null, onclick: () => ctx.nav(`#/drug/p/${p.id}`) }))));
  if (g.counsel) body.append(sectionTitle('تعليمات المريض'), card(kv('عامية', g.counsel.egy), kv('فصحى', g.counsel.msa)));
  body.append(h('button', { type: 'button', class: 'btn block', text: 'تعديل', onclick: () => genericForm(g) }));
  return { title: g.name, subtitle: g.custom ? 'مضاف' : g.edited ? 'معدّل' : 'من المكتبة الافتراضية', body };
}

export function productScreen({ id }) {
  const p = product(ctx.state, id);
  if (!p) return { title: 'غير موجود', body: empty('غير موجود') };
  const body = h('div', {});
  if (p.needsReview)
    body.append(
      h('div', { class: 'banner warn' }, h('span', { class: 'grow', text: 'الاسم ده من القائمة المبدئية: أكّد إنه متاح في السوق وإن التركيزات صح.' }), h('button', { type: 'button', class: 'btn small', text: 'تأكيد', onclick: async () => (await ctx.run((b) => b.upsert('drug.product', { id: p.id, reviewed: true })), toast('اتأكد')) })),
    );
  body.append(
    card(
      kv('الاسم', h('span', { dir: 'ltr', text: p.name })),
      kv('المادة الفعالة', h('span', { dir: 'ltr' }, (p.g || []).map((g, i) => [i ? ' + ' : '', h('button', { type: 'button', class: 'link', text: generic(ctx.state, g)?.name || g, onclick: () => ctx.nav(`#/drug/g/${g}`) })]))),
      kv('الشكل', FORMS[p.form] || p.form || '—'),
      kv('التركيزات', p.v?.length ? p.v.map((v) => v.map(plainNum).join('/')).join(' • ') : '—'),
      kv('وحدة الجرعة', DOSE_UNITS[p.unit] || p.unit),
      p.note ? kv('ملاحظة', p.note) : null,
    ),
    h('button', { type: 'button', class: 'btn block', text: 'تعديل', onclick: () => productForm(p) }),
  );
  return { title: p.name, subtitle: p.custom ? 'مضاف' : p.edited ? 'معدّل' : '', body };
}

// تعديل/إضافة منتج.
export function productForm(p = null) {
  openSheet(p ? `تعديل ${p.name}` : 'اسم تجاري جديد', (body, close) => {
    const err = errorBox();
    const name = textInput(p?.name || '');
    name.dir = 'ltr';
    let gs = (p?.g || []).slice();
    const gBox = h('div', { dir: 'ltr' });
    const renderG = () => {
      clear(gBox);
      gBox.append(gs.map((g) => badge(generic(ctx.state, g)?.name || g, 'info')), h('button', { type: 'button', class: 'btn small', text: '+', onclick: async () => {
        const id = await pickFromList({ title: 'المادة الفعالة', items: [...genericsMap(ctx.state).values()].filter((x) => !x.hidden).map((x) => ({ id: x.id, title: x.name, dir: 'ltr' })) });
        if (id && !gs.includes(id)) gs.push(id);
        renderG();
      } }), gs.length ? h('button', { type: 'button', class: 'btn small', text: 'مسح', onclick: () => ((gs = []), renderG()) }) : null);
    };
    renderG();
    const strengths = textInput((p?.v || []).map((v) => v.map(plainNum).join('/')).join('، '), 'مثال: 500، 850، 1000 أو 50/500، 50/1000');
    strengths.dir = 'ltr';
    const unit = selectInput(Object.entries(DOSE_UNITS).map(([v, l]) => ({ value: v, label: l })), p?.unit || 'tab');
    const form = selectInput(Object.entries(FORMS).map(([v, l]) => ({ value: v, label: l })), p?.form || 'tab');
    const reviewed = checkbox('مؤكد إنه متاح بالتركيزات دي', p ? !p.needsReview : true);
    const hidden = checkbox('إخفاء من القوائم (الاستخدام القديم يفضل)', !!p?.hidden);
    body.append(
      err,
      field('الاسم', name),
      field('المادة الفعالة (بالترتيب)', gBox),
      field('التركيزات', strengths, 'كل تركيز مفصول بفاصلة؛ التركيبة: الأرقام بنفس ترتيب المواد مفصولة بـ /'),
      h('div', { class: 'grid2' }, field('وحدة الجرعة', unit), field('الشكل', form)),
      reviewed,
      hidden,
      saveButton(
        'حفظ',
        async () => {
          const v = strengths.value
            .split(/[،,]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => s.split('/').map((x) => parseNum(x)));
          if (v.some((x) => x.some((n) => !(n > 0)))) throw new ValidationError('التركيز لازم أرقام');
          await ctx.run((b) => b.upsert('drug.product', { ...(p ? { id: p.id } : {}), name: name.value.trim(), g: gs, v, unit: unit.value, form: form.value, reviewed: reviewed.input.checked, archived: hidden.input.checked || undefined }));
          toast('تم الحفظ');
          close();
        },
        err,
      ),
    );
  });
}

// تعديل/إضافة مادة فعالة (المجموعات، العلاقة بالأكل، الملاحظات).
export function genericForm(g = null) {
  openSheet(g ? `تعديل ${g.name}` : 'مادة فعالة جديدة', (body, close) => {
    const err = errorBox();
    const name = textInput(g?.name || '');
    name.dir = 'ltr';
    let classes = (g?.classes || []).slice();
    const cl = chips(Object.entries(DRUG_CLASSES).map(([v, l]) => ({ value: v, label: l })), classes, (v) => (classes = v), { multi: true });
    let dis = (g?.dis || []).slice();
    const di = chips(Object.entries(DISEASE_TAGS).map(([v, l]) => ({ value: v, label: l })), dis, (v) => (dis = v), { multi: true });
    let use = (g?.use || []).slice();
    const us = chips(Object.entries(USE_TAGS).map(([v, l]) => ({ value: v, label: l })), use, (v) => (use = v), { multi: true });
    const meal = selectInput(Object.entries(MEALS).map(([v, m]) => ({ value: v, label: m.ar })), g?.meal || 'any');
    const mealMin = numInput(g?.mealMin ?? null, { placeholder: 'دقائق قبل الأكل' });
    const mealNote = textInput(g?.mealNote || '');
    const unit = selectInput(['mg', 'mcg', 'U', 'IU', 'g', 'ml'].map((v) => ({ value: v, label: DOSE_UNITS[v] })), g?.unit || 'mg');
    const strengths = textInput((g?.forms?.[0]?.s || []).map(plainNum).join('، '), 'مثال: 5، 10');
    strengths.dir = 'ltr';
    const maxDay = numInput(g?.maxDay ?? null);
    const hypo = checkbox('يسبب هبوط سكر بذاته', !!g?.hypo);
    const notes = {};
    const n = g?.notes || {};
    for (const [k, l] of [
      ['renal', 'الكلى'],
      ['hepatic', 'الكبد'],
      ['preg', 'الحمل'],
      ['lact', 'الرضاعة'],
      ['elderly', 'كبار السن'],
      ['other', 'ملاحظات'],
    ])
      notes[k] = [l, textArea(n[k] || '')];
    const hidden = checkbox('إخفاء من القوائم', !!g?.hidden);
    body.append(
      err,
      field('الاسم العلمي', name),
      field('المجموعة', cl),
      field('المرض', di),
      field('الاستخدام', us),
      h('div', { class: 'grid2' }, field('العلاقة بالأكل', meal), field('قبل الأكل بـ', mealMin)),
      field('توضيح العلاقة بالأكل', mealNote),
      h('div', { class: 'grid2' }, field('وحدة الجرعة', unit), field('أقصى جرعة يومية', maxDay)),
      g ? null : field('التركيزات (أقراص)', strengths),
      hypo,
      ...Object.values(notes).map(([l, el]) => field(l, el)),
      hidden,
      saveButton(
        'حفظ',
        async () => {
          const md = maxDay.num();
          const mm = mealMin.num();
          if (Number.isNaN(md) || Number.isNaN(mm)) throw new ValidationError('الأرقام غير صالحة');
          const data = { ...(g ? { id: g.id } : {}), name: name.value.trim(), classes, dis, use, meal: meal.value, mealMin: mm ?? undefined, mealNote: mealNote.value.trim() || undefined, unit: unit.value, maxDay: md ?? undefined, hypo: hypo.input.checked, notes: Object.fromEntries(Object.entries(notes).map(([k, [, el]]) => [k, el.value.trim() || undefined])), archived: hidden.input.checked || undefined };
          if (!g) {
            const s = strengths.value.split(/[،,]/).map((x) => parseNum(x)).filter((x) => x > 0);
            data.forms = [{ f: 'tab', s }];
          }
          const { result } = await ctx.run((b) => b.upsert('drug.generic', data));
          toast('تم الحفظ');
          close();
          if (!g) ctx.nav(`#/drug/g/${result.id}`);
        },
        err,
      ),
    );
  });
}
