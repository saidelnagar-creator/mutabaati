// نماذج: المريض، الحالات المصاحبة، المهام المنتظرة، الملاحظات.
import { h, clear } from './dom.js';
import { ctx } from './ctx.js';
import { checkbox, confirmDialog, dateInput, errorBox, field, intInput, numInput, openSheet, segmented, selectInput, textArea, textInput, toast } from './components.js';
import { saveButton, commitEntry } from './forms-common.js';
import { fuzzyDateInput, collator, pickTest } from './widgets.js';
import { DM_TYPES, T1_STAGES, CONDITIONS, CONDITION_GROUPS } from '../config/catalog/conditions.js';
import { TARGET_PROFILES } from '../config/catalog/care.js';
import { listEntities } from '../core/state.js';
import { labTest } from '../core/catalog.js';
import { TASK_TYPES } from '../core/followup.js';
import { normalizeDigits } from '../core/num.js';
import { ValidationError } from '../core/util.js';

export const sources = () => listEntities(ctx.state, 'source').sort((a, b) => (a.order ?? 50) - (b.order ?? 50) || collator.compare(a.name, b.name));

// ---------- المريض ----------
export function patientForm(item = null, { onSaved = null } = {}) {
  openSheet(item ? 'تعديل بيانات المريض' : 'مريض جديد', (body, close) => {
    const err = errorBox();
    const name = textInput(item?.name || '', 'الاسم الكامل');
    const sex = segmented(
      [
        { value: 'M', label: 'ذكر' },
        { value: 'F', label: 'أنثى' },
      ],
      item?.sex || '',
    );
    // السن: تاريخ ميلاد أو سن تقريبي
    let ageMode = item?.dob ? 'dob' : Number.isInteger(item?.birthYear) ? 'age' : 'dob';
    const dob = dateInput(item?.dob || '', { empty: true });
    const age = intInput(Number.isInteger(item?.birthYear) ? Number(ctx.today().slice(0, 4)) - item.birthYear : '');
    age.placeholder = 'السن بالسنين';
    const ageBox = h('div', {});
    const syncAge = () => {
      clear(ageBox);
      ageBox.append(ageMode === 'dob' ? dob : age);
    };
    const ageSeg = segmented(
      [
        { value: 'dob', label: 'تاريخ الميلاد' },
        { value: 'age', label: 'السن بس' },
      ],
      ageMode,
      (v) => {
        ageMode = v;
        syncAge();
      },
    );
    syncAge();
    const phone = textInput(item?.phone || '', '01xxxxxxxxx');
    phone.type = 'tel';
    phone.dir = 'ltr';
    const address = textInput(item?.address || '', 'البلد / العنوان');
    const srcs = sources();
    const source = selectInput(
      srcs.map((s) => ({ value: s.id, label: s.name })),
      item?.sourceId || srcs[0]?.id || '',
    );
    const referral = textInput(item?.referral || '', 'مثال: عن طريق فلان / قريب مريض آخر');
    const followStart = fuzzyDateInput(item?.followStart || null, { allowNow: !item, label: 'بداية المتابعة' });
    const dmType = selectInput(
      DM_TYPES.map((t) => ({ value: t.id, label: `${t.ar} — ${t.label}` })),
      item?.dm?.type || 'T2',
    );
    const t1Stage = selectInput(
      T1_STAGES.map((t) => ({ value: t.id, label: t.label })),
      item?.dm?.t1Stage || '',
      { placeholder: '—' },
    );
    const t1Field = field('مرحلة النوع الأول', t1Stage);
    const syncT1 = () => (t1Field.style.display = dmType.value === 'T1' ? '' : 'none');
    dmType.addEventListener('change', syncT1);
    syncT1();
    const dmSince = fuzzyDateInput(item?.dm?.since || { p: 'unknown' }, { label: 'تاريخ تشخيص السكر' });
    const height = numInput(item?.height ?? null, { placeholder: 'سم' });
    const chief = textArea(item?.chief || '', 'الشكوى عند بداية المتابعة');
    const note = textArea(item?.note || '');
    const status = selectInput(
      [
        { value: 'active', label: 'متابع حالياً' },
        { value: 'inactive', label: 'انقطع عن المتابعة' },
        { value: 'transferred', label: 'اتحوّل لطبيب آخر' },
        { value: 'deceased', label: 'توفي' },
      ],
      item?.status || 'active',
    );
    const target = selectInput(
      [{ value: '', label: 'تلقائي حسب السن/الحمل' }, ...TARGET_PROFILES.map((t) => ({ value: t.id, label: t.ar }))],
      item?.targetProfile || '',
    );
    const a1cTarget = numInput(item?.targets?.a1c ?? null, { placeholder: 'من المجموعة' });
    body.append(
      err,
      field('الاسم', name),
      field('النوع', sex),
      field('السن', h('div', {}, ageSeg, ageBox)),
      field('رقم التليفون', phone),
      field('العنوان / البلد', address),
      field('المصدر', source, 'القائمة تتعدل من: المزيد ← مصادر المرضى'),
      field('مصدر معرفته بيا', referral),
      field('بداية المتابعة معايا', followStart, item ? '' : 'وقت التسجيل بيتسجل لوحده'),
      h('div', { class: 'section-title' }, h('span', { text: 'التصنيف' })),
      field('نوع السكر', dmType),
      t1Field,
      field('تاريخ التشخيص (مدة المرض)', dmSince),
      field('الطول', height),
      field('الشكوى الأساسية', chief),
      h('details', { class: 'more' }, h('summary', { text: 'أهداف العلاج وحالة المتابعة' }), field('مجموعة الأهداف', target, 'المقترح تلقائياً: عادي، كبير سن (65+)، أو حمل'), field('هدف HbA1c خاص (%)', a1cTarget, 'سيبه فاضي لاستخدام هدف المجموعة'), field('حالة المتابعة', status)),
      field('ملاحظات', note),
      saveButton(
        'حفظ',
        async () => {
          if (!sex.value) throw new ValidationError('اختار النوع (ذكر/أنثى)');
          const data = { ...(item ? { id: item.id } : {}), name: name.value.trim(), sex: sex.value, phone: normalizeDigits(phone.value).replace(/[^\d+]/g, '') || undefined, address: address.value.trim() || undefined, sourceId: source.value || undefined, referral: referral.value.trim() || undefined, followStart: followStart.read(), dm: { type: dmType.value, since: dmSince.read(), ...(dmType.value === 'T1' && t1Stage.value ? { t1Stage: t1Stage.value } : {}) }, chief: chief.value.trim() || undefined, note: note.value.trim() || undefined, status: status.value, targetProfile: target.value || undefined };
          if (ageMode === 'dob') {
            data.dob = dob.value || undefined;
            data.birthYear = undefined;
          } else {
            const a = age.int();
            if (a !== null && (!Number.isInteger(a) || a < 0 || a > 120)) throw new ValidationError('السن غير صالح');
            data.birthYear = a === null ? undefined : Number(ctx.today().slice(0, 4)) - a;
            data.dob = undefined;
          }
          const hv = height.num();
          if (Number.isNaN(hv)) throw new ValidationError('الطول لازم يكون رقم');
          data.height = hv ?? undefined;
          const a1 = a1cTarget.num();
          if (Number.isNaN(a1)) throw new ValidationError('هدف HbA1c لازم يكون رقم');
          data.targets = a1 ? { ...(item?.targets || {}), a1c: a1 } : item?.targets?.a1c ? { ...item.targets, a1c: undefined } : item?.targets;
          const { result } = await ctx.run((b) => b.upsert('patient', data));
          toast('تم الحفظ');
          close();
          onSaved?.(result);
        },
        err,
      ),
    );
  });
}

