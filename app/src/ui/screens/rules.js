// القواعد والتنبيهات: عرض كل قاعدة بشروطها ومرجعها، تعديل الأرقام والنصوص والمستوى، القفل/الفتح، الرجوع للأصل، وإضافة قواعد جديدة.
import { h, clear } from '../dom.js';
import { ctx } from '../ctx.js';
import { badge, card, checkbox, chips, confirmDialog, empty, errorBox, field, kv, list, numInput, openSheet, row, selectInput, textArea, textInput, toast, pickFromList } from '../components.js';
import { saveButton } from '../forms-common.js';
import { levelBadge } from '../widgets.js';
import { rulesMap, builtinOf, generic, genericsMap } from '../../core/catalog.js';
import { LEVELS } from '../../config/catalog/alerts.js';
import { DRUG_CLASSES } from '../../config/catalog/drugs.js';
import { CONDITIONS, DM_TYPES } from '../../config/catalog/conditions.js';
import { plainNum } from '../../core/num.js';
import { ValidationError } from '../../core/util.js';

export const FIELDS = { age: 'السن', egfr: 'eGFR', crcl: 'CrCl', uacr: 'UACR', a1c: 'HbA1c', k: 'K', alt_uln: 'ALT ÷ الحد الأعلى', ast_uln: 'AST ÷ الحد الأعلى', bmi: 'BMI', weight: 'الوزن', ldl: 'LDL', fib4: 'FIB-4', cpep: 'C-peptide', tdd_kg: 'إنسولين كلي و/كجم', basal_kg: 'إنسولين قاعدي و/كجم', dose_day: 'الجرعة اليومية (مجم)', dose_week: 'الجرعة الأسبوعية', hypo2_90: 'هبوط مستوى 2–3 (90 يوم)', sbp: 'الضغط الانقباضي', dbp: 'الضغط الانبساطي' };
const OPS = ['<', '<=', '>', '>=', '='];

function tokText(tok, d) {
  const [a, b, c] = tok.split(':');
  if (a === 'cond') {
    const def = CONDITIONS.find((x) => x.id === b);
    return `${def?.ar || b}${d ? ` (${Object.entries(d).map(([k, v]) => `${k}: ${v.join('/')}`).join('، ')})` : ''}`;
  }
  if (a === 'class') return `على ${DRUG_CLASSES[b] || b}`;
  if (a === 'generic') return `على ${generic(ctx.state, b)?.name || b}`;
  if (a === 'other') return `دواء تاني من ${b === 'class' ? DRUG_CLASSES[c] || c : generic(ctx.state, c)?.name || c}`;
  if (a === 'dm') return b === 'any' ? 'مريض سكر (أي نوع)' : DM_TYPES.find((t) => t.id === b)?.ar || b;
  if (a === 'sex') return b === 'F' ? 'أنثى' : 'ذكر';
  if (a === 'flag') return 'نقص إنسولين (نوع أول/LADA/C-peptide منخفض)';
  return tok;
}
export function predText(p, params) {
  if (Array.isArray(p)) {
    const [f, op, v] = p;
    const val = typeof v === 'string' && v.startsWith('$') ? params[v.slice(1)] : v;
    return `${FIELDS[f] || f} ${op} ${plainNum(val)}`;
  }
  if (p.has) return tokText(p.has, p.d);
  if (p.lacks) return `مش ${tokText(p.lacks, p.d)}`;
  if (p.missing) return `مفيش ${FIELDS[p.missing] || p.missing} خلال ${plainNum(typeof p.days === 'string' ? params[p.days.slice(1)] : p.days)} يوم`;
  if (p.any) return `(${p.any.map((q) => predText(q, params)).join(' أو ')})`;
  if (p.all) return `(${p.all.map((q) => predText(q, params)).join(' و ')})`;
  return '?';
}
function matchText(r) {
  if ((r.scope || 'med') !== 'med') return 'على مستوى المريض';
  const parts = [...(r.med?.g || []).map((g) => generic(ctx.state, g)?.name || g), ...(r.med?.c || []).map((c) => DRUG_CLASSES[c] || c)];
  return `لكل دواء من: ${parts.join('، ')}${r.med?.xg?.length ? ` (ماعدا ${r.med.xg.map((g) => generic(ctx.state, g)?.name || g).join('، ')})` : ''}`;
}

