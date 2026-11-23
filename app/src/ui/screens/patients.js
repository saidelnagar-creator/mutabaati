// الرئيسية وقائمة المرضى: البحث، الفلاتر (المصدر، نوع السكر، الحالات، التنبيهات)، المواعيد المنتظرة.
import { h, clear, icon } from '../dom.js';
import { ctx, F } from '../ctx.js';
import { badge, chips, empty, list, row, sectionTitle, stat } from '../components.js';
import { patientForm, sources, finishTask } from '../forms-patient.js';
import { taskForm } from '../forms-patient.js';
import { collator, patientSubtitle } from '../widgets.js';
import { listEntities } from '../../core/state.js';
import { openTasks, TASK_TYPES, lastVisit } from '../../core/followup.js';
import { patientContext } from '../../core/patient.js';
import { evaluateAlerts } from '../../core/alerts.js';
import { labTest } from '../../core/catalog.js';
import { LEVELS } from '../../config/catalog/alerts.js';
import { DM_TYPES, CONDITIONS } from '../../config/catalog/conditions.js';
import { RULES } from '../../config/rules.js';
import { addDays, cmp } from '../../core/util.js';

const filters = { q: '', source: 'all', dm: 'all', cond: 'all', status: 'active', sort: 'name' };

function matchQuery(p, q) {
  if (!q) return true;
  const s = q.trim().toLowerCase();
  return `${p.name} ${p.phone || ''} ${p.address || ''} ${p.referral || ''}`.toLowerCase().includes(s);
}

export function patientsScreen() {
  const all = listEntities(ctx.state, 'patient');
  const body = h('div', {});
  const search = h('input', { class: 'search', type: 'search', placeholder: 'بحث بالاسم أو التليفون أو البلد…', value: filters.q, 'aria-label': 'بحث' });
  const box = h('div', {});
  const condSet = new Map();
  for (const c of listEntities(ctx.state, 'condition')) if (!c.until || c.until > ctx.today()) (condSet.get(c.patientId) || condSet.set(c.patientId, new Set()).get(c.patientId)).add(c.code);
  const render = () => {
    clear(box);
    let ps = all.filter((p) => matchQuery(p, filters.q));
    if (filters.source !== 'all') ps = ps.filter((p) => p.sourceId === filters.source);
    if (filters.dm !== 'all') ps = ps.filter((p) => p.dm?.type === filters.dm);
    if (filters.cond !== 'all') ps = ps.filter((p) => condSet.get(p.id)?.has(filters.cond));
    if (filters.status !== 'all') ps = ps.filter((p) => (p.status || 'active') === filters.status);
    const lv = new Map(ps.map((p) => [p.id, lastVisit(ctx.state, p.id)?.date || '']));
    ps.sort((a, b) => (filters.sort === 'recent' ? cmp(lv.get(b.id), lv.get(a.id)) : filters.sort === 'new' ? cmp(b.createdAt || '', a.createdAt || '') : collator.compare(a.name, b.name)));
    box.append(h('div', { class: 'muted small', text: `${F.int(ps.length)} مريض` }));
    box.append(ps.length ? list(ps.slice(0, 500).map((p) => row({ title: p.name, subtitle: `${patientSubtitle(p)}${lv.get(p.id) ? ` • آخر متابعة ${F.date(lv.get(p.id))}` : ''}`, onclick: () => ctx.nav(`#/patient/${p.id}`) }))) : empty(all.length ? 'مفيش نتائج' : 'لسه مفيش مرضى — اضغط «مريض جديد»'));
  };
  search.addEventListener('input', () => {
    filters.q = search.value;
    render();
  });
  const srcOpts = [{ value: 'all', label: 'كل المصادر' }, ...sources().map((s) => ({ value: s.id, label: s.name }))];
  const dmOpts = [{ value: 'all', label: 'كل الأنواع' }, ...DM_TYPES.filter((t) => all.some((p) => p.dm?.type === t.id)).map((t) => ({ value: t.id, label: t.ar }))];
  const usedConds = new Set([...condSet.values()].flatMap((s) => [...s]));
  const condOpts = [{ value: 'all', label: 'كل الحالات' }, ...CONDITIONS.filter((c) => usedConds.has(c.id)).map((c) => ({ value: c.id, label: c.ar }))];
  body.append(
    search,
    h('details', { class: 'more filters' }, h('summary', { text: 'فلترة وترتيب' }),
      chips(srcOpts, filters.source, (v) => ((filters.source = v), render())),
      chips(dmOpts, filters.dm, (v) => ((filters.dm = v), render())),
      condOpts.length > 1 ? chips(condOpts, filters.cond, (v) => ((filters.cond = v), render())) : null,
      chips([{ value: 'active', label: 'المتابعين' }, { value: 'inactive', label: 'المنقطعين' }, { value: 'all', label: 'الكل' }], filters.status, (v) => ((filters.status = v), render())),
      chips([{ value: 'name', label: 'بالاسم' }, { value: 'recent', label: 'آخر متابعة' }, { value: 'new', label: 'الأحدث تسجيلاً' }], filters.sort, (v) => ((filters.sort = v), render())),
    ),
    box,
  );
  render();
  return { title: 'المرضى', root: true, body, fab: { label: 'مريض جديد', onclick: () => patientForm(null, { onSaved: (p) => ctx.nav(`#/patient/${p.id}`) }) } };
}

