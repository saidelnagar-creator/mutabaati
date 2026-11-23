// التقارير: تقرير حالة مريض (كامل أو مختصر، إنجليزي للطباعة/PDF)، ورقة تعليمات للمريض بالعربي (عامية أو فصحى)،
// وتقارير المرضى العامة مع تصدير Excel.
import { h, clear, icon } from '../dom.js';
import { ctx, F } from '../ctx.js';
import { badge, card, checkbox, chips, empty, kv, list, row, saveFile, sectionTitle, segmented, stat, table, toast } from '../components.js';
import { fuzzyText, patientSubtitle, sourceName } from '../widgets.js';
import { entity, listEntities, patientEntries } from '../../core/state.js';
import { patientContext, patientConditions, durationText, followStartDate, dmSinceDate } from '../../core/patient.js';
import { evaluateAlerts } from '../../core/alerts.js';
import { medList, doseText, isActiveOn, medTitle, genericNames, mealOf, mealText } from '../../core/meds.js';
import { compareTable, labResults } from '../../core/labs.js';
import { generic, labTest } from '../../core/catalog.js';
import { openTasks, screeningFor, lastVisit } from '../../core/followup.js';
import { smbgReadings, smbgStats, cgmReports, cgmEvaluate, hypoEvents, tbrTotal } from '../../core/glucose.js';
import { bmiClass, fib4Risk, KDIGO_RISK_AR } from '../../core/calc.js';
import { buildXlsx } from '../../core/xlsx.js';
import { DM_TYPES } from '../../config/catalog/conditions.js';
import { DERIVED } from '../../config/catalog/labs.js';
import { EXAMS } from '../../config/catalog/care.js';
import { LEVELS } from '../../config/catalog/alerts.js';
import { addDays, cmp } from '../../core/util.js';
import { plainNum } from '../../core/num.js';

const enDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const KEY_TESTS = ['a1c', 'fbg', 'ppg2', 'creat', 'uacr', 'k', 'alt', 'ast', 'plt', 'ldl', 'tg', 'hdl', 'hb', 'tsh', 'b12', 'vitd'];
const opts = { mode: 'full', dialect: null, alerts: true, contact: false, source: false };

const T = (tag, cls, text) => h(tag, { class: cls, text });

export function reportScreen({ id }) {
  const p = entity(ctx.state, 'patient', id);
  if (!p) return { title: 'غير موجود', body: empty('المريض غير موجود') };
  if (!opts.dialect) opts.dialect = ctx.state.settings.dialect || 'egy';
  const body = h('div', {});
  const controls = h(
    'div',
    { class: 'no-print report-controls' },
    segmented(
      [
        { value: 'full', label: 'كامل' },
        { value: 'brief', label: 'مختصر' },
        { value: 'instructions', label: 'تعليمات المريض' },
      ],
      opts.mode,
      (v) => ((opts.mode = v), ctx.refresh()),
    ),
    opts.mode === 'instructions'
      ? segmented(
          [
            { value: 'egy', label: 'عامية' },
            { value: 'msa', label: 'فصحى' },
          ],
          opts.dialect,
          (v) => ((opts.dialect = v), ctx.refresh()),
        )
      : h('div', { class: 'chips' }, toggle('التنبيهات', 'alerts'), toggle('التليفون والعنوان', 'contact'), toggle('المصدر', 'source')),
    h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn primary', onclick: () => window.print() }, icon('print', 18), ' طباعة / PDF'), h('button', { type: 'button', class: 'btn', text: 'مشاركة كملف', onclick: () => shareDoc(p) })),
    h('p', { class: 'muted small', text: 'على الآيفون: «طباعة / PDF» ← مشاركة ← حفظ في الملفات أو إرسال. التقرير بالإنجليزي؛ تعليمات المريض بالعربي.' }),
  );
  const doc = opts.mode === 'instructions' ? instructionsDoc(p, opts.dialect) : clinicalDoc(p, opts);
  body.append(controls, doc);
  return { title: 'تقرير', subtitle: p.name, body };
}
function toggle(label, key) {
  return h('button', { type: 'button', class: `chip ${opts[key] ? 'on' : ''}`, text: label, onclick: () => ((opts[key] = !opts[key]), ctx.refresh()) });
}

