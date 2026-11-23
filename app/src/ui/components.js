// مكوّنات الواجهة المشتركة: نافذة سفلية، تأكيد، إشعار، حقول، قوائم، جداول، حفظ ملف.
import { h, icon, clear } from './dom.js';
import { ctx } from './ctx.js';
import { normalizeDigits, parseNum, plainNum } from '../core/num.js';

// ---------- إشعار ----------
let toastTimer = null;
export function toast(message, kind = '') {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = h('div', { class: `toast ${kind}`, role: 'status', text: message });
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), kind === 'bad' ? 4500 : 2200);
}

// ---------- نافذة سفلية ----------
const openSheets = [];
export function openSheet(title, build, { onClose = null, wide = false } = {}) {
  const body = h('div', { class: 'sheet-body' });
  const backdrop = h('div', { class: 'sheet-backdrop', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const close = (result) => {
    const i = openSheets.indexOf(entry);
    if (i < 0) return;
    openSheets.splice(i, 1);
    backdrop.remove();
    if (onClose) onClose(result);
  };
  const entry = { close };
  const sheet = h('div', { class: `sheet ${wide ? 'wide' : ''}` }, h('div', { class: 'sheet-head' }, h('h2', { text: title }), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'إغلاق', onclick: () => close() }, icon('close'))), body);
  backdrop.append(sheet);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.body.append(backdrop);
  openSheets.push(entry);
  build(body, close);
  return close;
}
export function closeAllSheets() {
  while (openSheets.length) openSheets[openSheets.length - 1].close();
}

// ---------- تأكيد (مع حقل نص اختياري) ----------
export function confirmDialog({ title, message = '', okText = 'تأكيد', cancelText = 'رجوع', danger = false, input = null }) {
  return new Promise((resolve) => {
    let fieldEl = null;
    const err = h('div', { class: 'form-error', style: { display: 'none' } });
    const done = (v) => {
      backdrop.remove();
      resolve(v);
    };
    const ok = () => {
      if (input) {
        const v = fieldEl.value.trim();
        if (input.required && !v) {
          err.textContent = input.requiredMessage || 'هذا الحقل مطلوب';
          err.style.display = '';
          return;
        }
        done(v || true);
      } else done(true);
    };
    const dialog = h(
      'div',
      { class: 'dialog' },
      h('h2', { text: title }),
      message ? h('p', { text: message }) : null,
      err,
      input ? h('div', { class: 'field' }, h('label', { text: input.label }), (fieldEl = h('input', { type: 'text', value: input.value || '', placeholder: input.placeholder || '' }))) : null,
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', text: cancelText, onclick: () => done(false) }), h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'button', text: okText, onclick: ok })),
    );
    const backdrop = h('div', { class: 'sheet-backdrop', role: 'alertdialog', 'aria-modal': 'true' }, dialog);
    document.body.append(backdrop);
    if (fieldEl) fieldEl.focus();
  });
}

// ---------- حقول ----------
let fieldSeq = 0;
export function field(label, control, hint = '') {
  const lab = h('label', { text: label });
  const input = control.matches?.('input,select,textarea') ? control : control.querySelector?.('input,select,textarea');
  if (input) {
    if (!input.id) input.id = `fld-${++fieldSeq}`;
    lab.htmlFor = input.id;
  }
  return h('div', { class: 'field' }, lab, control, hint ? h('div', { class: 'hint', text: hint }) : null);
}

