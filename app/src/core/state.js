// شكل الحالة المشتقة من السجل + أدوات القراءة. بلا استيرادات (تكسر الحلقات بين الوحدات).
export function emptyState() {
  return {
    entities: new Map(), // kind → Map(id → item)
    entries: [], // بترتيب الإضافة
    entryById: new Map(),
    byPatient: new Map(), // patientId → [entries]
    settings: {},
    version: 0, // يزيد مع كل حدث (للذاكرة المؤقتة للحسابات)
  };
}

const NONE = new Map();
// للقراءة فقط: لا يُنشئ مجموعة فاضية (القراءة لا تغيّر الحالة).
export const entities = (state, kind) => state.entities.get(kind) || NONE;
// للكتابة (engine فقط).
export function entitiesW(state, kind) {
  let m = state.entities.get(kind);
  if (!m) state.entities.set(kind, (m = new Map()));
  return m;
}
export const entity = (state, kind, id) => (id ? entities(state, kind).get(id) || null : null);
export const listEntities = (state, kind, { archived = false } = {}) => [...entities(state, kind).values()].filter((x) => archived || !x.archived);

export const activeEntries = (state, pred = () => true) => state.entries.filter((e) => !e.voided && pred(e));
// قيود مريض (السارية فقط افتراضياً)، اختيارياً بنوع.
export function patientEntries(state, patientId, kind = null, { voided = false } = {}) {
  const all = state.byPatient.get(patientId) || [];
  return all.filter((e) => (voided || !e.voided) && (!kind || (Array.isArray(kind) ? kind.includes(e.kind) : e.kind === kind)));
}