async function shareDoc(p) {
  const docEl = document.querySelector('.print-doc');
  if (!docEl) return;
  const css = await fetch('./css/app.css').then((r) => r.text()).catch(() => '');
  const ser = new XMLSerializer().serializeToString(docEl);
  const html = `<!doctype html><html lang="${opts.mode === 'instructions' ? 'ar' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${p.name.replace(/[<>&]/g, '')}</title><style>${css}</style></head><body class="standalone-doc">${ser}</body></html>`;
  await saveFile(`report-${ctx.today()}.html`, html, 'text/html');
}

// ---------- التقرير الطبي (إنجليزي) ----------
function clinicalDoc(p, o) {
  const brief = o.mode === 'brief';
  const today = ctx.today();
  const c = patientContext(ctx.state, p.id, today);
  const s = ctx.state.settings;
  const icd = (code) => (s.showIcd !== false && code ? ` [${code}]` : '');
  const dm = DM_TYPES.find((t) => t.id === p.dm?.type);
  const doc = h('div', { class: 'print-doc', dir: 'ltr', lang: 'en' });
  doc.append(
    h('div', { class: 'pd-head' }, h('div', {}, T('h1', '', brief ? 'Patient Summary (Brief)' : 'Patient Clinical Report'), s.doctorName || s.clinicName ? T('div', 'muted', [s.doctorName, s.clinicName].filter(Boolean).join(' — ')) : null), T('div', 'muted', `Date: ${enDate(today)}`)),
    h(
      'table',
      { class: 'pd-kv' },
      h(
        'tbody',
        {},
        kvRow('Name', p.name),
        kvRow('Age / Sex', `${c.age ?? '—'}${p.dob ? '' : c.age !== null ? ' (approx.)' : ''} / ${p.sex === 'F' ? 'Female' : 'Male'}${p.dob ? ` — DOB ${enDate(p.dob)}` : ''}`),
        o.contact && (p.phone || p.address) ? kvRow('Contact', [p.phone, p.address].filter(Boolean).join(' — ')) : null,
        o.source && p.sourceId ? kvRow('Source', `${sourceName(p.sourceId)}${p.referral ? ` (${p.referral})` : ''}`) : null,
        kvRow('Diagnosis', dm ? `${dm.label}${icd(dm.icd)}${p.dm?.t1Stage ? `, stage ${p.dm.t1Stage}` : ''}${dmSinceDate(p) ? ` — duration ${enDuration(dmSinceDate(p), today)}` : ''}` : '—'),
        kvRow('Under my follow-up since', `${fuzzyEn(p.followStart)}${followStartDate(p) ? ` (${enDuration(followStartDate(p), today)})` : ''}`),
        c.weight || c.bmi ? kvRow('Anthropometry', [c.weight ? `Weight ${plainNum(c.weight)} kg` : '', c.height ? `Height ${plainNum(c.height)} cm` : '', c.bmi ? `BMI ${c.bmi.toFixed(1)} (${bmiClass(c.bmi).en})` : ''].filter(Boolean).join(', ')) : null,
        c.vitals.sbp ? kvRow('Last BP', `${c.vitals.sbp.v}/${c.vitals.dbp?.v ?? '—'} mmHg (${enDate(c.vitals.sbp.date)})`) : null,
      ),
    ),
  );
  // التشخيصات المصاحبة
  const conds = patientConditions(ctx.state, p.id, { date: today });
  const derived = [];
  if (c.gStage && (c.f.egfr < 60 || c.f.uacr >= 30)) derived.push(`CKD ${c.gStage}${c.aStage ? '/' + c.aStage : ''} (KDIGO: ${c.kdigo || '—'} risk; eGFR ${Math.round(c.f.egfr ?? c.egfr?.v)}${c.uacr ? `, UACR ${Math.round(c.uacr.v)} mg/g` : ''})`);
  if (c.fib4) derived.push(`FIB-4 ${c.fib4.v.toFixed(2)} (${enDate(c.fib4.date)})`);
  if (conds.length || derived.length) {
    doc.append(T('h2', '', 'Comorbidities / Classification'));
    doc.append(h('ul', {}, conds.map((x) => h('li', { text: `${x.def.label}${icd(x.def.icd)}${condDetailsEn(x)}${x.since ? ` — since ${enDate(x.since)}` : ''}` })), derived.map((d) => h('li', { text: `${d} [calculated]` }))));
  }
  // العلاج الحالي
  const meds = medList(ctx.state, p.id);
  const active = meds.filter((m) => isActiveOn(m, today));
  doc.append(T('h2', '', 'Current Medications'));
  doc.append(active.length ? simpleTable(['Medication', 'Active ingredient', 'Dose & timing', 'Since'], active.map((m) => [medTitle(m), genericNames(ctx.state, m), doseText(ctx.state, m, m.dose, { lang: 'en' }), m.datePrecision === 'unknown' ? (m.prior ? 'before my follow-up' : 'unknown') : enDate(m.startDate)])) : T('p', 'muted', 'None recorded.'));
  if (c.insulin) doc.append(T('p', 'small', `Insulin: total ${c.insulin.tdd} U/day, basal ${c.insulin.basal} U/day${c.weight ? ` (${(c.insulin.tdd / c.weight).toFixed(2)} / ${(c.insulin.basal / c.weight).toFixed(2)} U/kg)` : ''}.`));
  if (!brief) {
    const changes = meds.flatMap((m) => m.history.map((x) => ({ ...x, m }))).sort((a, b) => cmp(b.date, a.date));
    if (changes.length) {
      doc.append(T('h2', '', 'Medication History'));
      doc.append(simpleTable(['Date', 'Action', 'Medication', 'Dose', 'Reason'], changes.map((x) => [x.kind === 'start' && x.m.datePrecision === 'unknown' ? '—' : enDate(x.date), { start: x.m.prior ? 'On (prior)' : 'Started', change: 'Changed', stop: 'Stopped' }[x.kind], medTitle(x.m), x.dose ? doseText(ctx.state, x.m, x.dose, { lang: 'en', withMeal: false }) : '', x.reason || ''])));
    }
  }
  // التحاليل
  const t = compareTable(ctx.state, p, { maxDates: brief ? 4 : 8, tests: brief ? KEY_TESTS : null });
  if (t.rows.length) {
    doc.append(T('h2', '', 'Laboratory Results'));
    const rows = t.rows.map((r) => [`${r.test.abbr}${r.test.unit ? ` (${r.test.unit})` : ''}`, ...r.cells.map((x) => (x ? x.t || `${fmt(x.v, r.test.dp)}${x.flag ? ` ${x.flag}` : ''}` : ''))]);
    for (const d of DERIVED) if (t.derived.some((x) => x && x[d.id] !== undefined)) rows.push([`${d.abbr} (calc.)`, ...t.derived.map((x) => (x && x[d.id] !== undefined ? fmt(x[d.id], d.dp) : ''))]);
    doc.append(simpleTable(['Test', ...t.dates.map(enDate)], rows, 'labs'));
  }
  // السكر
  const rs = smbgReadings(ctx.state, p.id);
  const last = rs.length ? rs[rs.length - 1].date : null;
  const st = last ? smbgStats(rs.filter((r) => r.date >= addDays(last, -29)), c.targets) : null;
  const cgm = cgmReports(ctx.state, p.id).pop();
  const hypos = hypoEvents(ctx.state, p.id).filter((e) => e.date >= addDays(today, -90));
  if (st || cgm || hypos.length) {
    doc.append(T('h2', '', 'Glucose Monitoring'));
    const ul = h('ul', {});
    if (st) ul.append(h('li', { text: `SMBG ${enDate(st.from)}–${enDate(st.to)}: ${st.n} readings, mean ${Math.round(st.mean)} mg/dL, ${Math.round(st.inRange)}% 70–180, ${Math.round(st.below70)}% <70. ${st.bySlot.map((x) => `${x.slot.en} ${Math.round(x.mean)}`).join(', ')}.` }));
    if (cgm) ul.append(h('li', { text: `CGM (${enDate(cgm.date)}${cgm.days ? `, ${cgm.days} d` : ''}): ${['tir', 'tbr1', 'tbr2', 'tar1', 'tar2', 'cv', 'gmi'].filter((k) => typeof cgm[k] === 'number').map((k) => `${{ tir: 'TIR', tbr1: 'TBR 54–69', tbr2: 'TBR <54', tar1: 'TAR 181–250', tar2: 'TAR >250', cv: 'CV', gmi: 'GMI' }[k]} ${cgm[k]}%`).join(', ')}.` }));
    ul.append(h('li', { text: `Hypoglycemia (last 90 days): ${hypos.length ? hypos.map((e) => `L${e.level} ${enDate(e.date)}${e.value ? ` (${e.value})` : ''}`).join('; ') : 'none recorded'}.` }));
    doc.append(ul);
  }
  // الفحوصات
  const exams = patientEntries(ctx.state, p.id, 'exam').sort((a, b) => cmp(b.date, a.date));
  const lastByType = new Map();
  for (const e of exams) if (!lastByType.has(e.exam)) lastByType.set(e.exam, e);
  if (lastByType.size) {
    doc.append(T('h2', '', 'Examinations'));
    doc.append(h('ul', {}, [...lastByType.values()].map((e) => h('li', { text: `${{ fundus: 'Fundus', foot: 'Foot exam', ecg: 'ECG', echo: 'Echo', fibroscan: 'Fibroscan', us: 'Ultrasound', dexa: 'DEXA', other: 'Other' }[e.exam]} (${enDate(e.date)}): ${examEn(e)}${e.text ? ` — ${e.text}` : ''}` }))));
  }
  // المتابعات
  const visits = patientEntries(ctx.state, p.id, 'visit').sort((a, b) => cmp(b.date, a.date));
  if (visits.length) {
    doc.append(T('h2', '', brief ? 'Last Visit' : `Visits (${visits.length})`));
    for (const v of brief ? visits.slice(0, 1) : visits.slice(0, 30)) {
      const vit = v.vitals || {};
      doc.append(h('div', { class: 'pd-visit' }, T('b', '', enDate(v.date)), v.complaint ? T('div', '', `Complaint: ${v.complaint}`) : null, Object.keys(vit).length ? T('div', '', [vit.weight ? `Wt ${plainNum(vit.weight)} kg` : '', vit.sbp ? `BP ${vit.sbp}/${vit.dbp ?? '—'}` : '', vit.hr ? `HR ${vit.hr}` : '', vit.rbg ? `RBG ${vit.rbg}` : ''].filter(Boolean).join(', ')) : null, v.assessment ? T('div', '', `Assessment: ${v.assessment}`) : null, v.plan ? T('div', '', `Plan: ${v.plan}`) : null));
    }
  }
  // التنبيهات
  if (o.alerts) {
    const al = evaluateAlerts(ctx.state, c).filter((a) => !a.ack && LEVELS[a.level].order <= 5);
    if (al.length) {
      doc.append(T('h2', '', 'Decision-support notes'));
      doc.append(h('ul', {}, al.map((a) => h('li', { text: `[${a.level}] ${a.title}${a.medTitle ? ` (${a.medTitle})` : ''} — ${a.ref}` }))));
    }
  }
  // المنتظر
  const tasks = openTasks(ctx.state, { patientId: p.id, today });
  if (tasks.length) {
    doc.append(T('h2', '', 'Pending / Next Steps'));
    doc.append(h('ul', {}, tasks.map((tk) => h('li', { text: `${tk.type === 'visit' ? 'Next visit' : tk.type === 'lab' ? `Pending labs: ${(tk.tests || []).map((x) => labTest(ctx.state, x)?.abbr).join(', ')}` : tk.title || ''}${tk.due ? ` — ${enDate(tk.due)}` : ''}` }))));
  }
  doc.append(T('div', 'pd-foot', `Generated by Mutabaati on ${enDate(today)}. Decision-support notes are based on ADA Standards of Care 2026, KDIGO and product labels; clinical judgement prevails.`));
  return doc;
}
const fmt = (v, dp = 1) => (v === null || v === undefined ? '' : (Math.round(v * 10 ** (dp ?? 1)) / 10 ** (dp ?? 1)).toString());
function kvRow(k, v) {
  return h('tr', {}, h('th', { text: k }), h('td', { text: v ?? '—' }));
}
function simpleTable(head, rows, cls = '') {
  return h('table', { class: `pd-table ${cls}` }, h('thead', {}, h('tr', {}, head.map((x) => h('th', { text: x })))), h('tbody', {}, rows.map((r) => h('tr', {}, r.map((x) => h('td', { text: x ?? '' }))))));
}
function fuzzyEn(f) {
  if (!f || f.p === 'unknown') return 'unknown';
  if (f.p === 'day') return enDate(f.v);
  if (f.p === 'month') return `${f.v.slice(5, 7)}/${f.v.slice(0, 4)}`;
  if (f.p === 'year') return f.v;
  return `approx. ${f.v.slice(0, 4)}`;
}
function enDuration(from, to) {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
  if (days < 60) return `${days} days`;
  const m = Math.floor(days / 30.44);
  if (m < 24) return `${m} months`;
  return `${Math.floor(days / 365.25)} years`;
}
function condDetailsEn(x) {
  const d = x.details || {};
  const parts = Object.entries(d).map(([k, v]) => `${k}: ${v}`);
  return parts.length ? ` (${parts.join(', ')})` : '';
}
function examEn(e) {
  const def = EXAMS.find((x) => x.id === e.exam);
  return (def?.fields || [])
    .filter((f) => e.result?.[f.key] !== undefined)
    .map((f) => `${f.label}: ${f.type === 'select' ? f.options.find((o) => o.v === e.result[f.key])?.l || e.result[f.key] : e.result[f.key]}`)
    .join(', ');
}

