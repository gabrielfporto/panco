export function cents(value: string | number): bigint {
  const s = String(value);
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error(`Valor monetário inválido: ${s}`);
  const negative = s.startsWith('-');
  const [whole, fraction = ''] = s.replace('-', '').split('.');
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return negative ? -result : result;
}
export function decimal(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
export const sumMoney = (values: (string | number)[]) =>
  decimal(values.reduce<bigint>((sum, v) => sum + cents(v), 0n));
export const brl = (value: string | number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
