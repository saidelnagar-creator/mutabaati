// نماذج سريرية: المتابعة (زيارة)، التحاليل، قراءات السكر، CGM، الهبوط، الفحوصات، الصور.
import { h, clear } from './dom.js';
import { ctx, F } from './ctx.js';
import { checkbox, chips, dateInput, errorBox, field, intInput, numInput, openSheet, segmented, selectInput, textArea, textInput, toast } from './components.js';
import { saveButton, commitEntry } from './forms-common.js';
import { pickTest } from './widgets.js';
import { VISIT_TYPES } from '../core/kinds.js';
import { labPanels, labTest } from '../core/catalog.js';
import { openTasks, tasksCoveredByLabs, lastVisit } from '../core/followup.js';
import { latestVitals } from '../core/patient.js';
import { EXAMS, HYPO_CAUSES, HYPO_LEVELS, SMBG_SLOTS } from '../config/catalog/care.js';
import { RULES } from '../config/rules.js';
import { addDays, newId, ValidationError } from '../core/util.js';
import { normalizeDigits, plainNum } from '../core/num.js';

const numOrThrow = (el, label) => {
  const v = el.num();
  if (Number.isNaN(v)) throw new ValidationError(`${label}: لازم رقم`);
  return v;
};

// ---------- المتابعة (زيارة) ----------
const COMPLAINT_STATUS = [
  { value: 'same', label: 'زي ما هي' },
  { value: 'better', label: 'أحسن' },
  { value: 'worse', label: 'أسوأ' },
  { value: 'resolved', label: 'خلصت' },
  { value: 'new', label: 'شكوى جديدة' },
];