// ---------- تعليمات المريض (عربي) ----------
const TX = {
  egy: {
    title: 'تعليمات العلاج',
    meds: 'الأدوية',
    hypoT: 'لو حسيت بهبوط (رعشة، عرق، دوخة، جوع شديد) أو السكر أقل من 70:',
    hypo: 'خد 15 جرام سكر سريع (نص كوباية عصير أو 3 معالق سكر في مية)، وقيس بعد ربع ساعة. لو لسه أقل من 70 كرر. بعد ما يتظبط كُل وجبة خفيفة. لو حصل إغماء لازم حد يديك جلوكاجون أو تروح الطوارئ.',
    sickT: 'في أيام المرض (ترجيع، إسهال، سخونية، مش قادر تاكل):',
    sick: 'اشرب سوائل كتير، وقيس السكر كل 4 ساعات، ووقّف مؤقتاً: ',
    sickInsulin: 'ماتوقفش الإنسولين القاعدي من غير ما تكلمني.',
    targets: 'أهداف السكر',
    fasting: 'صايم',
    post: 'بعد الأكل بساعتين أقل من',
    next: 'الميعاد الجاي',
    labs: 'التحاليل المطلوبة قبل الميعاد',
    call: 'لو عندك أي سؤال أو عرض غريب كلمني.',
  },
  msa: {
    title: 'تعليمات العلاج',
    meds: 'الأدوية',
    hypoT: 'عند الشعور بالهبوط (رعشة، عرق، دوار، جوع شديد) أو إذا كان السكر أقل من 70:',
    hypo: 'تناول 15 جراماً من السكر السريع (نصف كوب عصير أو 3 ملاعق سكر في ماء)، وأعد القياس بعد ربع ساعة. إذا بقي أقل من 70 كرر. بعد التحسن تناول وجبة خفيفة. عند فقدان الوعي يُعطى الجلوكاجون أو يُنقل للطوارئ.',
    sickT: 'في أيام المرض (قيء، إسهال، حرارة، عدم القدرة على الأكل):',
    sick: 'أكثر من السوائل، وقِس السكر كل 4 ساعات، وأوقف مؤقتاً: ',
    sickInsulin: 'لا توقف الإنسولين القاعدي دون الرجوع للطبيب.',
    targets: 'أهداف السكر',
    fasting: 'صائم',
    post: 'بعد الأكل بساعتين أقل من',
    next: 'الموعد القادم',
    labs: 'التحاليل المطلوبة قبل الموعد',
    call: 'عند أي سؤال أو عرض غير معتاد تواصل مع الطبيب.',
  },
};

