// ملف المريض: ملخص، متابعات، تحاليل (مقارنة ورسم)، علاج (خط زمني)، السكر (قراءات/CGM/هبوط)، التصنيف والحالات،
// المنتظر والمتابعات الدورية، الصور، والسجل الكامل.
import { h, clear, icon } from '../dom.js';
import { ctx, F } from '../ctx.js';
import { badge, card, chips, confirmDialog, empty, kv, list, openSheet, row, sectionTitle, stat, table, toast } from '../components.js';
import { entryActions, voidEntryFlow } from '../forms-common.js';
import { ageText, dmShort, fuzzyText, icd, levelBadge, patientSubtitle, sexText, sourceName } from '../widgets.js';
import { patientForm, conditionForm, taskForm, finishTask, noteForm } from '../forms-patient.js';
import { visitForm, labsForm, smbgForm, cgmForm, hypoForm, examForm, photoForm, PHOTO_CATS } from '../forms-clinical.js';
import { startMedForm, changeMedForm, stopMedForm } from '../forms-meds.js';
import { lineChart } from '../chart.js';
import { entity, patientEntries } from '../../core/state.js';
import { describeEntry, VISIT_TYPES } from '../../core/kinds.js';
import { patientContext, patientConditions, durationText, followStartDate, dmSinceDate, gestationalWeeks } from '../../core/patient.js';
import { evaluateAlerts } from '../../core/alerts.js';
import { medList, doseText, mealOf, mealText, genericNames, medTitle, isActiveOn, amountsByGeneric, changeDirection } from '../../core/meds.js';
import { compareTable, refFor, refText, flagOf, labResults, derivedByDate } from '../../core/labs.js';
import { labTest, generic } from '../../core/catalog.js';
import { screeningFor, openTasks, TASK_TYPES, lastVisit } from '../../core/followup.js';
import { smbgReadings, smbgStats, cgmReports, cgmEvaluate, cgmGmi, tbrTotal, tarTotal, hypoEvents } from '../../core/glucose.js';
import { bmiClass, fib4Risk, KDIGO_RISK_AR } from '../../core/calc.js';
import { LEVELS } from '../../config/catalog/alerts.js';
import { DERIVED, LAB_CATEGORIES } from '../../config/catalog/labs.js';
import { EXAMS, HYPO_CAUSES, SMBG_SLOTS } from '../../config/catalog/care.js';
import { DIABETES_TYPES, CONDITION_GROUPS, DM_TYPES } from '../../config/catalog/conditions.js';
import { addDays, cmp } from '../../core/util.js';
import { plainNum } from '../../core/num.js';

const TABS = [
  ['summary', 'ملخص'],
  ['visits', 'المتابعات'],
  ['labs', 'التحاليل'],
  ['meds', 'العلاج'],
  ['glucose', 'السكر'],
  ['dx', 'التصنيف'],
  ['pending', 'المنتظر'],
  ['photos', 'الصور'],
  ['log', 'السجل'],
];

const STATUS_AR = { active: 'متابع', inactive: 'منقطع', transferred: 'اتحوّل', deceased: 'توفي' };

export function patientScreen({ id, tab = 'summary' }) {
  const p = entity(ctx.state, 'patient', id);
  if (!p) return { title: 'غير موجود', body: empty('المريض غير موجود') };
  const today = ctx.today();
  const c = patientContext(ctx.state, id, today);
  const alerts = evaluateAlerts(ctx.state, c);
  const body = h('div', {});
  body.append(headerCard(p, c, alerts));
  body.append(
    h(
      'div',
      { class: 'tabs-scroll' },
      chips(
        TABS.map(([v, l]) => ({ value: v, label: v === 'summary' && alerts.filter((a) => !a.ack && LEVELS[a.level].order <= 3).length ? `${l} ⚠︎` : l })),
        tab,
        (v) => ctx.nav(`#/patient/${id}/${v}`),
      ),
    ),
  );
  const T = { summary: summaryTab, visits: visitsTab, labs: labsTab, meds: medsTab, glucose: glucoseTab, dx: dxTab, pending: pendingTab, photos: photosTab, log: logTab }[tab] || summaryTab;
  body.append(T(p, c, alerts));
  return { title: p.name, subtitle: patientSubtitle(p), body, fab: fabFor(tab, p) };
}

function fabFor(tab, p) {
  const m = {
    summary: ['متابعة', () => visitForm(p)],
    visits: ['متابعة', () => visitForm(p)],
    labs: ['تحاليل', () => labsForm(p)],
    meds: ['دواء', () => startMedForm(p)],
    glucose: ['قراءات', () => smbgForm(p)],
    dx: ['حالة', () => conditionForm(p)],
    pending: ['منتظر', () => taskForm(p)],
    photos: ['صورة', () => photoForm(p)],
    log: ['ملاحظة', () => noteForm(p)],
  }[tab];
  return m ? { label: m[0], onclick: m[1] } : null;
}