// ---------- الحالات المصاحبة ----------
export function conditionForm(patient, item = null) {
  openSheet(item ? 'تعديل الحالة' : 'حالة مصاحبة / تصنيف', (body, close) => {
    const err = errorBox();
    const groups = Object.entries(CONDITION_GROUPS).map(([g, label]) => ({ group: label, options: CONDITIONS.filter((c) => c.group === g).map((c) => ({ value: c.id, label: `${c.ar} — ${c.label}` })) }));
    const code = selectInput(groups, item?.code || '', { placeholder: 'اختار…' });
    if (item) code.disabled = true;
    const since = dateInput(item?.since ?? '', { empty: true });
    const until = dateInput(item?.until ?? '', { empty: true });
    const note = textArea(item?.note || '');
    const detailsBox = h('div', {});
    let readers = [];
    const renderDetails = () => {
      clear(detailsBox);
      readers = [];
      const def = CONDITIONS.find((c) => c.id === code.value);
      if (!def) return;
      if (def.hint) detailsBox.append(h('p', { class: 'muted small', text: def.hint }));
      for (const f of def.fields || []) {
        const cur = item?.details?.[f.key];
        let el;
        if (f.type === 'select') el = selectInput(f.options.map((o) => ({ value: o.v, label: o.l })), cur ?? '', { placeholder: '—' });
        else if (f.type === 'date') el = dateInput(cur ?? '', { empty: true });
        else if (f.type === 'number') el = numInput(cur ?? null);
        else el = textInput(cur || '');
        readers.push([f, el]);
        detailsBox.append(field(f.label, el));
      }
      untilField.querySelector('label').textContent = def.endLabel || 'تاريخ الانتهاء (لو انتهت)';
    };
    const untilField = field('تاريخ الانتهاء (لو انتهت)', until);
    code.addEventListener('change', renderDetails);
    body.append(err, field('الحالة', code), detailsBox, field('من تاريخ (اختياري)', since), untilField, field('ملاحظة', note));
    renderDetails();
    body.append(
      saveButton(
        'حفظ',
        async () => {
          if (!code.value) throw new ValidationError('اختار الحالة');
          const details = {};
          for (const [f, el] of readers) {
            const v = f.type === 'number' ? el.num() : el.value;
            if (f.type === 'number' && Number.isNaN(v)) throw new ValidationError(`${f.label}: لازم رقم`);
            if (v !== '' && v !== null) details[f.key] = v;
          }
          await ctx.run((b) => b.upsert('condition', { ...(item ? { id: item.id } : {}), patientId: patient.id, code: code.value, since: since.value || undefined, until: until.value || undefined, details, note: note.value.trim() || undefined }));
          toast('تم الحفظ');
          close();
        },
        err,
      ),
      item
        ? h('button', {
            type: 'button',
            class: 'btn block danger',
            style: { marginTop: '8px' },
            text: 'حذف من القائمة (تسجيل خطأ)',
            onclick: async () => {
              if (!(await confirmDialog({ title: 'حذف الحالة؟', message: 'لو الحالة انتهت (ولادة، شفاء) استخدم «تاريخ الانتهاء» بدل الحذف عشان التاريخ يفضل محفوظ.', okText: 'حذف', danger: true }))) return;
              await ctx.run((b) => b.upsert('condition', { id: item.id, archived: true }));
              close();
            },
          })
        : null,
    );
  });
}

