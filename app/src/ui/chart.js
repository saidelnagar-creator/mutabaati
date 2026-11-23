// رسم بياني خطي صغير بـ SVG (بلا مكتبات، عناصر DOM فقط): نقاط بالتاريخ + نطاق مرجعي/هدف اختياري.
import { h } from './dom.js';
import { F } from './ctx.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) e.setAttribute(k, v);
  return e;
};
const t = (iso) => Date.parse(iso + 'T00:00:00Z');

// series: [{ points: [{x:'YYYY-MM-DD', y}], cls }]. band: {lo, hi} نطاق مقبول. lines: [{y, cls}] خطوط أفقية.
export function lineChart({ series, band = null, lines = [], height = 150, dp = 1, title = '' }) {
  const W = 340;
  const H = height;
  const pad = { l: 34, r: 10, t: 10, b: 20 };
  const pts = series.flatMap((s) => s.points).filter((p) => typeof p.y === 'number');
  if (!pts.length) return h('div', { class: 'empty small', text: 'لا توجد قيم للرسم' });
  const xs = pts.map((p) => t(p.x));
  let x0 = Math.min(...xs);
  let x1 = Math.max(...xs);
  if (x0 === x1) {
    x0 -= 86400000 * 15;
    x1 += 86400000 * 15;
  }
  const ys = [...pts.map((p) => p.y), ...(band ? [band.lo, band.hi].filter((v) => typeof v === 'number') : []), ...lines.map((l) => l.y)];
  let y0 = Math.min(...ys);
  let y1 = Math.max(...ys);
  if (y0 === y1) {
    y0 -= 1;
    y1 += 1;
  }
  const span = y1 - y0;
  y0 -= span * 0.08;
  y1 += span * 0.08;
  const X = (iso) => pad.l + ((t(iso) - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': title || 'رسم بياني' });
  if (band) {
    const lo = typeof band.lo === 'number' ? band.lo : y0;
    const hi = typeof band.hi === 'number' ? band.hi : y1;
    svg.append(el('rect', { x: pad.l, y: Y(Math.min(hi, y1)), width: W - pad.l - pad.r, height: Math.max(0, Y(Math.max(lo, y0)) - Y(Math.min(hi, y1))), class: 'band' }));
  }
  for (const l of lines) svg.append(el('line', { x1: pad.l, x2: W - pad.r, y1: Y(l.y), y2: Y(l.y), class: `hline ${l.cls || ''}` }));
  // محور y: أعلى وأسفل
  for (const v of [y1 - span * 0.08, y0 + span * 0.08]) {
    const tx = el('text', { x: pad.l - 4, y: Y(v) + 4, class: 'axis', 'text-anchor': 'end' });
    tx.textContent = F.num(v, dp);
    svg.append(tx);
  }
  // محور x: أول وآخر تاريخ
  const first = pts.reduce((a, b) => (a.x < b.x ? a : b)).x;
  const last = pts.reduce((a, b) => (a.x > b.x ? a : b)).x;
  for (const [iso, anchor] of [
    [first, 'start'],
    [last, 'end'],
  ]) {
    const tx = el('text', { x: X(iso), y: H - 4, class: 'axis', 'text-anchor': first === last ? 'middle' : anchor });
    tx.textContent = F.dateShort(iso);
    svg.append(tx);
  }
  for (const s of series) {
    const sp = s.points.filter((p) => typeof p.y === 'number').sort((a, b) => (a.x < b.x ? -1 : 1));
    if (sp.length > 1) svg.append(el('polyline', { points: sp.map((p) => `${X(p.x)},${Y(p.y)}`).join(' '), class: `line ${s.cls || ''}` }));
    for (const p of sp) {
      const c = el('circle', { cx: X(p.x), cy: Y(p.y), r: 3.5, class: `dot ${s.cls || ''} ${p.cls || ''}` });
      const tt = el('title');
      tt.textContent = `${F.date(p.x)}: ${F.num(p.y, dp)}`;
      c.append(tt);
      svg.append(c);
    }
  }
  return h('div', { class: 'chart-wrap', dir: 'ltr' }, svg);
}