function headerCard(p, c, alerts) {
  const fs = followStartDate(p);
  const ds = dmSinceDate(p);
  const conds = patientConditions(ctx.state, p.id, { date: ctx.today() });
  const tags = [];
  if (c.pregnant) tags.push(badge(`حامل${c.pregnancyWeeks !== null ? ` ${F.int(c.pregnancyWeeks)} أسبوع` : ''}`, 'warn'));
  for (const x of conds.filter((x) => x.code !== 'pregnancy').slice(0, 6)) tags.push(badge(x.def.ar, x.def.group === 'risk' ? 'warn' : ''));
  if (c.gStage && (c.f.egfr < 60 || c.f.uacr >= 30)) tags.push(badge(`CKD ${c.gStage}${c.aStage ? '/' + c.aStage : ''}`, 'bad'));
  if (p.status && p.status !== 'active') tags.push(badge(STATUS_AR[p.status], ''));
  const urgent = alerts.filter((a) => !a.ack && LEVELS[a.level].order <= 1).length;
  return h(
    'div',
    { class: 'card patient-head' },
    h(
      'div',
      { class: 'ph-top' },
      h('div', { class: 'grow' }, h('div', { class: 'ph-name', text: p.name }), h('div', { class: 'muted small', text: [ageText(p), sexText(p.sex), sourceName(p.sourceId) + (p.referral ? ` (${p.referral})` : '')].filter(Boolean).join(' · ') })),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'تعديل البيانات', onclick: () => patientForm(p) }, icon('edit')),
    ),
    h('div', { class: 'ph-lines small' }, h('div', { text: `${dmShort(p) || 'التصنيف غير محدد'}${p.dm?.since && p.dm.since.p !== 'unknown' ? ` منذ ${fuzzyText(p.dm.since)}${ds ? ` (${durationText(ds, ctx.today())})` : ''}` : ''}` }), h('div', { class: 'muted', text: `المتابعة معايا: ${fuzzyText(p.followStart)}${fs ? ` — ${durationText(fs, ctx.today())}` : ''} • التسجيل: ${F.date(p.createdAt?.slice(0, 10))}` })),
    tags.length ? h('div', { class: 'tags' }, tags) : null,
    h(
      'div',
      { class: 'btn-row compact' },
      p.phone ? h('a', { class: 'btn small', href: `tel:${p.phone}` }, icon('phone', 16), ' اتصال') : null,
      p.phone ? h('a', { class: 'btn small', href: `whatsapp://send?phone=${p.phone.replace(/^0/, '20')}` }, 'واتساب') : null,
      h('button', { type: 'button', class: 'btn small', onclick: () => ctx.nav(`#/report/${p.id}`) }, icon('print', 16), ' تقرير'),
      urgent ? h('button', { type: 'button', class: 'btn small danger', text: `⚠︎ ${F.int(urgent)} تنبيه مهم`, onclick: () => ctx.nav(`#/patient/${p.id}/summary`) }) : null,
    ),
  );
}

// ---------------- الملخص ----------------
function a1cClass(v, target) {
  if (v === undefined || v === null) return '';
  if (!target) return '';
  return v <= target ? 'pos' : v <= target + 1 ? 'warnv' : 'neg';
}

function summaryTab(p, c, alerts) {
  const out = h('div', {});
  const t = c.targets;
  const lastA1c = labResults(ctx.state, p.id).filter((r) => r.test === 'a1c').pop();
  out.append(
    h(
      'div',
      { class: 'stats' },
      stat('HbA1c', lastA1c ? `${F.num(lastA1c.v, 1)}%` : '—', { hint: lastA1c ? `${F.date(lastA1c.date)}${t.a1c ? ` • الهدف < ${F.num(t.a1c, 1)}` : ''}` : t.a1c ? `الهدف < ${F.num(t.a1c, 1)}` : '', valueClass: a1cClass(lastA1c?.v, t.a1c), onclick: () => ctx.nav(`#/patient/${p.id}/labs`) }),
      stat('eGFR', c.egfr ? F.int(c.egfr.v) : '—', { hint: c.egfr ? `${c.gStage} • ${F.date(c.egfr.date)}${c.f.egfr === undefined ? ' (قديم)' : ''}` : 'مفيش كرياتينين', valueClass: c.egfr && c.egfr.v < 60 ? 'neg' : '' }),
      stat('UACR', c.uacr ? F.int(c.uacr.v) : '—', { hint: c.uacr ? `${c.aStage} • ${F.date(c.uacr.date)}` : '', valueClass: c.uacr && c.uacr.v >= 30 ? 'neg' : '' }),
      stat('BMI', c.bmi ? F.num(c.bmi, 1) : '—', { hint: c.bmi ? `${bmiClass(c.bmi).ar} • ${F.num(c.weight, 1)} كجم` : c.weight ? `${F.num(c.weight, 1)} كجم (الطول ناقص)` : '' }),
      stat('الضغط', c.vitals.sbp ? `${F.int(c.vitals.sbp.v)}/${F.int(c.vitals.dbp?.v)}` : '—', { hint: c.vitals.sbp ? F.date(c.vitals.sbp.date) : '', valueClass: c.vitals.sbp && (c.vitals.sbp.v >= 130 || c.vitals.dbp?.v >= 80) ? 'neg' : '' }),
      stat('LDL', c.f.ldl !== undefined ? F.int(c.f.ldl) : '—', { hint: c.d.ldl ? F.date(c.d.ldl) : '' }),
    ),
  );
  if (c.kdigo) out.append(h('div', { class: `banner ${c.kdigo === 'low' ? 'ok' : c.kdigo === 'moderate' ? 'info' : 'bad'} small`, text: `KDIGO: ${c.gStage}/${c.aStage} — ${KDIGO_RISK_AR[c.kdigo]}` }));
  if (c.fib4) {
    const r = fib4Risk(c.fib4.v, c.age);
    out.append(h('div', { class: `banner ${r?.cls || ''} small`, text: `FIB-4 ${F.num(c.fib4.v, 2)} (${F.date(c.fib4.date)}): ${r?.ar || ''}` }));
  }
  // التنبيهات
  const active = alerts.filter((a) => !a.ack);
  const acked = alerts.filter((a) => a.ack);
  out.append(sectionTitle(`التنبيهات والاقتراحات (${F.int(active.length)})`, h('button', { type: 'button', class: 'btn small', text: 'القواعد', onclick: () => ctx.nav('#/rules') })));
  if (!active.length) out.append(empty('مفيش تنبيهات — بناءً على البيانات المسجلة'));
  for (const a of active) out.append(alertCard(p, a));
  if (acked.length) out.append(h('details', { class: 'more' }, h('summary', { text: `تمت مراجعتها (${F.int(acked.length)})` }), acked.map((a) => alertCard(p, a))));
  // العلاج الحالي
  const meds = c.meds;
  out.append(sectionTitle('العلاج الحالي', h('button', { type: 'button', class: 'btn small', text: 'إدارة', onclick: () => ctx.nav(`#/patient/${p.id}/meds`) })));
  out.append(meds.length ? list(meds.map((m) => row({ title: medTitle(m), dir: 'auto', subtitle: doseText(ctx.state, m), onclick: () => medSheet(p, m) }))) : empty('مفيش علاج مسجل'));
  if (c.insulin) out.append(h('div', { class: 'muted small', text: `الإنسولين: إجمالي ${F.num(c.insulin.tdd, 1)} وحدة/يوم، قاعدي ${F.num(c.insulin.basal, 1)}${c.weight ? ` (${F.num(c.insulin.tdd / c.weight, 2)} و/كجم، قاعدي ${F.num(c.insulin.basal / c.weight, 2)} و/كجم)` : ''}` }));
  // المنتظر
  const tasks = openTasks(ctx.state, { patientId: p.id, today: ctx.today() });
  out.append(sectionTitle('المنتظر', h('button', { type: 'button', class: 'btn small', text: '+', onclick: () => taskForm(p) })));
  out.append(tasks.length ? list(tasks.slice(0, 6).map((t) => taskRow(t))) : empty('مفيش حاجة منتظرة'));
  // المتابعات الدورية
  const scr = screeningFor(ctx.state, c, ctx.today()).filter((s) => s.status !== 'ok');
  if (scr.length) {
    out.append(sectionTitle('متابعات دورية مستحقة'));
    out.append(list(scr.map((s) => screenRow(p, s))));
  }
  // آخر متابعة
  const lv = lastVisit(ctx.state, p.id);
  if (lv) {
    out.append(sectionTitle('آخر متابعة'));
    out.append(visitCard(p, lv));
  }
  out.append(
    h(
      'div',
      { class: 'grid-btns', style: { marginTop: '12px' } },
      h('button', { type: 'button', class: 'btn', text: '+ متابعة', onclick: () => visitForm(p) }),
      h('button', { type: 'button', class: 'btn', text: '+ تحاليل', onclick: () => labsForm(p) }),
      h('button', { type: 'button', class: 'btn', text: '+ دواء', onclick: () => startMedForm(p) }),
      h('button', { type: 'button', class: 'btn', text: '+ قراءات سكر', onclick: () => smbgForm(p) }),
    ),
  );
  return out;
}

