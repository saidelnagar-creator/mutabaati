// هيكل التطبيق: التنقل بالـ hash، الشريط العلوي والسفلي، إعادة الرسم عند تغيّر البيانات، قفل PIN.
import { h, icon, clear } from './dom.js';
import { ctx } from './ctx.js';
import { closeAllSheets } from './components.js';
import { RULES } from '../config/rules.js';
import { APP_NAME } from '../config/version.js';
import { normalizeDigits } from '../core/num.js';
import { pinMatches, makePinRecord } from './pin.js';
import { homeScreen, patientsScreen, tasksScreen } from './screens/patients.js';
import { patientScreen } from './screens/patient.js';
import { libraryScreen, genericScreen, productScreen } from './screens/library.js';
import { calcListScreen, calcScreen } from './screens/calc.js';
import { rulesScreen, ruleScreen } from './screens/rules.js';
import { moreScreen, settingsScreen, sourcesScreen, screeningScreen, labsCatalogScreen, aboutScreen, helpScreen } from './screens/more.js';
import { backupScreen } from './screens/backup.js';
import { reportScreen, reportsScreen } from './screens/reports.js';

// [مسار، شاشة، التبويب]
const ROUTES = [
  [/^\/?$/, homeScreen, 'home'],
  [/^\/patients$/, patientsScreen, 'patients'],
  [/^\/patient\/([^/]+)$/, (m) => patientScreen({ id: m[1] }), 'patients'],
  [/^\/patient\/([^/]+)\/([a-z]+)$/, (m) => patientScreen({ id: m[1], tab: m[2] }), 'patients'],
  [/^\/report\/([^/]+)$/, (m) => reportScreen({ id: m[1] }), 'patients'],
  [/^\/tasks$/, tasksScreen, 'home'],
  [/^\/library$/, libraryScreen, 'library'],
  [/^\/drug\/g\/([^/]+)$/, (m) => genericScreen({ id: m[1] }), 'library'],
  [/^\/drug\/p\/([^/]+)$/, (m) => productScreen({ id: m[1] }), 'library'],
  [/^\/calc$/, calcListScreen, 'calc'],
  [/^\/calc\/([^/]+)$/, (m) => calcScreen({ id: m[1] }), 'calc'],
  [/^\/rules$/, rulesScreen, 'more'],
  [/^\/rule\/([^/]+)$/, (m) => ruleScreen({ id: m[1] }), 'more'],
  [/^\/more$/, moreScreen, 'more'],
  [/^\/settings$/, settingsScreen, 'more'],
  [/^\/sources$/, sourcesScreen, 'more'],
  [/^\/screening$/, screeningScreen, 'more'],
  [/^\/labs-catalog$/, labsCatalogScreen, 'more'],
  [/^\/backup$/, backupScreen, 'more'],
  [/^\/reports$/, reportsScreen, 'more'],
  [/^\/about$/, aboutScreen, 'more'],
  [/^\/help$/, helpScreen, 'more'],
];

const TABS = [
  ['#/', 'home', 'الرئيسية', 'home'],
  ['#/patients', 'users', 'المرضى', 'patients'],
  ['#/library', 'pill', 'الأدوية', 'library'],
  ['#/calc', 'calc', 'الحاسبات', 'calc'],
  ['#/more', 'more', 'المزيد', 'more'],
];

let root;
let lastPath = null;
let updateBanner = null;

const currentPath = () => (location.hash || '#/').slice(1).split('?')[0] || '/';

function render() {
  const path = currentPath();
  const samePage = path === lastPath;
  const scroll = samePage ? window.scrollY : 0;
  let match = null;
  for (const [re, fn, tab] of ROUTES) {
    const m = path.match(re);
    if (m) {
      match = { fn: () => fn(m), tab };
      break;
    }
  }
  let screen;
  try {
    screen = match ? match.fn() : { title: 'غير موجود', body: h('div', { class: 'empty', text: 'الصفحة غير موجودة' }) };
  } catch (e) {
    console.error(e);
    screen = { title: 'خطأ', body: h('div', { class: 'banner bad', text: 'حدث خطأ أثناء عرض الصفحة: ' + e.message }) };
  }
  const top = h(
    'header',
    { class: 'topbar no-print' },
    screen.root ? null : h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'رجوع', onclick: () => ctx.back() }, icon('back')),
    h('h1', {}, screen.title, screen.subtitle ? h('div', { class: 'sub', text: screen.subtitle }) : null),
    ctx.store.meta.pin ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'قفل الآن', onclick: () => lockScreen(render) }, icon('lock')) : null,
  );
  const main = h('main', { class: 'screen', id: 'screen' }, updateBanner, screen.body);
  const tabs = h(
    'nav',
    { class: 'tabbar no-print', 'aria-label': 'التنقل الرئيسي' },
    TABS.map(([href, ic, label, key]) => h('a', { href, class: match && match.tab === key ? 'active' : '', 'aria-current': match && match.tab === key ? 'page' : null }, icon(ic), h('span', { text: label }))),
  );
  clear(root);
  root.append(top, main);
  if (screen.fab) root.append(h('button', { type: 'button', class: 'fab no-print', onclick: screen.fab.onclick }, icon('plus', 20), screen.fab.label));
  root.append(tabs);
  document.title = `${screen.title} — ${APP_NAME}`;
  lastPath = path;
  window.scrollTo(0, scroll);
}