export function visitForm(patient, old = null) {
  openSheet(old ? 'تعديل المتابعة' : 'متابعة جديدة', (body, close) => {
    const err = errorBox();
    const prev = lastVisit(ctx.state, patient.id);
    const vit = latestVitals(ctx.state, patient.id);
    const date = dateInput(old?.date);
    const vtype = selectInput(
      Object.entries(VISIT_TYPES).map(([v, l]) => ({ value: v, label: l })),
      old?.vtype || ctx.state.settings.lastVisitType || 'clinic',
    );
    const prevComplaint = (old ? null : prev?.complaint) || (old ? null : patient.chief);
    const cStatus = segmented(COMPLAINT_STATUS, old?.complaintStatus || (prevComplaint ? 'same' : 'new'));
    const complaint = textArea(old?.complaint ?? '', 'الشكوى الحالية / التحديث', 3);
    const v = old?.vitals || {};
    const weight = numInput(v.weight ?? null, { placeholder: vit.weight ? `آخر: ${plainNum(vit.weight.v)}` : 'كجم' });
    const waist = numInput(v.waist ?? null, { placeholder: 'سم' });
    const sbp = numInput(v.sbp ?? null, { placeholder: 'انقباضي' });
    const dbp = numInput(v.dbp ?? null, { placeholder: 'انبساطي' });
    const hr = numInput(v.hr ?? null, { placeholder: 'نبض' });
    const rbg = numInput(v.rbg ?? null, { placeholder: 'mg/dL' });
    const glucoseNote = textArea(old?.glucoseNote || '', 'ملخص قراءات البيت / الهبوط', 2);
    const adherence = textInput(old?.adherence || '', 'الالتزام بالعلاج والأكل');
    const exam = textArea(old?.exam || '', 'الفحص', 2);
    const assessment = textArea(old?.assessment || '', 'التقييم', 2);
    const plan = textArea(old?.plan || '', 'الخطة', 3);
    const note = textArea(old?.note || '');
    // المتابعة الجاية والمنتظر
    const nextDue = dateInput('', { empty: true });
    const quick = chips(
      [
        { value: 14, label: 'أسبوعين' },
        { value: 30, label: 'شهر' },
        { value: 60, label: 'شهرين' },
        { value: 90, label: '3 شهور' },
      ],
      null,
      (d) => (nextDue.value = addDays(date.value || ctx.today(), d)),
    );
    let labTests = [];
    const labBox = h('div', { class: 'chips' });
    const labDue = dateInput('', { empty: true });
    const renderLab = () => {
      clear(labBox);
      for (const t of labTests) labBox.append(h('button', { type: 'button', class: 'chip on', text: `${labTest(ctx.state, t)?.abbr} ✕`, onclick: () => ((labTests = labTests.filter((x) => x !== t)), renderLab()) }));
      labBox.append(h('button', { type: 'button', class: 'chip', text: '+ تحليل', onclick: async () => ((await pickTest({ exclude: labTests }).then((id) => id && labTests.push(id))), renderLab()) }));
      for (const p of labPanels(ctx.state).slice(0, 5)) labBox.append(h('button', { type: 'button', class: 'chip ghost', text: `+ ${p.name}`, onclick: () => ((labTests = [...new Set([...labTests, ...p.tests.filter((t) => !['rbg', 'ppg2'].includes(t))])]), renderLab()) }));
    };
    renderLab();
    const ask = textArea('', 'كل سؤال في سطر', 2);
    const openAsk = old ? [] : openTasks(ctx.state, { patientId: patient.id, today: ctx.today() }).filter((t) => t.type !== 'visit');
    body.append(
      err,
      openAsk.length ? h('div', { class: 'banner info' }, h('div', {}, h('b', { text: 'منتظر من المتابعة اللي فاتت:' }), h('ul', { class: 'flag-list' }, openAsk.map((t) => h('li', { text: t.type === 'lab' ? `تحاليل: ${(t.tests || []).map((x) => labTest(ctx.state, x)?.abbr).join('، ')}` : t.title || '' }))))) : null,
      h('div', { class: 'grid2' }, field('التاريخ', date), field('النوع', vtype)),
      prevComplaint ? h('div', { class: 'card small' }, h('div', { class: 'muted small', text: 'الشكوى السابقة:' }), h('div', { text: prevComplaint })) : null,
      field('حالة الشكوى', cStatus),
      field('الشكوى', complaint),
      h('div', { class: 'section-title' }, h('span', { text: 'القياسات' })),
      h('div', { class: 'grid3' }, field('الوزن', weight), field('الوسط', waist), field('سكر عشوائي', rbg)),
      h('div', { class: 'grid3' }, field('الضغط', sbp), field('/', dbp), field('النبض', hr)),
      field('قراءات البيت والهبوط', glucoseNote),
      field('الالتزام', adherence),
      field('الفحص', exam),
      field('التقييم', assessment),
      field('الخطة', plan, 'تعديل العلاج نفسه من تبويب «العلاج» عشان يتسجل بتاريخه وتطلع تنبيهاته'),
      old ? null : h('div', { class: 'section-title' }, h('span', { text: 'المتابعة الجاية' })),
      old ? null : field('ميعاد المتابعة الجاية', h('div', {}, quick, nextDue)),
      old ? null : field('تحاليل منتظرة', labBox),
      old ? null : field('ميعاد النتيجة المتوقع', labDue),
      old ? null : field('أسأله المرة الجاية عن', ask),
      field('ملاحظة', note),
      saveButton(
        'حفظ المتابعة',
        async () => {
          const vitals = {};
          for (const [k, el, label] of [
            ['weight', weight, 'الوزن'],
            ['waist', waist, 'الوسط'],
            ['sbp', sbp, 'الضغط'],
            ['dbp', dbp, 'الضغط'],
            ['hr', hr, 'النبض'],
            ['rbg', rbg, 'السكر'],
          ]) {
            const x = numOrThrow(el, label);
            if (x !== null) vitals[k] = x;
          }
          const entry = { kind: 'visit', patientId: patient.id, date: date.value, vtype: vtype.value, complaint: complaint.value.trim() || undefined, complaintStatus: cStatus.value || undefined, vitals, glucoseNote: glucoseNote.value.trim() || undefined, adherence: adherence.value.trim() || undefined, exam: exam.value.trim() || undefined, assessment: assessment.value.trim() || undefined, plan: plan.value.trim() || undefined, note: note.value.trim() || undefined };
          if (!old && cStatus.value === 'same' && !entry.complaint && prevComplaint) entry.complaint = prevComplaint;
          const asks = ask.value
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);
          await commitEntry(entry, old, (b) => {
            if (old) return;
            // المتابعة حصلت: أي ميعاد متابعة مفتوح قبلها يتقفل
            for (const t of openTasks(b.state, { patientId: patient.id, today: date.value }).filter((t) => t.type === 'visit')) b.upsert('task', { id: t.id, status: 'done', doneDate: date.value });
            if (nextDue.value) b.upsert('task', { patientId: patient.id, type: 'visit', title: 'المتابعة الجاية', due: nextDue.value, status: 'open', created: date.value });
            if (labTests.length) b.upsert('task', { patientId: patient.id, type: 'lab', tests: labTests, due: labDue.value || nextDue.value || undefined, status: 'open', created: date.value });
            for (const q of asks) b.upsert('task', { patientId: patient.id, type: 'ask', title: q, due: nextDue.value || undefined, status: 'open', created: date.value });
          });
          if (vtype.value !== (ctx.state.settings.lastVisitType || 'clinic')) ctx.run((b) => b.dispatch('settings.set', { key: 'lastVisitType', value: vtype.value }));
          toast('تم حفظ المتابعة');
          close();
        },
        err,
      ),
    );
  });
}