function alertCard(p, a) {
  return h(
    'div',
    { class: `alert-card ${a.level} ${a.ack ? 'acked' : ''}` },
    h('div', { class: 'alert-head' }, levelBadge(a.level), h('b', { text: a.title })),
    a.medTitle ? h('div', { class: 'muted small', dir: 'auto', text: a.medTitle }) : null,
    h('div', { text: a.msg }),
    a.suggest ? h('div', { class: 'suggest', text: `↩︎ ${a.suggest}` }) : null,
    h('div', { class: 'ref', dir: 'ltr', text: a.ref }),
    a.ack ? h('div', { class: 'muted small', text: `اتراجع: ${a.ack.note || ''} (${F.date(a.ack.updatedAt?.slice(0, 10))})` }) : null,
    h(
      'div',
      { class: 'btn-row compact' },
      a.ack
        ? h('button', { type: 'button', class: 'btn small', text: 'رجّع التنبيه', onclick: () => ctx.run((b) => b.upsert('alert.ack', { id: a.ack.id, archived: true })) })
        : h('button', {
            type: 'button',
            class: 'btn small',
            text: 'تمت المراجعة',
            onclick: async () => {
              const note = await confirmDialog({ title: 'مراجعة التنبيه', message: 'التنبيه هيتخفي لهذا المريض (ويفضل محفوظ تحت «تمت مراجعتها»).', okText: 'حفظ', input: { label: 'ملاحظة (مثلاً: مقصود لأن…)', value: '' } });
              if (note === false) return;
              await ctx.run((b) => b.upsert('alert.ack', { patientId: p.id, ruleId: a.ruleId, medId: a.medId || undefined, note: typeof note === 'string' ? note : undefined }));
            },
          }),
      h('button', { type: 'button', class: 'btn small', text: 'تعديل القاعدة', onclick: () => ctx.nav(`#/rule/${a.ruleId}`) }),
    ),
  );
}

function taskRow(t) {
  const title = t.type === 'lab' ? `تحاليل: ${(t.tests || []).map((x) => labTest(ctx.state, x)?.abbr).join('، ')}${t.title ? ` — ${t.title}` : ''}` : t.title || TASK_TYPES[t.type];
  const lv = { overdue: ['متأخر', 'bad'], today: ['النهارده', 'warn'], upcoming: ['قادم', 'info'], nodate: ['بدون ميعاد', ''] }[t.level];
  return row({ title, subtitle: `${TASK_TYPES[t.type]}${t.due ? ` • ${F.date(t.due)}` : ''}${t.note ? ` • ${t.note}` : ''}`, badge: badge(lv[0], lv[1]), onclick: () => taskForm(null, t) });
}

function screenRow(p, s) {
  const st = { overdue: ['متأخر', 'bad'], never: ['لم يُسجل', 'warn'], soon: ['قريب', 'info'], ok: ['تمام', 'ok'] }[s.status];
  return row({
    title: s.item.title,
    subtitle: `${s.last ? `آخر مرة ${F.date(s.last)}` : 'مفيش تسجيل'} • كل ${F.int(s.months)} شهر${s.due ? ` • المستحق ${F.date(s.due)}` : ''}`,
    badge: badge(st[0], st[1]),
    onclick: () => (s.item.exam ? examForm(p, null, { exam: s.item.exam }) : labsForm(p, null, { tests: s.item.tests.slice(0, 1) })),
  });
}

// ---------------- المتابعات ----------------
function visitCard(p, v) {
  const vit = v.vitals || {};
  const vtxt = [vit.weight ? `وزن ${plainNum(vit.weight)}` : '', vit.sbp ? `ضغط ${vit.sbp}/${vit.dbp ?? '—'}` : '', vit.hr ? `نبض ${vit.hr}` : '', vit.waist ? `وسط ${plainNum(vit.waist)}` : '', vit.rbg ? `سكر ${vit.rbg}` : ''].filter(Boolean).join(' • ');
  const STAT = { same: 'زي ما هي', better: 'أحسن', worse: 'أسوأ', resolved: 'خلصت', new: 'جديدة' };
  return h(
    'div',
    { class: `card visit ${v.voided ? 'voided' : ''}` },
    h('div', { class: 'visit-head' }, h('b', { text: F.date(v.date) }), badge(VISIT_TYPES[v.vtype || 'clinic'], 'info'), v.voided ? badge('ملغاة', 'bad') : v.replaces ? badge('معدّلة', 'info') : null),
    v.complaint ? kv(`الشكوى${v.complaintStatus ? ` (${STAT[v.complaintStatus]})` : ''}`, v.complaint) : null,
    vtxt ? kv('القياسات', vtxt) : null,
    v.glucoseNote ? kv('القراءات', v.glucoseNote) : null,
    v.adherence ? kv('الالتزام', v.adherence) : null,
    v.exam ? kv('الفحص', v.exam) : null,
    v.assessment ? kv('التقييم', v.assessment) : null,
    v.plan ? kv('الخطة', v.plan) : null,
    v.note ? kv('ملاحظة', v.note) : null,
    entryActions(v, () => visitForm(p, v), 'المتابعة'),
  );
}

