// الحالة = fold(الأحداث). أربعة أنواع أحداث عامة فقط؛ أنواع الكيانات والقيود الطبية معرّفة في kinds.js
// فإضافة نوع جديد لا تحتاج نوع حدث جديداً ولا ترحيل بيانات.
//   entity.upsert  { kind, item }      إنشاء/تعديل كيان (مريض، حالة مصاحبة، مهمة، تعديل دواء/تحليل/قاعدة…) — الحقول المرسلة تحل محل القديمة
//   entry.add      { entry }           قيد بتاريخ (زيارة، تحاليل، بدء/تعديل/إيقاف دواء، قراءات سكر…) — لا يُعدَّل أبداً
//   entry.void     { entryId, reason, date, replacedBy? }   إلغاء (التعديل = إلغاء + قيد جديد يحمل replaces)
//   settings.set   { key, value }
import { emptyState, entitiesW } from './state.js';

export { emptyState, entities, entity, listEntities, activeEntries, patientEntries } from './state.js';

export function applyEvent(state, ev) {
  const d = ev.data || {};
  switch (ev.type) {
    case 'entity.upsert': {
      const m = entitiesW(state, d.kind);
      const prev = m.get(d.item.id);
      m.set(d.item.id, { ...(prev || {}), ...d.item, createdAt: prev?.createdAt || ev.ts, updatedAt: ev.ts });
      break;
    }
    case 'entry.add': {
      const e = { ...d.entry, ts: ev.ts, voided: null };
      state.entries.push(e);
      state.entryById.set(e.id, e);
      if (e.patientId) {
        let list = state.byPatient.get(e.patientId);
        if (!list) state.byPatient.set(e.patientId, (list = []));
        list.push(e);
      }
      break;
    }
    case 'entry.void': {
      const e = state.entryById.get(d.entryId);
      if (e) e.voided = { reason: d.reason || '', date: d.date || null, ts: ev.ts, replacedBy: d.replacedBy || null };
      break;
    }
    case 'settings.set':
      state.settings[d.key] = d.value;
      break;
    default:
      throw new Error(`نوع حدث غير معروف: ${ev.type}`);
  }
  state.version++;
}

export function buildState(events) {
  const s = emptyState();
  for (const ev of events) applyEvent(s, ev);
  return s;
}
