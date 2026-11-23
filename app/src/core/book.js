// الدفتر: مصفوفة أحداث + الحالة المشتقة. كل تغيير يمر من dispatch (تحقق ← إلحاق).
import { applyEvent, buildState } from './engine.js';
import { validateEvent } from './validate.js';
import { ValidationError, newId } from './util.js';
import { DEFAULT_SOURCES } from '../config/defaults.js';

export const SEED_TS = '2000-01-01T00:00:00.000Z';

// أحداث الزرع: القوائم الافتراضية التي يملكها المستخدم (المصادر) بمعرّفات ثابتة فلا تتكرر عند الدمج.
// المكتبات الكبيرة (الأدوية، التحاليل، القواعد) ليست مزروعة: تعيش في config/catalog وتُعدَّل بكيانات فوقها.
export function seedEvents() {
  return DEFAULT_SOURCES.map((item) => ({ id: `seed-source-${item.id}`, ts: SEED_TS, type: 'entity.upsert', data: { kind: 'source', item } }));
}

export class Book {
  constructor(events = []) {
    this.events = events.slice();
    this.state = buildState(this.events);
  }

  static seeded() {
    return new Book(seedEvents());
  }

  make(type, data, { now = new Date(), id = null } = {}) {
    return { id: id || newId('e'), ts: typeof now === 'string' ? now : now.toISOString(), type, data };
  }

  dispatch(type, data, opts) {
    const ev = this.make(type, data, opts);
    validateEvent(this.state, ev);
    this.events.push(ev);
    applyEvent(this.state, ev);
    return ev;
  }

  // مجموعة أحداث ككتلة واحدة: إما كلها أو لا شيء.
  dispatchAll(list, opts) {
    const start = this.events.length;
    try {
      return list.map(([type, data]) => this.dispatch(type, data, opts));
    } catch (e) {
      this.events.length = start;
      this.state = buildState(this.events);
      throw e;
    }
  }

  fork() {
    return new Book(this.events);
  }

  // الحقول undefined تتحول null: «امسح القيمة» لازم يفضل صحيح بعد النسخ الاحتياطي (JSON يحذف undefined).
  upsert(kind, item, opts) {
    const it = { id: item.id || newId(kind.replace(/[^a-z]/g, '').slice(0, 3) + '_') };
    for (const [k, v] of Object.entries(item)) if (k !== 'id') it[k] = v === undefined ? null : v;
    this.dispatch('entity.upsert', { kind, item: it }, opts);
    return it;
  }

  addEntry(entry, opts) {
    const e = { ...entry, id: entry.id || newId('n') };
    this.dispatch('entry.add', { entry: e }, opts);
    return e;
  }

  voidEntry(entryId, reason, date, opts) {
    return this.dispatch('entry.void', { entryId, reason: reason || '', date: date || null }, opts);
  }

  // التعديل = إلغاء القيد القديم + قيد جديد يشير إليه (سجل تدقيق كامل).
  replaceEntry(oldId, entry, reason, date, opts) {
    const old = this.state.entryById.get(oldId);
    if (!old) throw new ValidationError('القيد غير موجود');
    const e = { ...entry, id: newId('n'), replaces: oldId };
    this.dispatchAll(
      [
        ['entry.void', { entryId: oldId, reason: reason || 'تعديل', date: date || null, replacedBy: e.id }],
        ['entry.add', { entry: e }],
      ],
      opts,
    );
    return e;
  }
}
