// كل قواعد القبول/الرفض قبل إضافة أي حدث (رسائل عربية). قواعد كل نوع في kinds.js.
import { ENTITY_KINDS, ENTRY_KINDS } from './kinds.js';
import { entity } from './state.js';
import { builtinOf } from './catalog.js';
import { check, isDate, isId, nonEmpty } from './util.js';

export function validateEvent(state, ev) {
  check(ev && typeof ev.type === 'string' && typeof ev.id === 'string', 'حدث غير صالح');
  const d = ev.data || {};
  switch (ev.type) {
    case 'entity.upsert': {
      const def = ENTITY_KINDS[d.kind];
      check(def, `نوع غير معروف: ${d.kind}`);
      check(d.item && isId(d.item.id), 'معرّف غير صالح');
      const own = entity(state, d.kind, d.item.id);
      const base = builtinOf(d.kind, d.item.id);
      const prev = base || own ? { ...(base || {}), ...(own || {}) } : null;
      // التعديل الجزئي (أرشفة مثلاً) يُتحقق منه مع الحقول القديمة. تعديلات القوائم الافتراضية تُدمج مع الأصل في catalog.js.
      if (d.item.archived !== true || !prev) def.validate?.(state, { ...(prev || {}), ...d.item }, prev);
      return;
    }
    case 'entry.add': {
      const e = d.entry;
      check(e && isId(e.id), 'معرّف القيد غير صالح');
      check(!state.entryById.has(e.id), 'القيد موجود من قبل');
      const def = ENTRY_KINDS[e.kind];
      check(def, `نوع قيد غير معروف: ${e.kind}`);
      check(isDate(e.date), 'التاريخ غير صالح');
      if (e.note !== undefined) check(typeof e.note === 'string' && e.note.length <= 2000, 'الملاحظة طويلة جداً');
      if (e.replaces) {
        const old = state.entryById.get(e.replaces);
        check(old && old.voided && old.voided.replacedBy === e.id, 'التعديل يجب أن يلغي القيد القديم أولاً');
      }
      def.validate(state, e);
      return;
    }
    case 'entry.void': {
      const e = state.entryById.get(d.entryId);
      check(e, 'القيد غير موجود');
      check(!e.voided, 'القيد ملغى من قبل');
      check(d.date === undefined || d.date === null || isDate(d.date), 'تاريخ الإلغاء غير صالح');
      if (e.kind === 'med.start') {
        // إلغاء بداية دواء له تعديلات/إيقاف سارية يترك قيوداً يتيمة: الغِ التعديلات أولاً (التعديل = استبدال يُستثنى).
        const others = (state.byPatient.get(e.patientId) || []).filter((x) => !x.voided && x.medId === e.medId && x.id !== e.id && x.kind !== 'med.start');
        check(!others.length || d.replacedBy, 'الدواء ده عليه تعديلات أو إيقاف — الغِها الأول');
      }
      return;
    }
    case 'settings.set':
      check(nonEmpty(d.key), 'إعداد غير صالح');
      return;
    default:
      throw new Error(`نوع حدث غير معروف: ${ev.type}`);
  }
}