// ---------- التحاليل ----------
export function labsForm(patient, old = null, { tests: initial = null } = {}) {
  openSheet(old ? 'تعديل التحاليل' : 'إدخال تحاليل', (body, close) => {
    const err = errorBox();
    const date = dateInput(old?.date);
    const labName = textInput(old?.lab || '', 'اسم المعمل (اختياري)');
    const rowsBox = h('div', { class: 'lab-rows' });
    const rows = new Map();
    const addRow = (testId, value = null, unit = null, text = null) => {
      if (rows.has(testId)) return rows.get(testId).input.focus?.();
      const t = labTest(ctx.state, testId);
      if (!t) return;
      let input;
      let unitSel = null;
      if (t.text) input = t.options ? selectInput(t.options.map((o) => ({ value: o, label: o })), text || '', { placeholder: '—' }) : textInput(text || '');
      else {
        input = numInput(value);
        unitSel = selectInput([t.unit, ...(t.units || []).map((u) => u.u)].map((u) => ({ value: u, label: u || '—' })), unit || t.unit);
        if (!(t.units || []).length) unitSel.disabled = true;
      }
      const line = h('div', { class: 'lab-row' }, h('div', { class: 'lab-name', dir: 'ltr' }, h('b', { text: t.abbr }), h('span', { class: 'muted small', text: ` ${t.name}` })), input, unitSel || h('span', {}), h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'حذف', text: '✕', onclick: () => (rows.delete(testId), line.remove()) }));
      rows.set(testId, { t, input, unitSel, line });
      rowsBox.append(line);
    };
    for (const r of old?.results || []) addRow(r.test, r.v ?? null, r.unit, r.t);
    for (const t of initial || []) addRow(t);
    const panels = h(
      'div',
      { class: 'chips' },
      labPanels(ctx.state).map((p) => h('button', { type: 'button', class: 'chip', text: p.name, onclick: () => p.tests.forEach((t) => addRow(t)) })),
    );
    const pending = old ? [] : openTasks(ctx.state, { patientId: patient.id, today: ctx.today() }).filter((t) => t.type === 'lab' && t.tests?.length);
    body.append(
      err,
      h('div', { class: 'grid2' }, field('تاريخ التحليل', date), field('المعمل', labName)),
      pending.length ? h('div', { class: 'banner info' }, h('span', { class: 'grow', text: `منتظر: ${pending.flatMap((t) => t.tests).map((x) => labTest(ctx.state, x)?.abbr).join('، ')}` }), h('button', { type: 'button', class: 'btn small', text: 'إضافتها', onclick: () => pending.flatMap((t) => t.tests).forEach((t) => addRow(t)) })) : null,
      h('div', { class: 'muted small', text: 'اختار مجموعة أو تحليل، واكتب النتيجة بالوحدة اللي في الورقة (التحويل تلقائي).' }),
      panels,
      rowsBox,
      h('button', { type: 'button', class: 'btn small', text: '+ تحليل آخر', onclick: async () => addRow(await pickTest({ exclude: [...rows.keys()] })) }),
      saveButton(
        'حفظ النتائج',
        async () => {
          const results = [];
          for (const [id, r] of rows) {
            if (r.t.text) {
              if (r.input.value) results.push({ test: id, t: r.input.value.trim() });
              continue;
            }
            const v = r.input.num();
            if (v === null) continue;
            if (Number.isNaN(v)) throw new ValidationError(`${r.t.abbr}: لازم رقم`);
            results.push({ test: id, v, ...(r.unitSel && r.unitSel.value !== r.t.unit ? { unit: r.unitSel.value } : {}) });
          }
          if (!results.length) throw new ValidationError('اكتب نتيجة واحدة على الأقل');
          const covered = old ? [] : tasksCoveredByLabs(ctx.state, patient.id, results.map((r) => r.test), date.value);
          await commitEntry({ kind: 'labs', patientId: patient.id, date: date.value, lab: labName.value.trim() || undefined, results }, old, (b) => {
            for (const c of covered) b.upsert('task', c.done ? { id: c.task.id, status: 'done', doneDate: date.value } : { id: c.task.id, tests: c.remaining });
          });
          toast(covered.some((c) => c.done) ? 'اتحفظت، واتقفلت التحاليل المنتظرة' : 'تم حفظ النتائج');
          close();
        },
        err,
      ),
    );
  });
}

