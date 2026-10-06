export function dateOnly(value: string): string {
  const day = value.slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) !== day
  )
    throw new Error('Data inválida');
  return day;
}
export function monthDay(month: string, day: number): string {
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error('Dia inválido');
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month.slice(0, 7)}-${String(Math.min(day, last)).padStart(2, '0')}`;
}
export function addMonths(date: string, count: number): string {
  const [y, m, d] = dateOnly(date).split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1 + count, 1)).toISOString().slice(0, 10);
  return monthDay(base, d);
}
export function billingCycle(date: string, closingDay: number, dueDay: number, forceNext = false) {
  const day = dateOnly(date);
  let closing = monthDay(day, closingDay);
  const deferred = forceNext || day > closing;
  if (deferred) closing = monthDay(addMonths(closing, 1), closingDay);
  let due = monthDay(closing, dueDay);
  if (due <= closing) due = monthDay(addMonths(closing, 1), dueDay);
  return {
    closing_date: closing,
    due_date: due,
    billing_month: due.slice(0, 7) + '-01',
    defer_to_next_month: deferred,
  };
}
export const merchantKey = (name: string) =>
  name.normalize('NFKC').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
