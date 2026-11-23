// تحويل الأرقام من/إلى النص: الأرقام العربية، الفاصلة العشرية العربية، والتقريب للعرض.
// القيم الطبية (نتائج تحاليل، جرعات) تُخزَّن أرقاماً كما أُدخلت (مقرّبة لـ 4 خانات) — لا تدخل في مجاميع محاسبية.
const AR = '٠١٢٣٤٥٦٧٨٩';
const FA = '۰۱۲۳۴۵۶۷۸۹';

export function normalizeDigits(s) {
  return String(s ?? '')
    .replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    .replace(/[٫،]/g, '.')
    .replace(/[٬\s]/g, '');
}

// نص ← رقم. يقبل 1.5 و ١٫٥ و ,5 (فاصلة أوروبية). null لو فاضي أو غير صالح.
export function parseNum(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  let s = normalizeDigits(input).trim();
  if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  s = s.replace(/,/g, '');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null;
}

// رقم ← نص للعرض بعدد خانات محدد (يشيل الأصفار الزايدة لو trim).
export function fmtNum(v, dp = 1, { trim = true } = {}) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const s = v.toFixed(Math.max(0, dp));
  return trim && s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

// عرض رقم كما أُدخل (بدون أصفار زايدة، بحد أقصى 4 خانات).
export const plainNum = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '' : String(Math.round(v * 10000) / 10000));