function visitsTab(p) {
  const out = h('div', {});
  const visits = patientEntries(ctx.state, p.id, 'visit').sort((a, b) => cmp(b.date, a.date) || cmp(b.ts, a.ts));
  if (p.chief) out.append(card(kv('الشكوى عند البداية', p.chief)));
  if (!visits.length) out.append(empty('مفيش متابعات مسجلة — اضغط «متابعة»'));
  // تطور الشكوى
  const withComplaint = visits.filter((v) => v.complaint);
  if (withComplaint.length > 1) out.append(h('details', { class: 'more' }, h('summary', { text: 'تطور الشكوى' }), list(withComplaint.map((v) => row({ title: v.complaint, subtitle: F.date(v.date) })))));
  for (const v of visits) out.append(visitCard(p, v));
  return out;
}

// ---------------- التحاليل ----------------
let labsCat = 'all';
function labsTab(p) {
  const out = h('div', {});
  const cats = [...new Set(labResults(ctx.state, p.id).map((r) => labTest(ctx.state, r.test)?.cat))].filter(Boolean);
  out.append(
    h(
      'div',
      { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn primary', text: '+ إدخال تحاليل', onclick: () => labsForm(p) }),
      h('button', { type: 'button', class: 'btn', text: '+ فحص (عين/قدم…)', onclick: () => examForm(p) }),
    ),
  );
  if (cats.length > 1)
    out.append(
      chips(
        [{ value: 'all', label: 'الكل' }, ...cats.map((x) => ({ value: x, label: LAB_CATEGORIES[x] || x }))],
        labsCat,
        (v) => {
          labsCat = v;
          ctx.refresh();
        },
      ),
    );
  const t = compareTable(ctx.state, p, { maxDates: 8, cats: labsCat === 'all' ? null : [labsCat] });
  if (!t.rows.length) out.append(empty('مفيش تحاليل مسجلة'));
  else {
    const cols = [{ label: 'التحليل' }, ...t.dates.map((d) => ({ label: F.dateShort(d), num: true }))];
    const rows = t.rows.map((r) => ({
      cells: [
        { node: h('button', { type: 'button', class: 'link', dir: 'ltr', text: `${r.test.abbr}${r.test.unit ? ` (${r.test.unit})` : ''}`, onclick: () => labTrendSheet(p, r.id) }) },
        ...r.cells.map((cell) =>
          cell ? { text: cell.t || `${F.num(cell.v, r.test.dp ?? 1)}${cell.delta ? (cell.delta > 0 ? ' ↑' : ' ↓') : ''}`, cls: cell.flag === 'H' ? 'hi' : cell.flag === 'L' ? 'lo' : '' } : '',
        ),
      ],
    }));
    const dRows = [];
    for (const d of DERIVED) {
      if (!t.derived.some((x) => x && x[d.id] !== undefined)) continue;
      dRows.push({ cls: 'derived', cells: [{ node: h('span', { dir: 'ltr', text: `${d.abbr} ⓒ` }) }, ...t.derived.map((x) => (x && x[d.id] !== undefined ? F.num(x[d.id], d.dp) : ''))] });
    }
    out.append(table(cols, [...rows, ...dRows], { cls: 'compare', dir: 'ltr' }));
    out.append(h('div', { class: 'muted small', text: 'أحمر = أعلى من المدى، أزرق = أقل. ⓒ = محسوب تلقائياً من تحاليل نفس اليوم. اضغط اسم التحليل للرسم وكل القيم.' }));
  }
  // الفحوصات غير المعملية
  const exams = patientEntries(ctx.state, p.id, 'exam').sort((a, b) => cmp(b.date, a.date));
  if (exams.length) {
    out.append(sectionTitle('الفحوصات'));
    out.append(list(exams.map((e) => row({ title: EXAMS.find((x) => x.id === e.exam)?.ar || e.exam, subtitle: `${F.date(e.date)}${examSummary(e) ? ` • ${examSummary(e)}` : ''}${e.text ? ` • ${e.text}` : ''}`, onclick: () => entrySheet(p, e) }))));
  }
  const entries = patientEntries(ctx.state, p.id, 'labs').sort((a, b) => cmp(b.date, a.date));
  if (entries.length) out.append(h('details', { class: 'more' }, h('summary', { text: `إدخالات التحاليل (${F.int(entries.length)}) — للتعديل أو الإلغاء` }), list(entries.map((e) => row({ title: F.date(e.date), subtitle: `${e.lab ? e.lab + ' • ' : ''}${e.results.map((r) => labTest(ctx.state, r.test)?.abbr).join('، ')}`, onclick: () => entrySheet(p, e) })))));
  return out;
}

function examSummary(e) {
  const def = EXAMS.find((x) => x.id === e.exam);
  return (def?.fields || [])
    .filter((f) => e.result?.[f.key] !== undefined)
    .map((f) => `${f.label}: ${f.type === 'select' ? f.options.find((o) => o.v === e.result[f.key])?.l || e.result[f.key] : plainNum(e.result[f.key])}`)
    .join('، ');
}

function labTrendSheet(p, testId) {
  const t = labTest(ctx.state, testId);
  const rs = labResults(ctx.state, p.id).filter((r) => r.test === testId);
  openSheet(`${t.abbr} — ${t.name}`, (body) => {
    const ref = refFor(t, p.sex);
    if (!t.text) body.append(lineChart({ series: [{ points: rs.map((r) => ({ x: r.date, y: r.v, cls: flagOf(t, r.v, p.sex) ? 'flag' : '' })) }], band: ref ? { lo: ref.lo, hi: ref.hi } : null, dp: t.dp ?? 1, title: t.abbr }));
    body.append(h('div', { class: 'muted small', dir: 'ltr', text: `Reference: ${refText(t, p.sex)} ${t.unit || ''}${t.note ? ' — ' + t.note : ''}` }));
    body.append(
      table(
        [{ label: 'التاريخ' }, { label: 'القيمة', num: true }, { label: 'الفرق', num: true }],
        rs
          .slice()
          .reverse()
          .map((r, i, arr) => {
            const prev = arr[i + 1];
            const d = prev && r.v !== null && prev.v !== null ? r.v - prev.v : null;
            return [F.date(r.date), { text: r.t || `${F.num(r.v, t.dp ?? 1)}${r.unit && r.unit !== t.unit ? ` (${plainNum(r.raw)} ${r.unit})` : ''}`, cls: flagOf(t, r.v, p.sex) === 'H' ? 'hi' : flagOf(t, r.v, p.sex) === 'L' ? 'lo' : '' }, d === null ? '' : `${d > 0 ? '+' : ''}${F.num(d, t.dp ?? 1)}`];
          }),
      ),
    );
  });
}

// ---------------- العلاج ----------------
function medsTab(p) {
  const out = h('div', {});
  const all = medList(ctx.state, p.id);
  const today = ctx.today();
  const active = all.filter((m) => isActiveOn(m, today));
  const stopped = all.filter((m) => !isActiveOn(m, today));
  out.append(h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn primary', text: '+ دواء جديد', onclick: () => startMedForm(p) }), h('button', { type: 'button', class: 'btn', text: '+ علاج كان بياخده', onclick: () => startMedForm(p, { prior: true }) })));
  out.append(sectionTitle(`العلاج الحالي (${F.int(active.length)})`));
  out.append(active.length ? list(active.map((m) => medRow(p, m))) : empty('مفيش علاج حالي'));
  if (stopped.length) {
    out.append(sectionTitle(`علاج سابق/متوقف (${F.int(stopped.length)})`));
    out.append(list(stopped.map((m) => medRow(p, m))));
  }
  // الخط الزمني لكل التعديلات
  const events = all.flatMap((m) => m.history.map((x, i) => ({ ...x, med: m, prevDose: i > 0 ? m.history[i - 1].dose : null }))).sort((a, b) => cmp(b.date, a.date) || cmp(b.entry.ts, a.entry.ts));
  if (events.length) {
    out.append(sectionTitle('سجل تعديلات العلاج'));
    out.append(
      list(
        events.map((ev) => {
          const label = { start: ev.med.prior && ev.kind === 'start' ? 'كان بياخد' : 'بدء', change: 'تعديل', stop: 'إيقاف' }[ev.kind];
          const dir = ev.kind === 'change' ? changeDirection(ctx.state, ev.med, ev.prevDose, ev.dose) : null;
          return row({
            title: `${label}${dir === 'up' ? ' ↑' : dir === 'down' ? ' ↓' : ''}: ${medTitle(ev.med)}`,
            subtitle: `${ev.med.datePrecision === 'unknown' && ev.kind === 'start' ? 'تاريخ غير معروف' : F.date(ev.date)}${ev.dose ? ` • ${doseText(ctx.state, ev.med, ev.dose, { withMeal: false })}` : ''}${ev.reason ? ` • ${ev.reason}` : ''}`,
            onclick: () => entrySheet(p, ev.entry),
          });
        }),
      ),
    );
  }
  return out;
}

function medRow(p, m) {
  const active = isActiveOn(m, ctx.today());
  const g = generic(ctx.state, m.drug.g[0]);
  return row({
    title: medTitle(m),
    dir: 'auto',
    subtitle: active ? doseText(ctx.state, m) : `متوقف ${F.date(m.stop?.date)}${m.stop?.reason ? ` • ${m.stop.reason}` : ''}`,
    badge: m.prior ? badge('قبل متابعتي', '') : g?.hypo ? badge('هبوط', 'warn') : null,
    onclick: () => medSheet(p, m),
  });
}

function medSheet(p, m) {
  const med = medList(ctx.state, p.id).find((x) => x.medId === m.medId);
  const active = isActiveOn(med, ctx.today());
  openSheet(medTitle(med), (body, close) => {
    const meal = mealOf(ctx.state, med);
    const am = amountsByGeneric(ctx.state, med);
    body.append(
      card(
        kv('المادة الفعالة', h('span', { dir: 'ltr', text: genericNames(ctx.state, med) })),
        kv('الجرعة', active ? doseText(ctx.state, med, med.dose, { withMeal: false }) : 'متوقف'),
        kv('العلاقة بالأكل', `${mealText(meal.meal, meal.mealMin) || '—'}${meal.note ? ` (${meal.note})` : ''}`),
        [...am.entries()].filter(([, a]) => a.day !== null).length ? kv('الإجمالي', [...am.entries()].filter(([, a]) => a.day !== null).map(([gid, a]) => `${generic(ctx.state, gid)?.name}: ${plainNum(Math.round(a.day * 100) / 100)} ${a.unit}/يوم${med.dose?.freq === 'weekly' ? ` (${plainNum(a.week)} /أسبوع)` : ''}`).join(' • ')) : null,
        kv('البداية', med.datePrecision === 'unknown' ? 'غير معروفة' : F.date(med.startDate)),
        med.prior ? kv('ملاحظة', 'كان بياخده قبل متابعته معايا') : null,
        med.start.indication ? kv('الاستخدام', med.start.indication) : null,
      ),
      active ? h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn primary', text: 'تعديل الجرعة', onclick: () => (close(), changeMedForm(p, med)) }), h('button', { type: 'button', class: 'btn danger', text: 'إيقاف', onclick: () => (close(), stopMedForm(p, med)) })) : null,
      sectionTitle('التاريخ'),
      list(med.history.map((x) => row({ title: `${{ start: 'بدء', change: 'تعديل', stop: 'إيقاف' }[x.kind]} • ${x.kind === 'start' && med.datePrecision === 'unknown' ? 'تاريخ غير معروف' : F.date(x.date)}`, subtitle: [x.dose ? doseText(ctx.state, med, x.dose, { withMeal: false }) : '', x.reason].filter(Boolean).join(' • '), onclick: () => entrySheet(p, x.entry) }))),
      drugNotes(med),
    );
  });
}

function drugNotes(med) {
  const out = h('div', {});
  for (const gid of med.drug.g || []) {
    const g = generic(ctx.state, gid);
    if (!g?.notes) continue;
    const n = g.notes;
    out.append(sectionTitle(g.name), card(n.renal ? kv('الكلى', n.renal) : null, n.hepatic ? kv('الكبد', n.hepatic) : null, n.preg ? kv('الحمل', n.preg) : null, n.lact ? kv('الرضاعة', n.lact) : null, n.elderly ? kv('كبار السن', n.elderly) : null, n.other ? kv('ملاحظات', n.other) : null));
  }
  return out;
}

// ---------------- السكر ----------------
let glucoseRange = 30;
function glucoseTab(p, c) {
  const out = h('div', {});
  out.append(h('div', { class: 'grid-btns' }, h('button', { type: 'button', class: 'btn primary', text: '+ قراءات البيت', onclick: () => smbgForm(p) }), h('button', { type: 'button', class: 'btn', text: '+ تقرير CGM', onclick: () => cgmForm(p) }), h('button', { type: 'button', class: 'btn', text: '+ نوبة هبوط', onclick: () => hypoForm(p) })));
  const t = c.targets;
  out.append(h('div', { class: 'muted small', text: `الأهداف (${t.ar}${t.auto ? '، تلقائي' : ''}): صايم ${t.fpg ? t.fpg.join('–') : '—'} • بعد الأكل < ${t.ppg ?? '—'} • HbA1c < ${t.a1c ?? '—'}${t.note ? ` — ${t.note}` : ''}` }));
  out.append(
    chips(
      [
        { value: 14, label: '14 يوم' },
        { value: 30, label: '30 يوم' },
        { value: 90, label: '90 يوم' },
        { value: 0, label: 'الكل' },
      ],
      glucoseRange,
      (v) => {
        glucoseRange = v;
        ctx.refresh();
      },
    ),
  );
  const all = smbgReadings(ctx.state, p.id);
  const lastDate = all.length ? all[all.length - 1].date : null;
  const readings = glucoseRange && lastDate ? all.filter((r) => r.date >= addDays(lastDate, -glucoseRange + 1)) : all;
  const st = smbgStats(readings, t);
  out.append(sectionTitle('قراءات البيت (SMBG)'));
  if (!st) out.append(empty('مفيش قراءات'));
  else {
    out.append(
      h('div', { class: 'stats' }, stat('المتوسط', F.int(st.mean), { hint: `${F.int(st.n)} قراءة • ${F.int(st.days)} يوم` }), stat('في المدى 70–180', F.pct(st.inRange), { valueClass: st.inRange >= 70 ? 'pos' : 'neg' }), stat('أقل من 70', F.pct(st.below70), { hint: `منها < 54: ${F.pct(st.below54)}`, valueClass: st.below70 >= 4 ? 'neg' : '' }), stat('CV', F.pct(st.cv), { valueClass: st.cv > 36 ? 'neg' : '' })),
    );
    out.append(
      table(
        [{ label: 'الميعاد' }, { label: 'عدد', num: true }, { label: 'متوسط', num: true }, { label: 'أقل–أعلى', num: true }, { label: 'فوق الهدف', num: true }, { label: '< 70', num: true }],
        st.bySlot.map((s) => [s.slot.ar, F.int(s.n), F.int(s.mean), `${F.int(s.min)}–${F.int(s.max)}`, s.above === null ? '—' : F.int(s.above), { text: F.int(s.low), cls: s.low ? 'lo' : '' }]),
      ),
    );
    out.append(lineChart({ series: [{ points: readings.filter((r) => r.slot === 'fasting').map((r) => ({ x: r.date, y: r.v })), cls: 'fasting' }, { points: readings.filter((r) => SMBG_SLOTS.find((x) => x.id === r.slot).kind === 'post').map((r) => ({ x: r.date, y: r.v })), cls: 'post' }, { points: readings.filter((r) => !['fasting', 'post'].includes(SMBG_SLOTS.find((x) => x.id === r.slot).kind)).map((r) => ({ x: r.date, y: r.v })), cls: 'other' }], band: { lo: 70, hi: 180 }, lines: [{ y: 70, cls: 'low' }], dp: 0, title: 'قراءات السكر' }));
    out.append(h('div', { class: 'legend small' }, h('span', { class: 'lg fasting', text: 'صايم' }), h('span', { class: 'lg post', text: 'بعد الأكل' }), h('span', { class: 'lg other', text: 'قبل الأكل/النوم/أخرى' })));
  }
  const entries = patientEntries(ctx.state, p.id, 'smbg').sort((a, b) => cmp(b.date, a.date));
  if (entries.length) out.append(h('details', { class: 'more' }, h('summary', { text: `جداول القراءات (${F.int(entries.length)})` }), list(entries.map((e) => row({ title: `${F.date(e.days[0].d)} ← ${F.date(e.days[e.days.length - 1].d)}`, subtitle: `${F.int(e.days.length)} يوم`, onclick: () => entrySheet(p, e) })))));
  // CGM
  const reps = cgmReports(ctx.state, p.id).slice().reverse();
  out.append(sectionTitle('CGM'));
  if (!reps.length) out.append(empty('مفيش تقارير CGM'));
  for (const r of reps.slice(0, 3)) {
    const ev = cgmEvaluate(r, t);
    out.append(
      h(
        'div',
        { class: 'card' },
        h('div', { class: 'visit-head' }, h('b', { text: F.date(r.date) }), r.days ? badge(`${F.int(r.days)} يوم`, 'info') : null, r.device ? badge(r.device, '') : null),
        h('div', { class: 'agp-bar', dir: 'ltr' }, ['tbr2', 'tbr1', 'tir', 'tar1', 'tar2'].map((k) => (typeof r[k] === 'number' && r[k] > 0 ? h('span', { class: `seg-${k}`, style: { width: `${r[k]}%` }, title: `${k}: ${r[k]}%` }) : null))),
        table(
          [{ label: 'المقياس' }, { label: 'القيمة', num: true }, { label: 'الهدف', num: true }],
          [...ev.map((e) => ({ cells: [e.label, { text: F.pct(e.value, 1), cls: e.ok ? 'okc' : 'hi' }, `${['tir', 'active'].includes(e.key) ? '>' : '<'} ${plainNum(e.target)}%`] })), ...(r.mean ? [['Mean', F.int(r.mean), '']] : []), ...(cgmGmi(r) ? [['GMI', F.pct(cgmGmi(r), 1), '']] : [])],
          { dir: 'ltr' },
        ),
        h('button', { type: 'button', class: 'btn small', text: 'تفاصيل', onclick: () => entrySheet(p, r) }),
      ),
    );
  }
  if (reps.length > 1) out.append(lineChart({ series: [{ points: reps.map((r) => ({ x: r.date, y: r.tir })), cls: 'tir' }, { points: reps.map((r) => ({ x: r.date, y: tbrTotal(r) })), cls: 'low' }], lines: [{ y: t.cgm?.tir || 70, cls: 'target' }], dp: 0, title: 'TIR' }));
  // الهبوط
  const hypos = hypoEvents(ctx.state, p.id);
  out.append(sectionTitle(`نوبات الهبوط (${F.int(hypos.length)})`));
  out.append(hypos.length ? list(hypos.map((e) => row({ title: `${F.date(e.date)}${e.time ? ' ' + e.time : ''} — مستوى ${e.level}${e.value ? ` (${e.value})` : ''}`, subtitle: [e.nocturnal ? 'ليلي' : '', e.cause ? HYPO_CAUSES[e.cause] : '', e.action || ''].filter(Boolean).join(' • '), badge: badge(`L${e.level}`, e.level >= 2 ? 'bad' : 'warn'), onclick: () => entrySheet(p, e) }))) : empty('مفيش نوبات مسجلة'));
  return out;
}

// ---------------- التصنيف والحالات ----------------
function dxTab(p, c) {
  const out = h('div', {});
  const dm = DM_TYPES.find((t) => t.id === p.dm?.type);
  out.append(
    card(
      kv('التشخيص', dm ? `${dm.label}${icd(dm.icd)}` : '—'),
      p.dm?.t1Stage ? kv('المرحلة', `Stage ${p.dm.t1Stage}`) : null,
      kv('منذ', p.dm?.since ? fuzzyText(p.dm.since) : '—'),
      h('button', { type: 'button', class: 'btn small', text: 'تعديل', onclick: () => patientForm(p) }),
    ),
  );
  // تصنيف مشتق من البيانات
  const auto = [];
  if (c.gStage) auto.push(row({ title: `CKD: ${c.gStage}${c.aStage ? '/' + c.aStage : ''}`, subtitle: `eGFR ${F.int(c.f.egfr ?? c.egfr?.v)}${c.uacr ? ` • UACR ${F.int(c.uacr.v)}` : ''}${c.kdigo ? ` • ${KDIGO_RISK_AR[c.kdigo]}` : ''}`, badge: badge('محسوب', 'info') }));
  if (c.bmi) auto.push(row({ title: `BMI ${F.num(c.bmi, 1)}: ${bmiClass(c.bmi).ar}`, subtitle: bmiClass(c.bmi).en, badge: badge('محسوب', 'info') }));
  if (c.fib4) auto.push(row({ title: `FIB-4 ${F.num(c.fib4.v, 2)}`, subtitle: fib4Risk(c.fib4.v, c.age)?.ar || '', badge: badge('محسوب', 'info') }));
  if (c.insulinDeficient && c.dmType !== 'T1') auto.push(row({ title: 'نقص إنسولين محتمل', subtitle: c.f.cpep !== undefined ? `C-peptide ${F.num(c.f.cpep, 2)} ng/mL` : '', badge: badge('محسوب', 'warn') }));
  if (auto.length) out.append(sectionTitle('تصنيف من البيانات'), list(auto));
  const all = patientConditions(ctx.state, p.id, { all: true });
  const today = ctx.today();
  out.append(sectionTitle('الحالات المصاحبة', h('button', { type: 'button', class: 'btn small', text: '+ حالة', onclick: () => conditionForm(p) })));
  if (!all.length) out.append(empty('مفيش حالات مسجلة (حمل، كلى، كبد، HF، …)'));
  for (const [g, label] of Object.entries(CONDITION_GROUPS)) {
    const items = all.filter((x) => (x.def.group || 'other') === g);
    if (!items.length) continue;
    out.append(h('div', { class: 'muted small group-label', text: label }));
    out.append(
      list(
        items.map((x) => {
          const ended = x.until && x.until <= today;
          const det = Object.entries(x.details || {})
            .map(([k, v]) => {
              const f = (x.def.fields || []).find((ff) => ff.key === k);
              const lbl = f?.options?.find((o) => o.v === v)?.l || v;
              return `${f?.label || k}: ${lbl}`;
            })
            .join(' • ');
          const ga = x.code === 'pregnancy' && !ended ? gestationalWeeks(x, today) : null;
          return row({ title: `${x.def.ar}${icd(x.def.icd)}`, subtitle: [x.def.label, det, ga !== null ? `${ga} أسبوع` : '', x.since ? `من ${F.date(x.since)}` : '', x.until ? `حتى ${F.date(x.until)}` : '', x.note].filter(Boolean).join(' • '), badge: ended ? badge('انتهت', '') : null, cls: ended ? 'voided' : '', onclick: () => conditionForm(p, x) });
        }),
      ),
    );
  }
  return out;
}

// ---------------- المنتظر ----------------
function pendingTab(p, c) {
  const out = h('div', {});
  const tasks = openTasks(ctx.state, { patientId: p.id, today: ctx.today() });
  out.append(sectionTitle('منتظر'));
  out.append(tasks.length ? list(tasks.map((t) => taskRow(t))) : empty('مفيش حاجة منتظرة'));
  out.append(sectionTitle('المتابعات الدورية (ADA)', h('button', { type: 'button', class: 'btn small', text: 'الفترات', onclick: () => ctx.nav('#/screening') })));
  const scr = screeningFor(ctx.state, c, ctx.today());
  out.append(scr.length ? list(scr.map((s) => screenRow(p, s))) : empty('لا ينطبق'));
  const done = [...ctx.state.entities.get('task')?.values() || []].filter((t) => t.patientId === p.id && t.status && t.status !== 'open').sort((a, b) => cmp(b.doneDate || '', a.doneDate || ''));
  if (done.length) out.append(h('details', { class: 'more' }, h('summary', { text: `اللي خلص (${F.int(done.length)})` }), list(done.map((t) => row({ title: t.type === 'lab' ? `تحاليل: ${(t.tests || []).map((x) => labTest(ctx.state, x)?.abbr).join('، ')}` : t.title || TASK_TYPES[t.type], subtitle: `${t.status === 'done' ? 'تم' : 'اتلغى'} ${F.date(t.doneDate)}${t.resultNote ? ` • ${t.resultNote}` : ''}` })))));
  return out;
}

// ---------------- الصور ----------------
function photosTab(p) {
  const out = h('div', {});
  const photos = patientEntries(ctx.state, p.id, 'photo').sort((a, b) => cmp(b.date, a.date));
  out.append(h('button', { type: 'button', class: 'btn primary block', text: '+ صورة (تحاليل، روشتة، أشعة…)', onclick: () => photoForm(p) }));
  if (!photos.length) out.append(empty('مفيش صور'));
  const grid = h('div', { class: 'photo-grid' });
  for (const e of photos) {
    const img = h('img', { alt: e.caption || PHOTO_CATS[e.cat] || 'صورة', loading: 'lazy' });
    ctx.store.getFile(e.fileId).then((f) => {
      if (f) img.src = f.data;
      else img.alt = 'الصورة غير موجودة على الجهاز (استرجعها من نسخة بالصور)';
    });
    grid.append(h('button', { type: 'button', class: 'photo', onclick: () => photoSheet(p, e) }, img, h('span', { class: 'cap', text: `${F.dateShort(e.date)} • ${PHOTO_CATS[e.cat] || ''}` })));
  }
  out.append(grid);
  return out;
}

function photoSheet(p, e) {
  openSheet(`${PHOTO_CATS[e.cat] || 'صورة'} — ${F.date(e.date)}`, (body, close) => {
    const img = h('img', { class: 'photo-full', alt: e.caption || '' });
    ctx.store.getFile(e.fileId).then((f) => f && (img.src = f.data));
    body.append(img, e.caption ? h('p', { text: e.caption }) : null, h('button', { type: 'button', class: 'btn danger small', text: 'إلغاء الصورة', onclick: async () => (await voidEntryFlow(e, 'الصورة')) && close() }));
  }, { wide: true });
}

// ---------------- السجل ----------------
function logTab(p) {
  const out = h('div', {});
  const all = patientEntries(ctx.state, p.id, null, { voided: true }).sort((a, b) => cmp(b.date, a.date) || cmp(b.ts, a.ts));
  out.append(h('div', { class: 'muted small', text: 'كل ما اتسجل للمريض بالترتيب (الملغى مشطوب ويفضل محفوظ).' }));
  out.append(all.length ? list(all.map((e) => {
    const d = describeEntry(ctx.state, e);
    return row({ title: d.title, subtitle: `${F.date(e.date)}${d.sub ? ` • ${d.sub}` : ''}`, cls: e.voided ? 'voided' : '', badge: e.voided ? badge('ملغى', 'bad') : e.replaces ? badge('معدّل', 'info') : null, onclick: () => entrySheet(p, e) });
  })) : empty('السجل فاضي'));
  return out;
}

// تفاصيل أي قيد + تعديل/إلغاء.
export function entrySheet(p, e) {
  const d = describeEntry(ctx.state, e);
  const edit = { visit: visitForm, labs: labsForm, smbg: smbgForm, cgm: cgmForm, hypo: hypoForm, exam: examForm, note: noteForm }[e.kind];
  openSheet(d.title, (body, close) => {
    body.append(card(kv('التاريخ', F.date(e.date)), d.sub ? kv('التفاصيل', d.sub) : null, kv('اتسجل', F.dateTime(e.ts)), e.voided ? kv('ملغى', `${e.voided.reason} (${F.date(e.voided.date)})`, 'neg') : null, e.replaces ? kv('معدّل من', 'قيد سابق') : null));
    if (e.kind === 'labs') body.append(table([{ label: 'Test' }, { label: 'Result', num: true }], e.results.map((r) => [labTest(ctx.state, r.test)?.abbr || r.test, r.t || `${plainNum(r.v)} ${r.unit || labTest(ctx.state, r.test)?.unit || ''}`]), { dir: 'ltr' }));
    if (e.kind === 'smbg') body.append(table([{ label: 'اليوم' }, ...SMBG_SLOTS.map((s) => ({ label: s.ar, num: true }))], e.days.map((x) => [F.dateShort(x.d), ...SMBG_SLOTS.map((s) => (x.r[s.id] !== undefined ? String(x.r[s.id]) : ''))])));
    if (e.kind === 'cgm') body.append(card(...['active', 'mean', 'gmi', 'cv', 'tar2', 'tar1', 'tir', 'tbr1', 'tbr2', 'tirTight'].filter((k) => typeof e[k] === 'number').map((k) => kv(k.toUpperCase(), plainNum(e[k])))));
    if (e.kind === 'exam' && examSummary(e)) body.append(card(kv('النتيجة', examSummary(e)), e.text ? kv('التقرير', e.text) : null));
    if (e.kind === 'note') body.append(card(h('p', { text: e.text })));
    if (!e.voided) {
      const isMed = e.kind.startsWith('med.');
      body.append(
        h(
          'div',
          { class: 'btn-row' },
          edit ? h('button', { type: 'button', class: 'btn', text: 'تعديل', onclick: () => (close(), edit(p, e)) }) : null,
          h('button', { type: 'button', class: 'btn danger', text: isMed ? 'إلغاء (تسجيل خطأ)' : 'إلغاء', onclick: async () => (await voidEntryFlow(e)) && close() }),
        ),
      );
      if (isMed) body.append(h('p', { class: 'muted small', text: 'لتغيير الجرعة استخدم «تعديل الجرعة» من بطاقة الدواء. الإلغاء هنا لتصحيح إدخال غلط فقط.' }));
    }
  });
}