const fl = { q: '', level: 'all' };
export function rulesScreen() {
  const body = h('div', {});
  const rules = [...rulesMap(ctx.state).values()];
  const search = h('input', { class: 'search', type: 'search', placeholder: 'ابحث: metformin، الحمل، eGFR…', value: fl.q });
  const box = h('div', {});
  const render = () => {
    clear(box);
    const q = fl.q.trim().toLowerCase();
    const shown = rules.filter((r) => (fl.level === 'all' || (fl.level === 'off' ? !r.enabled : fl.level === 'edited' ? r.edited || r.custom : r.level === fl.level)) && (!q || `${r.title} ${r.msg} ${r.ref} ${matchText(r)}`.toLowerCase().includes(q)));
    box.append(shown.length ? list(shown.map((r) => row({ title: r.title, subtitle: matchText(r), badge: r.enabled ? levelBadge(r.level) : badge('مقفولة', ''), cls: r.enabled ? '' : 'voided', end: r.custom ? badge('مضافة', 'info') : r.edited ? badge('معدّلة', 'info') : null, onclick: () => ctx.nav(`#/rule/${r.id}`) }))) : empty('مفيش قواعد'));
  };
  search.addEventListener('input', () => ((fl.q = search.value), render()));
  body.append(
    h('p', { class: 'muted small', text: `${rules.length} قاعدة. كل رقم ونص ومستوى قابل للتعديل، وأي قاعدة ممكن تتقفل. التعديل يبان في التنبيهات فوراً.` }),
    search,
    chips([{ value: 'all', label: 'الكل' }, ...Object.entries(LEVELS).map(([v, l]) => ({ value: v, label: l.ar })), { value: 'edited', label: 'المعدّلة' }, { value: 'off', label: 'المقفولة' }], fl.level, (v) => ((fl.level = v), render())),
    box,
  );
  render();
  return { title: 'القواعد والتنبيهات', body, fab: { label: 'قاعدة جديدة', onclick: () => customRuleForm() } };
}

export function ruleScreen({ id }) {
  const r = rulesMap(ctx.state).get(id);
  if (!r) return { title: 'غير موجودة', body: empty('القاعدة غير موجودة') };
  const params = { ...(r.defaults || {}), ...(r.params || {}) };
  const body = h('div', {});
  const err = errorBox();
  const enabled = checkbox('مفعّلة', r.enabled);
  const level = selectInput(Object.entries(LEVELS).map(([v, l]) => ({ value: v, label: l.ar })), r.level);
  const title = textInput(r.title);
  const msg = textArea(r.msg, '', 3);
  const suggest = textArea(r.suggest || '', '', 2);
  const pEls = Object.entries(params).map(([k, v]) => [k, numInput(v)]);
  const conds = [...(r.all || []).map((p) => predText(p, params)), ...(r.any?.length ? [`واحد على الأقل من: ${r.any.map((p) => predText(p, params)).join(' / ')}`] : [])];
  body.append(
    card(kv('ينطبق', matchText(r)), kv('الشروط', h('ul', { class: 'flag-list' }, conds.map((c) => h('li', { text: c })))), kv('المرجع', h('span', { dir: 'ltr', text: r.ref || '—' }))),
    err,
    enabled,
    field('المستوى', level),
    pEls.length ? h('div', { class: 'section-title' }, h('span', { text: 'الأرقام (المعاملات)' })) : null,
    ...pEls.map(([k, el]) => field(`${k}${r.defaults?.[k] !== undefined ? ` (الأصل: ${plainNum(r.defaults[k])})` : ''}`, el)),
    field('العنوان', title),
    field('الرسالة', msg, '{egfr} قيمة المريض • {$egfr} قيمة المعامل'),
    field('البديل المقترح', suggest),
    saveButton(
      'حفظ',
      async () => {
        const p = {};
        for (const [k, el] of pEls) {
          const v = el.num();
          if (v === null || Number.isNaN(v)) throw new ValidationError(`${k}: لازم رقم`);
          p[k] = v;
        }
        await ctx.run((b) => b.upsert('rule', { id: r.id, enabled: enabled.input.checked, level: level.value, title: title.value.trim(), msg: msg.value.trim(), suggest: suggest.value.trim(), params: p, archived: false }));
        toast('تم حفظ القاعدة');
        ctx.back();
      },
      err,
    ),
  );
  const base = builtinOf('rule', r.id);
  if (base && r.edited)
    body.append(
      h('button', {
        type: 'button',
        class: 'btn block',
        style: { marginTop: '8px' },
        text: 'رجوع للأصل',
        onclick: async () => {
          if (!(await confirmDialog({ title: 'رجوع للأصل؟', message: 'الأرقام والنصوص هترجع زي المكتبة الافتراضية والقاعدة هتتفعل.', okText: 'رجوع' }))) return;
          await ctx.run((b) => b.upsert('rule', { id: r.id, enabled: true, level: base.level, title: base.title, msg: base.msg, suggest: base.suggest, params: base.params || {}, archived: false }));
          toast('رجعت للأصل');
        },
      }),
    );
  if (r.custom) body.append(h('button', { type: 'button', class: 'btn block danger', style: { marginTop: '8px' }, text: 'حذف القاعدة', onclick: async () => (await confirmDialog({ title: 'حذف القاعدة؟', okText: 'حذف', danger: true })) && (await ctx.run((b) => b.upsert('rule', { id: r.id, archived: true, enabled: false })), ctx.back()) }));
  return { title: r.title, subtitle: r.custom ? 'قاعدة مضافة' : r.edited ? 'معدّلة' : 'من المكتبة', body };
}

