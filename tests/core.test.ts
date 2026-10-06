import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cents, decimal, sumMoney } from '../packages/core/src/money.ts';
import { billingCycle, addMonths } from '../packages/core/src/features/transactions/billing.ts';
import {
  normalizeTransaction,
  nextTransactionPath,
} from '../packages/core/src/features/transactions/pluggy.ts';
test('dinheiro sem arredondamento binário', () => {
  assert.equal(sumMoney(['0.10', '0.20']), '0.30');
  assert.equal(decimal(cents('-12.01')), '-12.01');
  assert.throws(() => cents('1.234'));
});
test('compra após fechamento cruza dois meses até vencimento', () => {
  assert.deepEqual(billingCycle('2026-10-26', 25, 5), {
    closing_date: '2026-11-25',
    due_date: '2026-12-05',
    billing_month: '2026-12-01',
    defer_to_next_month: true,
  });
});
test('dia do fechamento e fevereiro bissexto', () => {
  assert.equal(billingCycle('2026-10-25', 25, 5).due_date, '2026-11-05');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(billingCycle('2026-02-28', 31, 5).due_date, '2026-03-05');
});
test('adiamento explícito não avança dois ciclos', () => {
  assert.equal(billingCycle('2026-10-26', 25, 5, true).due_date, '2026-12-05');
});
test('normaliza banco/cartão e funciona sem merchant pago', () => {
  const t = {
    id: 'x',
    accountId: 'a',
    date: '2026-10-05T00:00:00Z',
    description: '  IFOOD  ',
    amount: 30,
    currencyCode: 'BRL',
    status: 'POSTED' as const,
  };
  assert.equal(normalizeTransaction(t, false).direction, 'income');
  assert.equal(normalizeTransaction(t, true).direction, 'expense');
  assert.equal(normalizeTransaction(t, true).merchant_name, null);
  assert.equal(normalizeTransaction(t, true).merchant_key, 'ifood');
});
test('cursor opaco preservado sem permitir URL externa', () => {
  const q = '?accountId=a&after=ab%2B%3D';
  assert.equal(nextTransactionPath(q, 'a'), '/v2/transactions' + q);
  assert.throws(() => nextTransactionPath('https://evil.test', 'a'));
  assert.throws(() => nextTransactionPath('?accountId=b&after=x', 'a'));
});