// ---------- المهام المنتظرة ----------
export function taskForm(patient = null, item = null, { type = null } = {}) {
  openSheet(item ? 'تعديل' : 'متابعة منتظرة', (body, close) => {
    const err = errorBox();
    const kind = selectInput(
      Object.entries(TASK_TYPES).map(([v, l]) => ({ value: v, label: l })),
      item?.type || type || 'lab',
    );
    const title = textInput(item?.title || '', 'مثال: نتيجة فحص العين / اسأله عن التنميل');
    const due = dateInput(item?.due ?? '', { empty: true });
    const note = textArea(item?.note || '');
    let tests = (item?.tests || []).slice();
    const testsBox = h('div', { class: 'chips' });
    const renderTests = () => {
      clear(testsBox);
      for (const t of tests) testsBox.append(h('button', { type: 'button', class: 'chip on', text: `${labTest(ctx.state, t)?.abbr || t} ✕`, onclick: () => ((tests = tests.filter((x) => x !== t)), renderTests()) }));
      testsBox.append(
        h('button', {
          type: 'button',
          class: 'chip',
          text: '+ تحليل',
          onclick: async () => {
            const id = await pickTest({ exclude: tests });
            if (id) tests.push(id);
            renderTests();
          },
        }),
      );
    };
    renderTests();
    const testsField = field('التحاليل المنتظرة', testsBox);
    const sync = () => (testsField.style.display = kind.value === 'lab' ? '' : 'none');
    kind.addEventListener('change', sync);
    sync();
    body.append(err, field('النوع', kind), testsField, field('المطلوب', title), field('الميعاد المتوقع', due, 'ميعاد النتيجة أو المتابعة'), field('ملاحظة', note));
    body.append(
      saveButton(
        'حفظ',
        async () => {
          await ctx.run((b) => b.upsert('task', { ...(item ? { id: item.id } : {}), patientId: patient?.id || item?.patientId || undefined, type: kind.value, title: title.value.trim() || undefined, tests: kind.value === 'lab' ? tests : undefined, due: due.value || undefined, note: note.value.trim() || undefined, status: item?.status || 'open', created: item?.created || ctx.today() }));
          toast('تم الحفظ');
          close();
        },
        err,
      ),
    );
    if (item && (item.status || 'open') === 'open')
      body.append(
        h(
          'div',
          { class: 'btn-row', style: { marginTop: '8px' } },
          h('button', { type: 'button', class: 'btn', text: '✓ تم', onclick: async () => (await finishTask(item, 'done'), close()) }),
          h('button', { type: 'button', class: 'btn danger', text: 'إلغاء المتابعة', onclick: async () => (await finishTask(item, 'cancelled'), close()) }),
        ),
      );
  });
}
export async function finishTask(t, status = 'done') {
  const result = status === 'done' && t.type !== 'visit' ? await confirmDialog({ title: 'تم', okText: 'حفظ', input: { label: 'النتيجة / ملاحظة (اختياري)', value: '' } }) : true;
  if (result === false) return;
  await ctx.run((b) => b.upsert('task', { id: t.id, status, doneDate: ctx.today(), ...(typeof result === 'string' ? { resultNote: result } : {}) }));
  toast(status === 'done' ? 'تم' : 'اتلغت');
}

// ---------- ملاحظة ----------
export function noteForm(patient, old = null) {
  openSheet(old ? 'تعديل ملاحظة' : 'ملاحظة', (body, close) => {
    const err = errorBox();
    const date = dateInput(old?.date);
    const text = textArea(old?.text || '', '', 5);
    body.append(
      err,
      field('التاريخ', date),
      field('الملاحظة', text),
      saveButton(
        'حفظ',
        async () => {
          await commitEntry({ kind: 'note', patientId: patient.id, date: date.value, text: text.value.trim() }, old);
          close();
        },
        err,
      ),
    );
  });
}

export const yesNo = (label, v) => checkbox(label, !!v);