// ---------- قراءات السكر المنزلية (جدول أيام × مواعيد) ----------
export function smbgForm(patient, old = null) {
  openSheet(old ? 'تعديل القراءات' : 'قراءات السكر المنزلية', (body, close) => {
    const err = errorBox();
    let unit = 'mg';
    const unitSeg = segmented(
      [
        { value: 'mg', label: 'mg/dL' },
        { value: 'mmol', label: 'mmol/L' },
      ],
      'mg',
      (v) => (unit = v),
    );
    const defaultSlots = ['fasting', 'postB', 'preL', 'postL', 'preD', 'postD', 'bed'];
    let slots = old ? SMBG_SLOTS.map((s) => s.id).filter((id) => old.days.some((d) => d.r[id] !== undefined)) : defaultSlots;
    const slotChips = chips(
      SMBG_SLOTS.map((s) => ({ value: s.id, label: s.ar })),
      slots,
      (v) => {
        slots = SMBG_SLOTS.map((s) => s.id).filter((id) => v.includes(id));
        renderGrid();
      },
      { multi: true },
    );
    const lastDay = dateInput(old ? old.days[old.days.length - 1].d : ctx.today());
    const nDays = intInput(old ? old.days.length : 7);
    const grid = h('div', { class: 'smbg-grid-wrap' });
    const cells = new Map(); // `${d}|${slot}` → input
    const keep = () => {
      const m = new Map();
      for (const [k, el] of cells) if (el.value.trim()) m.set(k, el.value);
      return m;
    };
    const renderGrid = () => {
      const kept = keep();
      cells.clear();
      clear(grid);
      const n = Math.min(Math.max(nDays.int() || 7, 1), 60);
      const days = [];
      for (let i = n - 1; i >= 0; i--) days.push(addDays(lastDay.value || ctx.today(), -i));
      const tbl = h('table', { class: 'smbg-grid' });
      tbl.append(h('thead', {}, h('tr', {}, h('th', { text: 'اليوم' }), slots.map((s) => h('th', { text: SMBG_SLOTS.find((x) => x.id === s).ar })))));
      const tb = h('tbody', {});
      for (const d of days) {
        const tr = h('tr', {}, h('th', { text: F.dateShort(d) }));
        for (const s of slots) {
          const k = `${d}|${s}`;
          const oldV = old?.days.find((x) => x.d === d)?.r[s];
          const inp = h('input', { type: 'text', inputMode: 'decimal', autocomplete: 'off', class: 'cell', value: kept.get(k) ?? (oldV !== undefined ? String(oldV) : '') });
          inp.dir = 'ltr';
          cells.set(k, inp);
          tr.append(h('td', {}, inp));
        }
        tb.append(tr);
      }
      tbl.append(tb);
      grid.append(tbl);
    };
    lastDay.addEventListener('change', renderGrid);
    nDays.addEventListener('change', renderGrid);
    renderGrid();
    body.append(
      err,
      h('div', { class: 'grid2' }, field('آخر يوم', lastDay), field('عدد الأيام', nDays)),
      field('المواعيد', slotChips),
      field('الوحدة', unitSeg),
      grid,
      saveButton(
        'حفظ القراءات',
        async () => {
          const byDay = new Map();
          for (const [k, el] of cells) {
            const raw = normalizeDigits(el.value).trim();
            if (!raw) continue;
            let v = Number(raw);
            if (!Number.isFinite(v)) throw new ValidationError(`قراءة غير صالحة: ${el.value}`);
            if (unit === 'mmol') v = Math.round(v * 18.016);
            const [d, s] = k.split('|');
            if (!byDay.has(d)) byDay.set(d, {});
            byDay.get(d)[s] = Math.round(v);
          }
          const days = [...byDay.entries()].sort().map(([d, r]) => ({ d, r }));
          if (!days.length) throw new ValidationError('اكتب قراءة واحدة على الأقل');
          await commitEntry({ kind: 'smbg', patientId: patient.id, date: days[days.length - 1].d, days }, old);
          toast('تم حفظ القراءات');
          close();
        },
        err,
      ),
    );
  }, { wide: true });
}

