export { brl } from '../../../../packages/core/src/money';
export const shortDate = (s: string) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(
    new Date(s.slice(0, 10) + 'T12:00:00Z'),
  );
export const fullDate = (s: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(s.slice(0, 10) + 'T12:00:00Z'));
export const monthLabel = (s: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(s.slice(0, 7) + '-01T12:00:00Z'),
  );
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bahia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