export function showUpdateBanner(onApply) {
  updateBanner = h('div', { class: 'banner info no-print' }, h('span', { class: 'grow', text: 'يوجد تحديث جديد للتطبيق (بياناتك لا تتأثر).' }), h('button', { type: 'button', class: 'btn small', text: 'تحديث الآن', onclick: onApply }));
  if (root && !document.querySelector('.lock')) render();
}

// ---------- قفل PIN ----------
// بعد 5 محاولات خاطئة يُفرض انتظار يتضاعف (30 ثانية ← … ← 15 دقيقة). العدّاد محفوظ فلا يصفّره إغلاق التطبيق.
const LOCK_AFTER = 5;
const lockDelay = (fails) => Math.min(15 * 60, 30 * 2 ** (fails - LOCK_AFTER)) * 1000;
let lockedAt = 0;

function lockScreen(onUnlock) {
  const store = ctx.store;
  const pin = store.meta.pin;
  let entered = '';
  let busy = false;
  let tickTimer = null;
  const dots = h('div', { class: 'pin-dots' });
  const msg = h('div', { class: 'muted', role: 'status', text: 'أدخل رقم القفل' });
  const guard = () => store.meta.pinGuard || { fails: 0, until: 0 };
  const waitMs = () => Math.max(0, (guard().until || 0) - Date.now());
  const draw = () => {
    clear(dots);
    for (let i = 0; i < Math.max(pin.len || 4, entered.length); i++) dots.append(h('span', { class: i < entered.length ? 'on' : '' }));
  };
  const showWait = () => {
    clearInterval(tickTimer);
    const update = () => {
      const ms = waitMs();
      if (ms <= 0) {
        clearInterval(tickTimer);
        msg.textContent = 'أدخل رقم القفل';
        return;
      }
      msg.textContent = `محاولات خاطئة كثيرة — انتظر ${Math.ceil(ms / 1000)} ثانية`;
    };
    update();
    tickTimer = setInterval(update, 1000);
  };
  const finish = () => {
    clearInterval(tickTimer);
    document.removeEventListener('keydown', onKey);
    onUnlock();
  };
  const submit = async () => {
    if (busy || waitMs() > 0) return;
    busy = true;
    if (pinMatches(pin, entered)) {
      if (guard().fails) await store.setMeta('pinGuard', undefined);
      busy = false;
      return finish();
    }
    const fails = guard().fails + 1;
    await store.setMeta('pinGuard', { fails, until: fails >= LOCK_AFTER ? Date.now() + lockDelay(fails) : 0 });
    entered = '';
    busy = false;
    draw();
    if (waitMs() > 0) showWait();
    else msg.textContent = `رقم غير صحيح (${fails} من ${LOCK_AFTER} قبل الانتظار)`;
  };
  const press = (k) => {
    if (busy || waitMs() > 0) return;
    if (k === 'del') entered = entered.slice(0, -1);
    else if (entered.length < 8) entered += k;
    draw();
    if (entered.length === (pin.len || 4)) submit();
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  const pad = h('div', { class: 'keypad' }, keys.map((k) => (k === '' ? h('span', {}) : h('button', { type: 'button', text: k === 'del' ? '⌫' : k, 'aria-label': k === 'del' ? 'مسح' : k, onclick: () => press(k) }))));
  function onKey(e) {
    const d = normalizeDigits(e.key);
    if (/^\d$/.test(d)) press(d);
    else if (e.key === 'Backspace') press('del');
  }
  document.addEventListener('keydown', onKey);
  closeAllSheets();
  clear(root);
  root.append(h('div', { class: 'lock' }, h('div', { class: 'boot-logo', text: APP_NAME }), msg, dots, pad));
  draw();
  if (waitMs() > 0) showWait();
}

export { makePinRecord };

export function startApp(store) {
  root = document.getElementById('app');
  ctx.store = store;
  ctx.refresh = () => {
    if (!document.querySelector('.lock')) render();
  };
  store.subscribe(() => ctx.refresh());
  window.addEventListener('hashchange', () => {
    closeAllSheets();
    ctx.refresh();
  });
  if (store.meta.pin) lockScreen(render);
  else render();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) lockedAt = Date.now();
    else if (store.meta.pin && lockedAt && Date.now() - lockedAt > RULES.pinLockMinutes * 60000 && !document.querySelector('.lock')) lockScreen(render);
  });
}
