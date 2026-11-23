// أدوات نماذج مشتركة: الحفظ الآمن من الضغط المزدوج، إلغاء/تعديل قيد بسبب مكتوب.
import { h } from './dom.js';
import { ctx } from './ctx.js';
import { confirmDialog, toast } from './components.js';

// حفظ بزر واحد: يمنع الضغط المزدوج ويعرض الخطأ بالعربية.
export function saveButton(label, fn, err, { cls = 'primary' } = {}) {
  const btn = h('button', { type: 'button', class: `btn ${cls} block`, text: label });
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    err.show('');
    try {
      await fn();
    } catch (e) {
      console.warn(e);
      err.show(e.message || String(e));
    } finally {
      btn.disabled = false;
    }
  });
  return btn;
}

// إضافة قيد أو تعديله (التعديل = إلغاء + قيد جديد بسبب مكتوب). extra: أحداث إضافية في نفس الكتلة (b) => void.
export async function commitEntry(entry, old = null, extra = null) {
  if (old) {
    const reason = await confirmDialog({ title: 'سبب التعديل', okText: 'حفظ التعديل', input: { label: 'السبب (يظهر في سجل التعديلات)', value: 'تصحيح' } });
    if (!reason) return null;
    return (
      await ctx.run((b) => {
        const e = b.replaceEntry(old.id, entry, reason === true ? 'تعديل' : reason, ctx.today());
        extra?.(b, e);
        return e;
      })
    ).result;
  }
  return (
    await ctx.run((b) => {
      const e = b.addEntry(entry);
      extra?.(b, e);
      return e;
    })
  ).result;
}

export async function voidEntryFlow(e, what = 'القيد') {
  const reason = await confirmDialog({ title: `إلغاء ${what}`, message: 'الإلغاء لا يمسح شيئاً: يبقى في السجل مشطوباً ولا يدخل أي حساب أو تقرير.', okText: 'إلغاء', danger: true, input: { label: 'السبب', required: true, requiredMessage: 'اكتب سبب الإلغاء' } });
  if (!reason) return false;
  await ctx.run((b) => b.voidEntry(e.id, reason, ctx.today()));
  toast('تم الإلغاء');
  return true;
}

// شريط أزرار «تعديل / إلغاء» لقيد.
export function entryActions(e, onEdit, what) {
  if (e.voided) return null;
  return h('div', { class: 'btn-row' }, onEdit ? h('button', { type: 'button', class: 'btn small', text: 'تعديل', onclick: onEdit }) : null, h('button', { type: 'button', class: 'btn small danger', text: 'إلغاء', onclick: () => voidEntryFlow(e, what) }));
}