function instructionsDoc(p, dialect) {
  const L = TX[dialect] || TX.egy;
  const today = ctx.today();
  const c = patientContext(ctx.state, p.id, today);
  const meds = c.meds;
  const doc = h('div', { class: 'print-doc instructions', dir: 'rtl', lang: 'ar' });
  doc.append(h('div', { class: 'pd-head' }, h('div', {}, T('h1', '', L.title), T('div', '', p.name)), T('div', 'muted', F.date(today))));
  doc.append(T('h2', '', L.meds));
  if (!meds.length) doc.append(T('p', 'muted', '—'));
  for (const m of meds) {
    const g = generic(ctx.state, m.drug.g[0]);
    const meal = mealOf(ctx.state, m);
    const counsel = (m.drug.g || []).map((gid) => generic(ctx.state, gid)?.counsel?.[dialect]).filter(Boolean)[0];
    doc.append(h('div', { class: 'pd-med' }, h('div', { class: 'pd-med-name', dir: 'ltr', text: medTitle(m) }), h('div', { text: doseText(ctx.state, m, m.dose, { withMeal: false }) }), meal.meal ? h('div', { text: `🍽 ${mealText(meal.meal, meal.mealMin)}${meal.note ? ` — ${meal.note}` : ''}` }) : null, counsel ? h('div', { class: 'muted', text: counsel }) : null, m.start.indication ? h('div', { class: 'muted', text: m.start.indication }) : null, void g));
  }
  const hypoRisk = meds.some((m) => m.classes.has('insulin') || m.classes.has('su') || m.classes.has('meglitinide'));
  if (hypoRisk) doc.append(T('h2', '', L.hypoT), T('p', '', L.hypo));
  const sickDrugs = meds.filter((m) => m.classes.has('sglt2i') || m.classes.has('biguanide') || m.classes.has('acei') || m.classes.has('arb') || m.classes.has('thiazide') || m.classes.has('loop') || m.classes.has('nsaid'));
  if (sickDrugs.length || meds.some((m) => m.classes.has('insulin'))) {
    doc.append(T('h2', '', L.sickT));
    doc.append(T('p', '', `${L.sick}${sickDrugs.map((m) => m.drug.name).join('، ') || '—'}.${meds.some((m) => m.classes.has('insulin')) ? ' ' + L.sickInsulin : ''}`));
  }
  const t = c.targets;
  if (t.fpg || t.ppg) doc.append(T('h2', '', L.targets), T('p', '', `${L.fasting}: ${t.fpg ? t.fpg.join(' – ') : '—'} • ${L.post} ${t.ppg ?? '—'}`));
  const tasks = openTasks(ctx.state, { patientId: p.id, today });
  const next = tasks.find((x) => x.type === 'visit');
  const labs = tasks.filter((x) => x.type === 'lab').flatMap((x) => x.tests || []);
  if (next?.due) doc.append(T('h2', '', L.next), T('p', '', F.date(next.due)));
  if (labs.length) doc.append(T('h2', '', L.labs), h('p', { dir: 'ltr', text: [...new Set(labs)].map((x) => labTest(ctx.state, x)?.abbr).join(' • ') }));
  doc.append(T('p', 'pd-foot', L.call));
  return doc;
}

