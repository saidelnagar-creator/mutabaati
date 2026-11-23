// سياق الواجهة المشترك: المخزن، التنسيق، التنقل. يُملأ في app.js.
import { monthLabel, todayISO, ymOf } from '../core/util.js';
import { fmtNum } from '../core/num.js';

export const ctx = {
  store: null,
  get state() {
    return this.store.state;
  },
  get arabic() {
    return this.state.settings.digits === 'arab';
  },
  today: () => todayISO(),
  nowMonth: () => ymOf(todayISO()),
  nav(path) {
    location.hash = path;
  },
  back() {
    if (history.length > 1) history.back();
    else location.hash = '#/';
  },
  refresh: () => {},
  run: (fn) => ctx.store.run(fn),
};

const digits = (s) => (ctx.store && ctx.arabic ? String(s).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]) : String(s));

export const F = {
  num: (n, dp = 1) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : digits(fmtNum(n, dp))),
  int: (n) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : digits(String(Math.round(n)))),
  pct: (x, dp = 0) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : digits(`${fmtNum(x, dp)}%`)),
  date: (iso) => (iso ? digits(`${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`) : ''),
  dateShort: (iso) => (iso ? digits(`${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`) : ''),
  month: (ym) => (ym ? digits(monthLabel(ym)) : '—'),
  dateTime: (ts) => {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return digits(`${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`);
  },
  digits,
};
