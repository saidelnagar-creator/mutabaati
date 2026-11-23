// المزيد: الإعدادات، القفل، مصادر المرضى، فترات المتابعة الدورية، قائمة التحاليل ومداها المرجعي، عن التطبيق والدليل.
import { h, clear } from '../dom.js';
import { ctx, F } from '../ctx.js';
import { badge, card, checkbox, chips, confirmDialog, empty, errorBox, field, intInput, kv, list, numInput, openSheet, row, sectionTitle, selectInput, textInput, toast } from '../components.js';
import { saveButton } from '../forms-common.js';
import { sources } from '../forms-patient.js';
import { makePinRecord } from '../pin.js';
import { APP_VERSION, APP_NAME } from '../../config/version.js';
import { RULES } from '../../config/rules.js';
import { DEFAULT_SETTINGS } from '../../config/defaults.js';
import { TARGET_PROFILES, SCREENING } from '../../config/catalog/care.js';
import { LAB_CATEGORIES } from '../../config/catalog/labs.js';
import { labTestsMap, labTest } from '../../core/catalog.js';
import { monthsFor, monthsAltFor } from '../../core/followup.js';
import { refFor } from '../../core/labs.js';
import { SCHEMA_VERSION } from '../../core/migrations/index.js';
import { normalizeDigits, plainNum } from '../../core/num.js';
import { ValidationError } from '../../core/util.js';

export function moreScreen() {
  const items = [
    ['💾 النسخ الاحتياطي', '#/backup', 'Drive مشفر، تصدير بالصور أو من غيرها، استرجاع'],
    ['📊 التقارير', '#/reports', 'المرضى، التحاليل، تصدير Excel'],
    ['⏳ المنتظر', '#/tasks', 'المواعيد والنتائج المنتظرة لكل المرضى'],
    ['⚠️ القواعد والتنبيهات', '#/rules', 'تعديل الأرقام والنصوص، قفل، إضافة'],
    ['🧪 التحاليل', '#/labs-catalog', 'الوحدات والمدى المرجعي وإضافة تحاليل'],
    ['🗓️ المتابعات الدورية', '#/screening', 'فترات HbA1c والعين والقدم والكلى…'],
    ['📍 مصادر المرضى', '#/sources', 'المعهد، معارف البلد، …'],
    ['⚙️ الإعدادات', '#/settings', 'القفل، الأرقام، ICD-10، لغة التعليمات، الأهداف'],
    ['📖 الدليل', '#/help', 'الاستخدام والمراجع'],
    ['ℹ️ عن التطبيق', '#/about', `الإصدار ${APP_VERSION}`],
  ];
  return { title: 'المزيد', root: true, body: list(items.map(([t, href, s]) => row({ title: t, subtitle: s, onclick: () => ctx.nav(href) }))) };
}

const setS = (key, value) => ctx.run((b) => b.dispatch('settings.set', { key, value }));
const S = (k) => ctx.state.settings[k] ?? DEFAULT_SETTINGS[k];

function pinForm() {
  openSheet('رقم القفل', (body, close) => {
    const err = errorBox();
    const a = h('input', { type: 'password', inputMode: 'numeric', autocomplete: 'off', placeholder: '4 إلى 8 أرقام', maxLength: 8 });
    const b2 = h('input', { type: 'password', inputMode: 'numeric', autocomplete: 'off', placeholder: 'أعد الرقم', maxLength: 8 });
    body.append(
      err,
      field('الرقم الجديد', a),
      field('تأكيد الرقم', b2),
      saveButton(
        'حفظ',
        async () => {
          const pin = normalizeDigits(a.value);
          if (!/^\d{4,8}$/.test(pin)) throw new ValidationError('الرقم يجب أن يكون من 4 إلى 8 أرقام');
          if (pin !== normalizeDigits(b2.value)) throw new ValidationError('الرقمان غير متطابقين');
          await ctx.store.setMeta('pin', makePinRecord(pin));
          await ctx.store.setMeta('pinGuard', undefined);
          toast('تم تفعيل القفل');
          close();
          ctx.refresh();
        },
        err,
      ),
    );
  });
}

