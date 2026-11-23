// القوائم الفعلية = القوائم الافتراضية (config/catalog) + تعديلات الطبيب وإضافاته (كيانات في السجل بنفس المعرّف أو معرّف جديد).
// تحديث التطبيق ممكن يضيف أدوية/قواعد جديدة بدون ما يمسح أي تعديل.
import { GENERICS, PRODUCTS, DRUG_CLASSES } from '../config/catalog/drugs.js';
import { LAB_TESTS, LAB_PANELS } from '../config/catalog/labs.js';
import { ALERT_RULES } from '../config/catalog/alerts.js';
import { CONDITIONS } from '../config/catalog/conditions.js';
import { listEntities } from './engine.js';

const cache = new WeakMap();
function memo(state, key, build) {
  let c = cache.get(state);
  if (!c || c.version !== state.version) cache.set(state, (c = { version: state.version, vals: new Map() }));
  if (!c.vals.has(key)) c.vals.set(key, build());
  return c.vals.get(key);
}

// دمج قائمة افتراضية مع كيانات التعديل. النتيجة Map(id → عنصر) فيها custom/edited/hidden.
function merge(base, overrides) {
  const out = new Map(base.map((x) => [x.id, { ...x, custom: false, edited: false, hidden: false }]));
  for (const o of overrides) {
    const prev = out.get(o.id);
    const { createdAt, updatedAt, archived, ...fields } = o;
    if (prev) out.set(o.id, { ...prev, ...fields, custom: false, edited: true, hidden: !!archived, updatedAt });
    else out.set(o.id, { ...fields, custom: true, edited: false, hidden: !!archived, updatedAt });
  }
  return out;
}

export const genericsMap = (state) => memo(state, 'generics', () => merge(GENERICS, listEntities(state, 'drug.generic', { archived: true })));
export const productsMap = (state) =>
  memo(state, 'products', () => {
    const m = merge(PRODUCTS, listEntities(state, 'drug.product', { archived: true }));
    for (const p of m.values()) p.needsReview = !!p.review && !p.reviewed;
    return m;
  });
export const labTestsMap = (state) => memo(state, 'labs', () => merge(LAB_TESTS, listEntities(state, 'lab.test', { archived: true })));
export const labPanels = (state) => memo(state, 'panels', () => [...merge(LAB_PANELS, listEntities(state, 'lab.panel', { archived: true })).values()].filter((p) => !p.hidden));
export const conditionsMap = (state) => memo(state, 'conds', () => new Map(CONDITIONS.map((c) => [c.id, c])));
export const drugClasses = () => DRUG_CLASSES;

// القواعد: الافتراضية + تعديل (enabled/params/نصوص/level) + قواعد جديدة.
export const rulesMap = (state) =>
  memo(state, 'rules', () => {
    const m = new Map(ALERT_RULES.map((r) => [r.id, { ...r, enabled: true, custom: false, edited: false, defaults: r.params || {} }]));
    for (const o of listEntities(state, 'rule', { archived: true })) {
      const prev = m.get(o.id);
      const { createdAt, updatedAt, archived, ...fields } = o;
      if (prev) m.set(o.id, { ...prev, ...fields, params: { ...(prev.params || {}), ...(fields.params || {}) }, enabled: archived ? false : fields.enabled !== false, edited: true, updatedAt });
      else m.set(o.id, { ...fields, enabled: archived ? false : fields.enabled !== false, custom: true, defaults: {}, updatedAt });
    }
    return m;
  });

export const generic = (state, id) => genericsMap(state).get(id) || null;
export const product = (state, id) => productsMap(state).get(id) || null;
export const labTest = (state, id) => labTestsMap(state).get(id) || null;
export const condition = (state, id) => conditionsMap(state).get(id) || null;

// تصنيفات الدواء = اتحاد تصنيفات مواده الفعالة.
export function classesOf(state, genericIds) {
  const out = new Set();
  for (const g of genericIds || []) for (const c of generic(state, g)?.classes || []) out.add(c);
  return out;
}

// بحث موحّد في المكتبة (علمي + تجاري). يعيد [{type:'generic'|'product', item, score}].
export function searchDrugs(state, query, { limit = 40, includeHidden = false } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const out = [];
  const gm = genericsMap(state);
  for (const p of productsMap(state).values()) {
    if (p.hidden && !includeHidden) continue;
    const names = [p.name, ...(p.g || []).map((g) => gm.get(g)?.name || g)].join(' ').toLowerCase();
    const s = !q ? 2 : p.name.toLowerCase().startsWith(q) ? 0 : names.includes(q) ? 1 : -1;
    if (s >= 0) out.push({ type: 'product', item: p, score: s });
  }
  for (const g of gm.values()) {
    if (g.hidden && !includeHidden) continue;
    const s = !q ? 3 : g.name.toLowerCase().startsWith(q) || g.id.startsWith(q) ? 0 : `${g.name} ${(g.classes || []).map((c) => DRUG_CLASSES[c] || c).join(' ')}`.toLowerCase().includes(q) ? 1 : -1;
    if (s >= 0) out.push({ type: 'generic', item: g, score: s });
  }
  out.sort((a, b) => a.score - b.score || (a.type === b.type ? 0 : a.type === 'product' ? -1 : 1) || a.item.name.localeCompare(b.item.name));
  return out.slice(0, limit);
}

// العنصر الافتراضي لكيان تعديل (لتحقق التعديل الجزئي مدموجاً مع الأصل).
const BUILTIN = { 'drug.generic': GENERICS, 'drug.product': PRODUCTS, 'lab.test': LAB_TESTS, 'lab.panel': LAB_PANELS, rule: ALERT_RULES };
export const builtinOf = (kind, id) => (BUILTIN[kind] || []).find((x) => x.id === id) || null;