// ---------- تقرير CGM ----------
export function cgmForm(patient, old = null) {
  openSheet(old ? 'تعديل تقرير CGM' : 'تقرير CGM / Libre', (body, close) => {
    const err = errorBox();
    const date = dateInput(old?.date);
    const days = intInput(old?.days ?? 14);
    const device = textInput(old?.device || '', 'Libre 2 / Libre 3 / Dexcom…');
    const f = (k, ph = '%') => numInput(old?.[k] ?? null, { placeholder: ph });
    const els = { active: f('active'), mean: f('mean', 'mg/dL'), gmi: f('gmi'), cv: f('cv'), tar2: f('tar2'), tar1: f('tar1'), tir: f('tir'), tbr1: f('tbr1'), tbr2: f('tbr2'), tirTight: f('tirTight'), events: f('events', 'عدد') };
    const note = textArea(old?.note || '');
    body.append(
      err,
      h('div', { class: 'grid2' }, field('آخر يوم في التقرير', date), field('عدد الأيام', days)),
      field('الجهاز', device),
      h('div', { class: 'grid3' }, field('Active %', els.active), field('Mean glucose', els.mean), field('GMI %', els.gmi)),
      h('div', { class: 'grid3' }, field('Very high >250', els.tar2), field('High 181–250', els.tar1), field('In range 70–180', els.tir)),
      h('div', { class: 'grid3' }, field('Low 54–69', els.tbr1), field('Very low <54', els.tbr2), field('CV %', els.cv)),
      h('div', { class: 'grid2' }, field('TITR 70–140 (اختياري)', els.tirTight), field('أحداث هبوط', els.events)),
      field('ملاحظة', note),
      saveButton(
        'حفظ',
        async () => {
          const e = { kind: 'cgm', patientId: patient.id, date: date.value, days: days.int() || undefined, device: device.value.trim() || undefined, note: note.value.trim() || undefined };
          for (const [k, el] of Object.entries(els)) {
            const v = numOrThrow(el, k);
            if (v !== null) e[k] = v;
          }
          await commitEntry(e, old);
          toast('تم الحفظ');
          close();
        },
        err,
      ),
    );
  });
}

// ---------- نوبة هبوط ----------
export function hypoForm(patient, old = null) {
  openSheet(old ? 'تعديل نوبة الهبوط' : 'نوبة هبوط', (body, close) => {
    const err = errorBox();
    const date = dateInput(old?.date);
    const time = h('input', { type: 'time', value: old?.time || '' });
    const level = segmented(
      HYPO_LEVELS.map((l) => ({ value: String(l.id), label: `مستوى ${l.id}` })),
      old ? String(old.level) : '',
    );
    const value = numInput(old?.value ?? null, { placeholder: 'mg/dL' });
    const nocturnal = checkbox('أثناء النوم', !!old?.nocturnal);
    const cause = selectInput(
      Object.entries(HYPO_CAUSES).map(([v, l]) => ({ value: v, label: l })),
      old?.cause || '',
      { placeholder: '—' },
    );
    const action = textInput(old?.action || '', 'اتعالج بإيه؟ (سكر، جلوكاجون، طوارئ…)');
    const note = textArea(old?.note || '');
    body.append(
      err,
      h('p', { class: 'muted small', text: HYPO_LEVELS.map((l) => l.ar).join(' • ') }),
      h('div', { class: 'grid2' }, field('التاريخ', date), field('الوقت', time)),
      field('المستوى', level),
      field('القراءة', value),
      nocturnal,
      field('السبب', cause),
      field('التصرف', action),
      field('ملاحظة', note),
      saveButton(
        'حفظ',
        async () => {
          if (!level.value) throw new ValidationError('اختار المستوى');
          const v = numOrThrow(value, 'القراءة');
          await commitEntry({ kind: 'hypo', patientId: patient.id, date: date.value, time: time.value || undefined, level: Number(level.value), value: v ?? undefined, nocturnal: nocturnal.input.checked || undefined, cause: cause.value || undefined, action: action.value.trim() || undefined, note: note.value.trim() || undefined }, old);
          toast('تم الحفظ');
          close();
        },
        err,
      ),
    );
  });
}