// رقم عشري (نتيجة تحليل، جرعة، وزن). el.num() = رقم أو null، و NaN لو النص غير صالح.
export function numInput(value = null, { placeholder = '', cls = '' } = {}) {
  const el = h('input', { type: 'text', inputMode: 'decimal', autocomplete: 'off', class: `num-in ${cls}`, value: value === null || value === undefined ? '' : plainNum(value), placeholder, enterKeyHint: 'next' });
  el.dir = 'ltr';
  el.addEventListener('focus', () => setTimeout(() => el.select(), 0));
  el.num = () => {
    if (el.value.trim() === '') return null;
    const v = parseNum(el.value);
    return v === null ? NaN : v;
  };
  return el;
}
export function intInput(value = '') {
  const el = h('input', { type: 'text', inputMode: 'numeric', autocomplete: 'off', value: value ?? '' });
  el.dir = 'ltr';
  el.int = () => {
    const v = normalizeDigits(el.value).trim();
    return /^\d+$/.test(v) ? Number(v) : v === '' ? null : NaN;
  };
  return el;
}
export const textInput = (value = '', placeholder = '') => h('input', { type: 'text', value: value || '', placeholder, autocomplete: 'off' });
export const textArea = (value = '', placeholder = '', rows = 2) => h('textarea', { rows, placeholder }, value || '');
export const dateInput = (value, { empty = false } = {}) => h('input', { type: 'date', value: value === undefined ? (empty ? '' : ctx.today()) : value || '' });

export function selectInput(options, value = '', { placeholder = null } = {}) {
  const el = h('select', {});
  if (placeholder !== null) el.append(h('option', { value: '', text: placeholder }));
  for (const o of options) {
    if (o.group) {
      const g = h('optgroup', { label: o.group });
      for (const x of o.options) g.append(h('option', { value: x.value, text: x.label }));
      el.append(g);
    } else el.append(h('option', { value: o.value, text: o.label }));
  }
  el.value = value ?? '';
  if (el.selectedIndex < 0) el.selectedIndex = 0;
  return el;
}

export function checkbox(label, checked = false) {
  const input = h('input', { type: 'checkbox', checked });
  const el = h('label', { class: 'check' }, input, label);
  el.input = input;
  return el;
}

export function errorBox() {
  const el = h('div', { class: 'form-error', style: { display: 'none' }, role: 'alert' });
  el.show = (msg) => {
    el.textContent = msg;
    el.style.display = msg ? '' : 'none';
    if (msg) el.scrollIntoView({ block: 'nearest' });
  };
  return el;
}

// اختيار من أزرار (segmented). onchange(v).
export function segmented(options, value, onchange = () => {}) {
  const el = h('div', { class: 'seg', role: 'radiogroup' });
  el.value = value;
  const render = () => {
    clear(el);
    for (const o of options)
      el.append(
        h('button', {
          type: 'button',
          class: `seg-btn ${o.value === el.value ? 'on' : ''}`,
          role: 'radio',
          'aria-checked': o.value === el.value ? 'true' : 'false',
          text: o.label,
          onclick: () => {
            el.value = o.value;
            render();
            onchange(o.value);
            el.dispatchEvent(new Event('change'));
          },
        }),
      );
  };
  render();
  el.set = (v) => {
    el.value = v;
    render();
  };
  return el;
}

// ---------- عناصر العرض ----------
export function row({ title, subtitle = '', value = '', valueClass = '', badge = null, onclick = null, cls = '', end = null, dir = null }) {
  return h(
    onclick ? 'button' : 'div',
    { class: `row ${cls}`, onclick, type: onclick ? 'button' : null },
    h('div', { class: 'main' }, h('div', { class: 'title', text: title, dir }), subtitle ? (subtitle instanceof Node ? h('div', { class: 'subtitle' }, subtitle) : h('div', { class: 'subtitle', text: subtitle })) : null),
    h('div', { class: 'end' }, value !== '' ? h('div', { class: `value num ${valueClass}`, text: value }) : null, badge, end),
  );
}
export const badge = (text, kind = '') => h('span', { class: `badge ${kind}`, text });
export const empty = (text) => h('div', { class: 'empty', text });
export const list = (...rows) => h('div', { class: 'list' }, rows);
export const sectionTitle = (text, action = null) => h('div', { class: 'section-title' }, h('span', { text }), action);
export const kv = (k, v, cls = '') => h('div', { class: 'kv' }, h('span', { class: 'k', text: k }), h('span', { class: `v ${cls}` }, v ?? '—'));
export function stat(label, value, { hint = '', cls = '', onclick = null, valueClass = '' } = {}) {
  return h(onclick ? 'button' : 'div', { class: `stat ${cls}`, onclick, type: onclick ? 'button' : null }, h('div', { class: 'label', text: label }), h('div', { class: `value num ${valueClass}`, text: value }), hint ? h('div', { class: 'hint', text: hint }) : null);
}
export const card = (...children) => h('div', { class: 'card' }, children);
export const linkBtn = (text, onclick, cls = '') => h('button', { type: 'button', class: `btn small ${cls}`, text, onclick });