// قاعدة جديدة بسيطة: دواء/مجموعة أو مستوى المريض + حتى 3 شروط رقمية + حالات.
export function customRuleForm() {
  openSheet('قاعدة جديدة', (body, close) => {
      const err = errorBox();
      const scope = selectInput([{ value: 'med', label: 'على دواء/مجموعة' }, { value: 'patient', label: 'على المريض (اقتراح/متابعة)' }], 'med');
      let gs = [];
      let cs = [];
      const gBox = h('div', { dir: 'ltr' });
      const renderG = () => {
        clear(gBox);
        gBox.append(gs.map((g) => badge(generic(ctx.state, g)?.name || g, 'info')), h('button', { type: 'button', class: 'btn small', text: '+ مادة', onclick: async () => {
          const id = await pickFromList({ title: 'المادة الفعالة', items: [...genericsMap(ctx.state).values()].map((x) => ({ id: x.id, title: x.name, dir: 'ltr' })) });
          if (id && !gs.includes(id)) gs.push(id);
          renderG();
        } }));
      };
      renderG();
      const cChips = chips(Object.entries(DRUG_CLASSES).map(([v, l]) => ({ value: v, label: l })), [], (v) => (cs = v), { multi: true });
      const medBox = h('div', {}, field('المواد الفعالة', gBox), field('أو المجموعات', cChips));
      scope.addEventListener('change', () => (medBox.style.display = scope.value === 'med' ? '' : 'none'));
      const preds = [0, 1, 2].map(() => ({ f: selectInput(Object.entries(FIELDS).map(([v, l]) => ({ value: v, label: l })), '', { placeholder: '—' }), op: selectInput(OPS.map((o) => ({ value: o, label: o })), '<'), v: numInput(null) }));
      let has = [];
      const hasChips = chips(CONDITIONS.map((c) => ({ value: c.id, label: c.ar })), [], (v) => (has = v), { multi: true });
      const level = selectInput(Object.entries(LEVELS).map(([v, l]) => ({ value: v, label: l.ar })), 'caution');
      const title = textInput('');
      const msg = textArea('', 'مثال: eGFR {egfr} — راجع الجرعة', 2);
      const suggest = textArea('', '', 2);
      const ref = textInput('', 'المرجع (اختياري)');
      body.append(
        err,
        field('النطاق', scope),
        medBox,
        h('div', { class: 'section-title' }, h('span', { text: 'الشروط (كلها لازم تتحقق)' })),
        ...preds.map((p) => h('div', { class: 'line' }, p.f, p.op, p.v)),
        field('ومعاه الحالات دي', hasChips),
        field('المستوى', level),
        field('العنوان', title),
        field('الرسالة', msg),
        field('البديل المقترح', suggest),
        field('المرجع', ref),
        saveButton(
          'حفظ القاعدة',
          async () => {
            const all = [];
            for (const p of preds) {
              if (!p.f.value) continue;
              const v = p.v.num();
              if (v === null || Number.isNaN(v)) throw new ValidationError(`${FIELDS[p.f.value]}: اكتب الرقم`);
              all.push([p.f.value, p.op.value, v]);
            }
            for (const c of has) all.push({ has: `cond:${c}` });
            if (!all.length) throw new ValidationError('حط شرط واحد على الأقل');
            if (scope.value === 'med' && !gs.length && !cs.length) throw new ValidationError('اختار دواء أو مجموعة');
            if (!title.value.trim()) throw new ValidationError('اكتب عنوان');
            await ctx.run((b) => b.upsert('rule', { scope: scope.value, ...(scope.value === 'med' ? { med: { g: gs, c: cs } } : {}), all, level: level.value, title: title.value.trim(), msg: msg.value.trim() || title.value.trim(), suggest: suggest.value.trim(), ref: ref.value.trim() || 'قاعدة الطبيب', enabled: true }));
            toast('اتضافت القاعدة');
            close();
          },
          err,
        ),
      );
    });
}