export function taskRowHome(t) {
  const p = t.patientId ? ctx.state.entities.get('patient')?.get(t.patientId) : null;
  const what = t.type === 'lab' ? `تحاليل: ${(t.tests || []).map((x) => labTest(ctx.state, x)?.abbr).join('، ')}` : t.title || TASK_TYPES[t.type];
  const lv = { overdue: ['متأخر', 'bad'], today: ['النهارده', 'warn'], upcoming: ['قادم', 'info'], nodate: ['بدون ميعاد', ''] }[t.level];
  return row({
    title: p ? p.name : what,
    subtitle: `${p ? what + ' • ' : ''}${t.due ? F.date(t.due) : ''}`,
    badge: badge(lv[0], lv[1]),
    onclick: () => (p ? ctx.nav(`#/patient/${p.id}/pending`) : taskForm(null, t)),
    end: h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'تم', onclick: (e) => (e.stopPropagation(), finishTask(t)) }, icon('check', 18)),
  });
}

export function homeScreen() {
  const today = ctx.today();
  const store = ctx.store;
  const body = h('div', {});
  if (store.backupDue()) body.append(h('div', { class: 'banner warn' }, h('span', { class: 'grow', text: `في ${F.int(store.unsavedChanges())} تغيير مش في أي نسخة احتياطية.` }), h('button', { type: 'button', class: 'btn small', text: 'نسخ الآن', onclick: () => ctx.nav('#/backup') })));
  const search = h('input', { class: 'search', type: 'search', placeholder: 'ابحث عن مريض…', 'aria-label': 'بحث عن مريض' });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      filters.q = search.value;
      ctx.nav('#/patients');
    }
  });
  const results = h('div', {});
  search.addEventListener('input', () => {
    clear(results);
    const q = search.value.trim();
    if (!q) return;
    const ps = listEntities(ctx.state, 'patient').filter((p) => matchQuery(p, q)).slice(0, 8);
    results.append(ps.length ? list(ps.map((p) => row({ title: p.name, subtitle: patientSubtitle(p), onclick: () => ctx.nav(`#/patient/${p.id}`) }))) : empty('مفيش نتائج'));
  });
  body.append(search, results);
  const patients = listEntities(ctx.state, 'patient');
  const active = patients.filter((p) => (p.status || 'active') === 'active');
  const tasks = openTasks(ctx.state, { today, horizon: RULES.upcomingDays });
  const visits = tasks.filter((t) => t.type === 'visit');
  const labsDue = tasks.filter((t) => t.type === 'lab' && t.due && t.due <= today);
  body.append(h('div', { class: 'stats' }, stat('المرضى المتابعين', F.int(active.length), { onclick: () => ctx.nav('#/patients') }), stat('مواعيد متأخرة/النهارده', F.int(visits.filter((t) => t.level !== 'upcoming').length), { valueClass: visits.some((t) => t.level === 'overdue') ? 'neg' : '' }), stat('نتائج منتظرة حان ميعادها', F.int(labsDue.length), { valueClass: labsDue.length ? 'neg' : '' })));
  body.append(sectionTitle(`المنتظر خلال ${F.int(RULES.upcomingDays)} يوم`, h('button', { type: 'button', class: 'btn small', text: 'الكل', onclick: () => ctx.nav('#/tasks') })));
  body.append(tasks.length ? list(tasks.slice(0, 15).map(taskRowHome)) : empty('مفيش مواعيد أو نتائج منتظرة'));
  // أهم التنبيهات عبر المرضى (ممنوع/تجنّب/تعديل جرعة) — للمرضى المتابعين
  const urgent = [];
  for (const p of active.slice(0, 400)) {
    const c = patientContext(ctx.state, p.id, today);
    for (const a of evaluateAlerts(ctx.state, c)) if (!a.ack && LEVELS[a.level].order <= 2) urgent.push({ p, a });
  }
  if (urgent.length) {
    body.append(sectionTitle(`تنبيهات علاج مهمة (${F.int(urgent.length)})`));
    body.append(list(urgent.slice(0, 10).map(({ p, a }) => row({ title: p.name, subtitle: `${a.title}${a.medTitle ? ` — ${a.medTitle}` : ''}`, badge: badge(LEVELS[a.level].ar, LEVELS[a.level].cls), onclick: () => ctx.nav(`#/patient/${p.id}`) }))));
  }
  const recent = patients
    .map((p) => ({ p, d: lastVisit(ctx.state, p.id)?.date || p.createdAt?.slice(0, 10) || '' }))
    .sort((a, b) => cmp(b.d, a.d))
    .slice(0, 6);
  if (recent.length) {
    body.append(sectionTitle('آخر المرضى'));
    body.append(list(recent.map(({ p, d }) => row({ title: p.name, subtitle: `${patientSubtitle(p)} • ${F.date(d)}`, onclick: () => ctx.nav(`#/patient/${p.id}`) }))));
  }
  return { title: 'متابعاتي', root: true, body, fab: { label: 'مريض جديد', onclick: () => patientForm(null, { onSaved: (p) => ctx.nav(`#/patient/${p.id}`) }) } };
}

export function tasksScreen() {
  const today = ctx.today();
  const tasks = openTasks(ctx.state, { today });
  const body = h('div', {});
  for (const [lvl, label] of [
    ['overdue', 'متأخر'],
    ['today', 'النهارده'],
    ['upcoming', 'قادم'],
    ['nodate', 'بدون ميعاد'],
  ]) {
    const ts = tasks.filter((t) => t.level === lvl);
    if (!ts.length) continue;
    body.append(sectionTitle(`${label} (${F.int(ts.length)})`), list(ts.map(taskRowHome)));
  }
  if (!tasks.length) body.append(empty('مفيش حاجة منتظرة'));
  return { title: 'المنتظر', body, fab: { label: 'منتظر', onclick: () => taskForm(null) } };
}

export { addDays };