export function settingsScreen() {
  const digits = selectInput([{ value: 'latin', label: '123 (أرقام إنجليزية)' }, { value: 'arab', label: '١٢٣ (أرقام عربية)' }], S('digits'));
  digits.addEventListener('change', () => setS('digits', digits.value));
  const icd = checkbox('إظهار أكواد ICD-10 جنب التشخيصات', S('showIcd') !== false);
  icd.input.addEventListener('change', () => setS('showIcd', icd.input.checked));
  const dialect = selectInput([{ value: 'egy', label: 'عامية مصرية' }, { value: 'msa', label: 'فصحى مبسطة' }], S('dialect'));
  dialect.addEventListener('change', () => setS('dialect', dialect.value));
  const targets = selectInput(TARGET_PROFILES.filter((t) => ['standard', 'tight'].includes(t.id)).map((t) => ({ value: t.id, label: `${t.ar} (HbA1c < ${t.a1c})` })), S('defaultTargets'));
  targets.addEventListener('change', () => setS('defaultTargets', targets.value));
  const labAge = intInput(String(S('labMaxAgeDays')));
  labAge.addEventListener('change', () => Number.isInteger(labAge.int()) && labAge.int() >= 30 && setS('labMaxAgeDays', labAge.int()));
  const doctor = textInput(ctx.state.settings.doctorName || '', 'Dr. …');
  doctor.dir = 'ltr';
  doctor.addEventListener('change', () => setS('doctorName', doctor.value.trim()));
  const clinic = textInput(ctx.state.settings.clinicName || '', 'Clinic / Department');
  clinic.dir = 'ltr';
  clinic.addEventListener('change', () => setS('clinicName', clinic.value.trim()));
  const days = intInput(String(ctx.state.settings.backupReminderDays ?? RULES.backupReminderDays));
  days.addEventListener('change', () => Number.isInteger(days.int()) && setS('backupReminderDays', days.int()));
  return {
    title: 'الإعدادات',
    body: h(
      'div',
      {},
      sectionTitle('القفل'),
      card(
        kv('رقم القفل', ctx.store.meta.pin ? 'مفعّل' : 'غير مفعّل', ctx.store.meta.pin ? 'pos' : 'neg'),
        h('p', { class: 'muted small', text: `يُطلب عند الفتح وبعد ${RULES.pinLockMinutes} دقيقة في الخلفية. فعّل كمان رمز الدخول و Face ID على الموبايل.` }),
        h(
          'div',
          { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn primary', text: ctx.store.meta.pin ? 'تغيير الرقم' : 'تفعيل القفل', onclick: pinForm }),
          ctx.store.meta.pin
            ? h('button', {
                type: 'button',
                class: 'btn',
                text: 'إلغاء القفل',
                onclick: async () => {
                  if (!(await confirmDialog({ title: 'إلغاء القفل', message: 'التطبيق هيفتح من غير رقم. بيانات المرضى حساسة.', okText: 'إلغاء القفل', danger: true }))) return;
                  await ctx.store.setMeta('pin', undefined);
                  ctx.refresh();
                },
              })
            : null,
        ),
      ),
      sectionTitle('العرض والتقارير'),
      field('شكل الأرقام', digits),
      field('اسم الطبيب في رأس التقرير', doctor),
      field('العيادة/القسم في رأس التقرير', clinic),
      icd,
      field('لغة ورقة تعليمات المريض (الافتراضي)', dialect, 'تقدر تختار التانية وقت الطباعة'),
      field('أهداف السكر الافتراضية', targets, 'كبار السن والحمل بيتحددوا تلقائياً، وكل مريض ممكن له أهداف خاصة'),
      field('أقدم نتيجة تحليل تُستخدم في التنبيهات (يوم)', labAge, 'أقدم من كده = تعتبر غير متاحة وتطلع «متابعة»'),
      field('تذكير النسخة الاحتياطية بعد (يوم)', days, '0 = إيقاف'),
    ),
  };
}

export function sourcesScreen() {
  const all = sources();
  const body = h('div', {});
  body.append(list(all.map((s) => row({ title: s.name, onclick: () => sourceForm(s) }))), h('p', { class: 'muted small', text: 'الحذف بيخفي المصدر من القوائم بس؛ المرضى المسجلين عليه بيفضلوا.' }));
  return { title: 'مصادر المرضى', body, fab: { label: 'مصدر', onclick: () => sourceForm(null) } };
}
function sourceForm(s) {
  openSheet(s ? 'تعديل المصدر' : 'مصدر جديد', (body, close) => {
    const err = errorBox();
    const name = textInput(s?.name || '');
    const order = intInput(String(s?.order ?? 50));
    body.append(
      err,
      field('الاسم', name),
      field('الترتيب', order),
      saveButton('حفظ', async () => (await ctx.run((b) => b.upsert('source', { ...(s ? { id: s.id } : {}), name: name.value.trim(), order: Number.isInteger(order.int()) ? order.int() : 50 })), close()), err),
      s ? h('button', { type: 'button', class: 'btn block danger', style: { marginTop: '8px' }, text: 'إخفاء', onclick: async () => (await ctx.run((b) => b.upsert('source', { id: s.id, archived: true })), close()) }) : null,
    );
  });
}

export function screeningScreen() {
  const body = h('div', {});
  body.append(h('p', { class: 'muted small', text: 'فترات المتابعة الدورية (بالشهور) حسب ADA 2026. الفترة البديلة بتنطبق تلقائياً في حالتها (مثلاً HbA1c كل 3 شهور لو فوق الهدف).' }));
  for (const it of SCREENING) {
    const m = intInput(String(monthsFor(ctx.state, it)));
    const alt = it.monthsAlt ? intInput(String(monthsAltFor(ctx.state, it))) : null;
    const off = checkbox('إيقاف البند ده', !!ctx.state.settings[`screen.${it.id}.off`]);
    m.addEventListener('change', () => Number.isInteger(m.int()) && m.int() > 0 && setS(`screen.${it.id}`, m.int()));
    alt?.addEventListener('change', () => Number.isInteger(alt.int()) && alt.int() > 0 && setS(`screen.${it.id}.alt`, alt.int()));
    off.input.addEventListener('change', () => setS(`screen.${it.id}.off`, off.input.checked));
    body.append(card(h('b', { text: it.title }), h('div', { class: 'muted small', text: it.note }), h('div', { class: 'grid2' }, field('كل (شهر)', m), alt ? field('البديلة (شهر)', alt) : h('span', {})), off));
  }
  return { title: 'المتابعات الدورية', body };
}

const labF = { q: '' };
export function labsCatalogScreen() {
  const body = h('div', {});
  const search = h('input', { class: 'search', type: 'search', placeholder: 'ابحث عن تحليل…', value: labF.q });
  const box = h('div', {});
  const render = () => {
    clear(box);
    const q = labF.q.trim().toLowerCase();
    const all = [...labTestsMap(ctx.state).values()].filter((t) => !q || `${t.abbr} ${t.name} ${t.id}`.toLowerCase().includes(q));
    for (const [cat, label] of Object.entries(LAB_CATEGORIES)) {
      const ts = all.filter((t) => t.cat === cat);
      if (!ts.length) continue;
      box.append(sectionTitle(label), list(ts.map((t) => row({ title: `${t.abbr} — ${t.name}`, dir: 'ltr', subtitle: t.text ? 'نتيجة وصفية' : `${t.unit}${(t.units || []).length ? ` (+ ${t.units.map((u) => u.u).join('، ')})` : ''} • المرجع: ${refLabel(t)}`, badge: t.hidden ? badge('مخفي', '') : t.custom ? badge('مضاف', 'info') : t.edited ? badge('معدّل', 'info') : null, onclick: () => labTestForm(t) }))));
    }
  };
  search.addEventListener('input', () => ((labF.q = search.value), render()));
  body.append(search, box);
  render();
  return { title: 'التحاليل', body, fab: { label: 'تحليل', onclick: () => labTestForm(null) } };
}
const refLabel = (t) => {
  if (!t.ref) return '—';
  if (t.ref.M) return `ذ ${t.ref.M.lo}–${t.ref.M.hi} / أ ${t.ref.F.lo}–${t.ref.F.hi}`;
  return `${t.ref.lo ?? ''}–${t.ref.hi ?? ''}`;
};

function labTestForm(t) {
  openSheet(t ? `${t.abbr}` : 'تحليل جديد', (body, close) => {
    const err = errorBox();
    const name = textInput(t?.name || '');
    name.dir = 'ltr';
    const abbr = textInput(t?.abbr || '');
    abbr.dir = 'ltr';
    const unit = textInput(t?.unit || '');
    unit.dir = 'ltr';
    const cat = selectInput(Object.entries(LAB_CATEGORIES).map(([v, l]) => ({ value: v, label: l })), t?.cat || 'other');
    const sexSpecific = !!t?.ref?.M;
    const rM = sexSpecific ? t.ref.M : t?.ref || {};
    const rF = sexSpecific ? t.ref.F : t?.ref || {};
    const loM = numInput(rM.lo ?? null);
    const hiM = numInput(rM.hi ?? null);
    const loF = numInput(rF.lo ?? null);
    const hiF = numInput(rF.hi ?? null);
    const split = checkbox('مدى مختلف للذكر والأنثى', sexSpecific);
    const fBox = h('div', { class: 'grid2' }, field('أنثى: من', loF), field('إلى', hiF));
    const sync = () => (fBox.style.display = split.input.checked ? '' : 'none');
    split.input.addEventListener('change', sync);
    sync();
    const dp = intInput(String(t?.dp ?? 1));
    const hidden = checkbox('إخفاء من القوائم', !!t?.hidden);
    body.append(
      err,
      t && !t.custom ? h('p', { class: 'muted small', text: 'المدى المرجعي بيختلف من معمل لمعمل — عدّله على معملك. الوحدات البديلة والتحويل ثابتين.' }) : null,
      field('الاسم', name),
      h('div', { class: 'grid2' }, field('الاختصار', abbr), field('الوحدة', unit)),
      field('المجموعة', cat),
      split,
      h('div', { class: 'grid2' }, field(split.input.checked ? 'ذكر: من' : 'المدى: من', loM), field('إلى', hiM)),
      fBox,
      field('خانات عشرية في العرض', dp),
      t ? hidden : null,
      saveButton(
        'حفظ',
        async () => {
          const nums = [loM, hiM, loF, hiF].map((e) => e.num());
          if (nums.some((x) => Number.isNaN(x))) throw new ValidationError('المدى لازم أرقام');
          const R = (lo, hi) => ({ lo, hi });
          const ref = split.input.checked ? { M: R(nums[0], nums[1]), F: R(nums[2], nums[3]) } : nums[0] === null && nums[1] === null ? null : R(nums[0], nums[1]);
          const data = { ...(t ? { id: t.id } : {}), name: name.value.trim(), abbr: abbr.value.trim() || name.value.trim(), ref, dp: Number.isInteger(dp.int()) ? dp.int() : 1, cat: cat.value, archived: hidden.input.checked || undefined };
          if (!t || t.custom) Object.assign(data, { unit: unit.value.trim(), units: t?.units || [] });
          await ctx.run((b) => b.upsert('lab.test', data));
          toast('تم الحفظ');
          close();
        },
        err,
      ),
    );
    if (t && !t.custom) unit.disabled = true;
  });
}

export function aboutScreen() {
  const s = ctx.store;
  return {
    title: 'عن التطبيق',
    body: h(
      'div',
      {},
      card(kv('التطبيق', APP_NAME), kv('الإصدار', APP_VERSION), kv('إصدار هيكل البيانات', String(SCHEMA_VERSION)), kv('عدد الأحداث في السجل', F.int(s.events.length)), kv('المرضى', F.int(ctx.state.entities.get('patient')?.size || 0))),
      h('p', { class: 'muted small', text: 'البيانات على الموبايل ده بس (IndexedDB)، ومفيش أي خادم. الكود على GitHub من غير أي بيانات. التنبيهات والاقتراحات أداة مساعدة للطبيب مبنية على الإرشادات المذكورة في كل قاعدة — القرار الطبي للطبيب.' }),
    ),
  };
}

export function helpScreen() {
  const sec = (t, items) => [sectionTitle(t), card(h('ul', { class: 'flag-list' }, items.map((x) => h('li', { text: x }))))];
  return {
    title: 'الدليل',
    body: h(
      'div',
      {},
      ...sec('البداية', ['المرضى ← «مريض جديد»: الاسم والنوع والسن (تاريخ ميلاد أو السن بس) والمصدر ومصدر معرفته بيك.', 'بداية المتابعة: «بيبدأ دلوقتي»، أو تاريخ، أو شهر، أو سنة، أو «من حوالي…»، أو «مش فاكر». وقت التسجيل بيتسجل لوحده.', 'نوع السكر وتاريخ التشخيص (مدة المرض) منفصلين عن بداية متابعته معاك.']),
      ...sec('في كل متابعة', ['«متابعة»: الشكوى (بتشوف الشكوى اللي فاتت وتختار زي ما هي/أحسن/أسوأ)، القياسات، التقييم والخطة.', 'في نفس النموذج: ميعاد المتابعة الجاية، التحاليل المنتظرة وميعاد نتيجتها، والأسئلة اللي هتسألها المرة الجاية.', 'لما تدخل التحاليل المنتظرة، المتابعة المنتظرة بتتقفل لوحدها.']),
      ...sec('العلاج', ['«دواء»: دوّر بالاسم التجاري أو العلمي، أو ضيف دواء مش موجود. اختار التركيز ثم المواعيد والكمية (قبل الأكل/مع الأكل…).', '«علاج كان بياخده»: للعلاج اللي قبل متابعتك (التاريخ ممكن يكون مش معروف).', 'تعديل الجرعة وإيقاف الدواء بيتسجلوا بتاريخهم وسببهم، وتقدر تشوف كل التاريخ في «سجل تعديلات العلاج».', 'قبل حفظ أي دواء بتظهر التنبيهات المتوقعة مع بيانات المريض (الكلى، الكبد، الحمل، السن، HF…).']),
      ...sec('التنبيهات', ['كل تنبيه معاه السبب والبديل والمرجع.', '«تمت المراجعة» يخفي التنبيه للمريض ده مع ملاحظتك.', 'من المزيد ← القواعد: تعدّل أي رقم (مثلاً حد eGFR) أو نص أو تقفل القاعدة أو تضيف قاعدة جديدة.', 'التنبيهات مش بتشتغل من غير بيانات حديثة: نتيجة أقدم من سنة (قابلة للتعديل) بتعتبر غير متاحة.']),
      ...sec('النسخ الاحتياطي', ['كل نسخة مشفرة بكلمة سر إجباري. من غير كلمة السر النسخة مش هتتفتح — احفظها في مكان آمن.', 'Google Drive: رفع تلقائي بعد كل تغيير. الصور اختياري (ملف منفصل).', 'تصدير ملف يدوي: بالصور أو من غيرها.']),
      ...sec('المراجع الأساسية', ['ADA Standards of Care in Diabetes 2026', 'KDIGO 2022 Diabetes in CKD و KDIGO 2024 CKD', 'AASLD 2023 و EASL-EASD-EASO 2024 (MASLD)', 'International Consensus on Time in Range 2019', 'AGS Beers Criteria 2023', 'نشرات الأدوية (FDA/EMA)']),
    ),
  };
}