export function chips(options, value, onchange, { multi = false } = {}) {
  const el = h('div', { class: 'chips', role: multi ? 'group' : 'tablist' });
  let cur = multi ? new Set(value || []) : value;
  const render = () => {
    clear(el);
    for (const o of options) {
      const on = multi ? cur.has(o.value) : o.value === cur;
      el.append(
        h('button', {
          type: 'button',
          class: `chip ${on ? 'on' : ''}`,
          text: o.label,
          'aria-pressed': on ? 'true' : 'false',
          onclick: () => {
            if (multi) {
              if (cur.has(o.value)) cur.delete(o.value);
              else cur.add(o.value);
            } else cur = o.value;
            render();
            onchange(multi ? [...cur] : cur);
          },
        }),
      );
    }
  };
  render();
  el.values = () => (multi ? [...cur] : cur);
  return el;
}

// قائمة اختيار ببحث. items: [{id, title, subtitle, badge}] — يعيد المعرّف المختار أو null.
export function pickFromList({ title, items, placeholder = 'بحث…', emptyText = 'لا يوجد', extra = null }) {
  return new Promise((resolve) => {
    let picked = null;
    openSheet(
      title,
      (body, close) => {
        const search = h('input', { class: 'search', type: 'search', placeholder, 'aria-label': 'بحث' });
        const box = h('div', {});
        const render = () => {
          const q = search.value.trim().toLowerCase();
          const shown = items.filter((it) => !q || `${it.title} ${it.subtitle || ''} ${it.keywords || ''}`.toLowerCase().includes(q)).slice(0, 200);
          clear(box);
          if (!shown.length) box.append(empty(emptyText));
          else
            box.append(
              list(
                shown.map((it) =>
                  row({
                    title: it.title,
                    subtitle: it.subtitle,
                    badge: it.badge || null,
                    dir: it.dir || null,
                    onclick: () => {
                      picked = it.id;
                      close();
                    },
                  }),
                ),
              ),
            );
        };
        search.addEventListener('input', render);
        body.append(search, extra ? extra(close, (v) => (picked = v)) : null, box);
        render();
        setTimeout(() => search.focus(), 50);
      },
      { onClose: () => resolve(picked) },
    );
  });
}

// جدول: columns [{label, num?, cls?}] و rows مصفوفات (نص أو عنصر).
export function table(columns, rows, { cls = '', dir = null } = {}) {
  const t = h('table', { class: `report ${cls}` });
  if (dir) t.dir = dir;
  t.append(h('thead', {}, h('tr', {}, columns.map((c) => h('th', { class: `${c.num ? 'n' : ''} ${c.cls || ''}`, text: c.label })))));
  const tb = h('tbody', {});
  for (const r of rows) tb.append(h('tr', { class: r.cls || '' }, (r.cells || r).map((cell, i) => h('td', { class: `${columns[i]?.num ? 'n num' : ''} ${cell?.cls || ''}` }, cell?.node || (cell instanceof Node ? cell : cell?.text ?? cell ?? '')))));
  t.append(tb);
  return h('div', { class: 'table-wrap' }, t);
}

// حفظ ملف على الجهاز: مشاركة iOS إن أمكن، وإلا تنزيل عادي.
export async function saveFile(filename, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  try {
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 4000);
  return 'downloaded';
}
