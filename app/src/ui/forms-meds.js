// نماذج العلاج: بدء دواء (من المكتبة بالعلمي أو التجاري أو دواء جديد)، تعديل الجرعة، الإيقاف — مع معاينة التنبيهات قبل الحفظ.
import { h, clear } from './dom.js';
import { ctx } from './ctx.js';
import { checkbox, dateInput, errorBox, field, openSheet, segmented, selectInput, textInput, toast } from './components.js';
import { saveButton } from './forms-common.js';
import { doseBuilder, levelBadge, pickDrug } from './widgets.js';
import { classesOf, generic } from '../core/catalog.js';
import { patientContext } from '../core/patient.js';
import { previewAlertsForMed } from '../core/alerts.js';
import { STOP_REASONS, doseText, medTitle } from '../core/meds.js';
import { newId, ValidationError } from '../core/util.js';

// صندوق التنبيهات المتوقعة لدواء قبل حفظه.
function alertsPreview(patient, getMed) {
  const box = h('div', { class: 'alerts-preview' });
  box.refresh = () => {
    clear(box);
    let med;
    try {
      med = getMed();
    } catch {
      return;
    }
    if (!med) return;
    const ctxP = patientContext(ctx.state, patient.id, ctx.today());
    const alerts = previewAlertsForMed(ctx.state, ctxP, med).filter((a) => a.level !== 'info' || a.medId);
    if (!alerts.length) {
      box.append(h('div', { class: 'banner ok small', text: '✓ مفيش تنبيهات على الدواء ده مع بيانات المريض الحالية' }));
      return;
    }
    for (const a of alerts) box.append(h('div', { class: `alert-card ${a.level}` }, h('div', { class: 'alert-head' }, levelBadge(a.level), h('b', { text: a.title })), h('div', { text: a.msg }), a.suggest ? h('div', { class: 'muted small', text: `البديل: ${a.suggest}` }) : null));
  };
  return box;
}

export async function startMedForm(patient, { prior = false } = {}) {
  const drug = await pickDrug();
  if (!drug) return;
  openSheet(prior ? 'علاج كان بياخده' : 'دواء جديد', (body, close) => {
    const err = errorBox();
    const g = generic(ctx.state, drug.g[0]);
    const medId = newId('m');
    const head = h('div', { class: 'card' }, h('div', { class: 'title', dir: 'ltr', text: medTitle({ drug }) }), h('div', { class: 'muted small', dir: 'ltr', text: drug.g.map((x) => generic(ctx.state, x)?.name).join(' + ') }), g?.notes?.renal ? h('div', { class: 'muted small', text: `الكلى: ${g.notes.renal}` }) : null);
    const isPrior = checkbox('كان بياخده قبل متابعته معايا', prior);
    const date = dateInput();
    const precision = segmented(
      [
        { value: 'day', label: 'تاريخ محدد' },
        { value: 'unknown', label: 'مش معروف' },
      ],
      prior ? 'unknown' : 'day',
      () => syncDate(),
    );
    const dateField = field('تاريخ البداية', date);
    const syncDate = () => (dateField.style.display = precision.value === 'unknown' ? 'none' : '');
    syncDate();
    const dose = doseBuilder(null, drug);
    const reason = textInput('', prior ? 'وصفه مين / ليه (اختياري)' : 'سبب البدء (اختياري)');
    const indication = textInput('', 'لعلاج إيه؟ (مثلاً: غثيان من الـ GLP-1)');
    const preview = alertsPreview(patient, () => ({ medId, drug, classes: classesOf(ctx.state, drug.g), dose: dose.read() }));
    body.append(err, head, isPrior, field('دقة التاريخ', precision), dateField, field('الجرعة', dose), field('الاستخدام', indication), field('السبب', reason), h('div', { class: 'section-title' }, h('span', { text: 'التنبيهات المتوقعة' }), h('button', { type: 'button', class: 'btn small', text: 'تحديث', onclick: () => preview.refresh() })), preview);
    preview.refresh();
    body.append(
      saveButton(
        'حفظ الدواء',
        async () => {
          const d = dose.read();
          const unknown = precision.value === 'unknown';
          await ctx.run((b) => b.addEntry({ kind: 'med.start', patientId: patient.id, medId, date: unknown ? patient.followStart?.p === 'day' ? patient.followStart.v : ctx.today() : date.value, datePrecision: unknown ? 'unknown' : 'day', drug: { ...(drug.productId ? { productId: drug.productId } : {}), g: drug.g, name: drug.name, ...(drug.s ? { s: drug.s } : {}), form: drug.form }, dose: d, prior: isPrior.input.checked || undefined, reason: reason.value.trim() || undefined, indication: indication.value.trim() || undefined }));
          toast('تم حفظ الدواء');
          close();
        },
        err,
      ),
    );
  });
}

export function changeMedForm(patient, med) {
  openSheet(`تعديل جرعة: ${medTitle(med)}`, (body, close) => {
    const err = errorBox();
    const date = dateInput();
    const dose = doseBuilder(med.dose, { ...med.drug, unit: med.dose?.slots?.[0]?.unit });
    const reason = textInput('', 'سبب التعديل (مثلاً: صايم عالي، هبوط، تحسن…)');
    const preview = alertsPreview(patient, () => ({ ...med, medId: med.medId, dose: dose.read() }));
    body.append(err, h('div', { class: 'card small' }, h('span', { class: 'muted', text: 'الجرعة الحالية: ' }), h('span', { text: doseText(ctx.state, med) })), field('تاريخ التعديل', date), field('الجرعة الجديدة', dose), field('السبب', reason), h('div', { class: 'section-title' }, h('span', { text: 'التنبيهات' }), h('button', { type: 'button', class: 'btn small', text: 'تحديث', onclick: () => preview.refresh() })), preview);
    preview.refresh();
    body.append(
      saveButton(
        'حفظ التعديل',
        async () => {
          await ctx.run((b) => b.addEntry({ kind: 'med.change', patientId: patient.id, medId: med.medId, date: date.value, dose: dose.read(), reason: reason.value.trim() || undefined }));
          toast('تم تعديل الجرعة');
          close();
        },
        err,
      ),
    );
  });
}

export function stopMedForm(patient, med) {
  openSheet(`إيقاف: ${medTitle(med)}`, (body, close) => {
    const err = errorBox();
    const date = dateInput();
    const code = selectInput(
      Object.entries(STOP_REASONS).map(([v, l]) => ({ value: v, label: l })),
      '',
      { placeholder: 'اختار السبب…' },
    );
    const reason = textInput('', 'تفاصيل (مثلاً: إسهال مستمر)');
    body.append(
      err,
      field('تاريخ الإيقاف', date),
      field('السبب', code),
      field('تفاصيل', reason),
      saveButton(
        'إيقاف الدواء',
        async () => {
          if (!code.value) throw new ValidationError('اختار سبب الإيقاف');
          await ctx.run((b) => b.addEntry({ kind: 'med.stop', patientId: patient.id, medId: med.medId, date: date.value, reasonCode: code.value, reason: [STOP_REASONS[code.value], reason.value.trim()].filter(Boolean).join(': ') }));
          toast('تم إيقاف الدواء');
          close();
        },
        err,
        { cls: 'danger' },
      ),
    );
  });
}
