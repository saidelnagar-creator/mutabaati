// السن في تاريخ: من تاريخ الميلاد بدقة، أو من سنة ميلاد تقديرية (لو اتسجل السن بس).
export function ageAt(patient, date) {
  if (!patient || !date) return null;
  if (patient.dob) {
    const [y, m, d] = patient.dob.split('-').map(Number);
    const [Y, M, D] = date.split('-').map(Number);
    let a = Y - y;
    if (M < m || (M === m && D < d)) a--;
    return a >= 0 ? a : null;
  }
  if (Number.isInteger(patient.birthYear)) {
    const a = Number(date.slice(0, 4)) - patient.birthYear;
    return a >= 0 ? a : null;
  }
  return null;
}
export const ageIsApprox = (patient) => !patient?.dob && Number.isInteger(patient?.birthYear);