// ---------- تقارير عامة + Excel ----------
export function reportsScreen() {
  const today = ctx.today();
  const patients = listEntities(ctx.state, 'patient');
  const active = patients.filter((p) => (p.status || 'active') === 'active');
  const body = h('div', {});
  const ctxs = active.map((p) => patientContext(ctx.state, p.id, today));
  const withA1c = ctxs.filter((c) => c.f.a1c !== undefined);
  const atTarget = withA1c.filter((c) => c.targets.a1c && c.f.a1c <= c.targets.a1c);
  body.append(h('div', { class: 'stats' }, stat('المرضى المتابعين', F.int(active.length)), stat('عندهم HbA1c حديث', F.int(withA1c.length)), stat('على الهدف', withA1c.length ? F.pct((atTarget.length / withA1c.length) * 100) : '—', { valueClass: 'pos' }), stat('HbA1c ≥ 9', F.int(withA1c.filter((c) => c.f.a1c >= 9).length), { valueClass: 'neg' })));
  const countBy = (arr, keyFn, labelFn) => {
    const m = new Map();
    for (const x of arr) {
      const k = keyFn(x) || '—';
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => [labelFn(k), F.int(n)]);
  };
  body.append(sectionTitle('حسب المصدر'), table([{ label: 'المصدر' }, { label: 'عدد', num: true }], countBy(active, (p) => p.sourceId, (k) => sourceName(k) || '—')));
  body.append(sectionTitle('حسب نوع السكر'), table([{ label: 'النوع' }, { label: 'عدد', num: true }], countBy(active, (p) => p.dm?.type, (k) => DM_TYPES.find((t) => t.id === k)?.ar || '—')));
  const condCount = new Map();
  for (const c of ctxs) for (const code of c.conds.keys()) condCount.set(code, (condCount.get(code) || 0) + 1);
  if (condCount.size) body.append(sectionTitle('الحالات المصاحبة'), table([{ label: 'الحالة' }, { label: 'عدد', num: true }], [...condCount.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => [ctxs.find((x) => x.conds.has(k)).conds.get(k).def.ar, F.int(n)])));
  // المتابعات الدورية المتأخرة
  const overdue = new Map();
  for (const c of ctxs) for (const s of screeningFor(ctx.state, c, today)) if (s.status === 'overdue' || s.status === 'never') overdue.set(s.item.title, (overdue.get(s.item.title) || 0) + 1);
  if (overdue.size) body.append(sectionTitle('متابعات دورية متأخرة'), table([{ label: 'البند' }, { label: 'مرضى', num: true }], [...overdue.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, F.int(n)])));
  body.append(sectionTitle('تصدير Excel'), h('p', { class: 'muted small', text: 'ملف فيه: المرضى، آخر التحاليل، كل نتائج التحاليل، العلاج، المتابعات، والمنتظر. الملف فيه بيانات مرضى — احفظه في مكان آمن.' }), h('button', { type: 'button', class: 'btn primary block', text: 'تصدير Excel', onclick: () => exportExcel() }));
  return { title: 'التقارير', body };
}