// ---------- فحص (عين، قدم، إيكو…) ----------
export function examForm(patient, old = null, { exam: initial = null } = {}) {
  openSheet(old ? 'تعديل الفحص' : 'فحص', (body, close) => {
    const err = errorBox();
    const date = dateInput(old?.date);
    const exam = selectInput(
      EXAMS.map((x) => ({ value: x.id, label: x.ar })),
      old?.exam || initial || 'fundus',
    );
    const fieldsBox = h('div', {});
    let readers = [];
    const render = () => {
      clear(fieldsBox);
      readers = [];
      for (const f of EXAMS.find((x) => x.id === exam.value)?.fields || []) {
        const cur = old?.exam === exam.value ? old.result?.[f.key] : undefined;
        const el = f.type === 'select' ? selectInput(f.options.map((o) => ({ value: o.v, label: o.l })), cur ?? '', { placeholder: '—' }) : numInput(cur ?? null);
        readers.push([f, el]);
        fieldsBox.append(field(f.label, el));
      }
    };
    exam.addEventListener('change', render);
    render();
    const text = textArea(old?.text || '', 'النتيجة / التقرير', 3);
    body.append(
      err,
      h('div', { class: 'grid2' }, field('التاريخ', date), field('الفحص', exam)),
      fieldsBox,
      field('النتيجة', text),
      saveButton(
        'حفظ',
        async () => {
          const result = {};
          for (const [f, el] of readers) {
            const v = f.type === 'number' ? numOrThrow(el, f.label) : el.value;
            if (v !== '' && v !== null) result[f.key] = v;
          }
          await commitEntry({ kind: 'exam', patientId: patient.id, date: date.value, exam: exam.value, result, text: text.value.trim() || undefined }, old);
          toast('تم الحفظ');
          close();
        },
        err,
      ),
    );
  });
}

// ---------- صورة (تُضغط على الجهاز ثم تُحفظ في مخزن الصور) ----------
export const PHOTO_CATS = { lab: 'تحاليل', rx: 'روشتة', imaging: 'أشعة', report: 'تقرير', other: 'أخرى' };

async function compressImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error('تعذّر قراءة الصورة'));
      i.src = url;
    });
    const scale = Math.min(1, RULES.photoMaxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const hh = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = hh;
    canvas.getContext('2d').drawImage(img, 0, 0, w, hh);
    const data = canvas.toDataURL('image/jpeg', RULES.photoQuality);
    return { data, w, h: hh, bytes: Math.round((data.length * 3) / 4) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function photoForm(patient) {
  openSheet('إضافة صورة', (body, close) => {
    const err = errorBox();
    const file = h('input', { type: 'file', accept: 'image/*' });
    const date = dateInput();
    const cat = selectInput(
      Object.entries(PHOTO_CATS).map(([v, l]) => ({ value: v, label: l })),
      'lab',
    );
    const caption = textInput('', 'وصف (اختياري)');
    const preview = h('div', { class: 'photo-preview' });
    let compressed = null;
    file.addEventListener('change', async () => {
      clear(preview);
      compressed = null;
      const f = file.files[0];
      if (!f) return;
      try {
        compressed = await compressImage(f);
        preview.append(h('img', { src: compressed.data, alt: 'معاينة' }), h('div', { class: 'muted small', text: `${F.int(compressed.bytes / 1024)} ك.ب بعد الضغط` }));
      } catch (e) {
        err.show(e.message);
      }
    });
    body.append(
      err,
      field('الصورة', file, 'تتصور أو تتختار من الألبوم، وتتضغط تلقائياً'),
      preview,
      h('div', { class: 'grid2' }, field('التاريخ', date), field('النوع', cat)),
      field('الوصف', caption),
      saveButton(
        'حفظ',
        async () => {
          if (!compressed) throw new ValidationError('اختار صورة');
          const id = newId('f');
          await ctx.store.putFile({ id, mime: 'image/jpeg', data: compressed.data, bytes: compressed.bytes, createdAt: new Date().toISOString() });
          await ctx.run((b) => b.addEntry({ kind: 'photo', patientId: patient.id, date: date.value, fileId: id, cat: cat.value, caption: caption.value.trim() || undefined, w: compressed.w, h: compressed.h, bytes: compressed.bytes }));
          toast('تم حفظ الصورة');
          close();
        },
        err,
      ),
    );
  });
}