async function exportExcel() {
  const today = ctx.today();
  const st = ctx.state;
  const patients = listEntities(st, 'patient');
  const sheetPatients = [['ID', 'الاسم', 'النوع', 'السن', 'التليفون', 'العنوان', 'المصدر', 'مصدر المعرفة', 'نوع السكر', 'مدة السكر', 'بداية المتابعة', 'الحالة', 'HbA1c', 'eGFR', 'UACR', 'BMI', 'LDL', 'الحالات المصاحبة', 'العلاج الحالي', 'آخر متابعة']];
  const sheetLabs = [['ID', 'الاسم', 'التاريخ', 'التحليل', 'القيمة', 'الوحدة', 'القيمة بالوحدة الأساسية']];
  const sheetMeds = [['ID', 'الاسم', 'الدواء', 'المادة الفعالة', 'الحدث', 'التاريخ', 'الجرعة', 'السبب']];
  const sheetVisits = [['ID', 'الاسم', 'التاريخ', 'الشكوى', 'الوزن', 'الضغط', 'التقييم', 'الخطة']];
  const sheetTasks = [['ID', 'الاسم', 'النوع', 'المطلوب', 'الميعاد', 'الحالة']];
  for (const p of patients) {
    const c = patientContext(st, p.id, today);
    const lv = lastVisit(st, p.id);
    sheetPatients.push([p.id, p.name, p.sex === 'F' ? 'أنثى' : 'ذكر', c.age ?? '', p.phone || '', p.address || '', sourceName(p.sourceId), p.referral || '', DM_TYPES.find((t) => t.id === p.dm?.type)?.label || '', dmSinceDate(p) ? durationText(dmSinceDate(p), today) : '', fuzzyText(p.followStart), p.status || 'active', c.f.a1c ?? '', c.f.egfr !== undefined ? Math.round(c.f.egfr) : '', c.f.uacr !== undefined ? Math.round(c.f.uacr) : '', c.bmi ? Math.round(c.bmi * 10) / 10 : '', c.f.ldl !== undefined ? Math.round(c.f.ldl) : '', [...c.conds.values()].map((x) => x.def.label).join('; '), c.meds.map((m) => `${medTitle(m)}: ${doseText(st, m, m.dose, { lang: 'en' })}`).join(' | '), lv ? lv.date : '']);
    for (const r of labResults(st, p.id)) {
      const t = labTest(st, r.test);
      sheetLabs.push([p.id, p.name, r.date, t?.abbr || r.test, r.t ?? r.raw, r.unit || t?.unit || '', r.v ?? '']);
    }
    for (const m of medList(st, p.id)) for (const x of m.history) sheetMeds.push([p.id, p.name, medTitle(m), genericNames(st, m), { start: m.prior ? 'كان بياخده' : 'بدء', change: 'تعديل', stop: 'إيقاف' }[x.kind], x.kind === 'start' && m.datePrecision === 'unknown' ? '' : x.date, x.dose ? doseText(st, m, x.dose, { lang: 'en' }) : '', x.reason || '']);
    for (const v of patientEntries(st, p.id, 'visit')) sheetVisits.push([p.id, p.name, v.date, v.complaint || '', v.vitals?.weight ?? '', v.vitals?.sbp ? `${v.vitals.sbp}/${v.vitals.dbp ?? ''}` : '', v.assessment || '', v.plan || '']);
  }
  for (const t of listEntities(st, 'task')) {
    const p = t.patientId ? entity(st, 'patient', t.patientId) : null;
    sheetTasks.push([t.patientId || '', p?.name || '', t.type, t.type === 'lab' ? (t.tests || []).map((x) => labTest(st, x)?.abbr).join(', ') : t.title || '', t.due || '', t.status || 'open']);
  }
  const bytes = buildXlsx([
    { name: 'المرضى', rows: sheetPatients },
    { name: 'التحاليل', rows: sheetLabs },
    { name: 'العلاج', rows: sheetMeds },
    { name: 'المتابعات', rows: sheetVisits },
    { name: 'المنتظر', rows: sheetTasks },
  ]);
  const res = await saveFile(`mutabaati-${today}.xlsx`, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  if (res !== 'cancelled') toast('تم تجهيز ملف Excel');
}
