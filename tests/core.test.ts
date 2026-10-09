import { test } from "node:test";
import assert from "node:assert/strict";
import { cents, decimal, sumMoney } from "../packages/core/src/money.ts";
import {
  billingCycle,
  addMonths,
} from "../packages/core/src/features/transactions/billing.ts";
import {
  normalizeTransaction,
  nextTransactionPath,
} from "../packages/core/src/features/transactions/pluggy.ts";
test("dinheiro sem arredondamento binário", () => {
  assert.equal(sumMoney(["0.10", "0.20"]), "0.30");
  assert.equal(decimal(cents("-12.01")), "-12.01");
  assert.throws(() => cents("1.234"));
});
test("compra após fechamento cruza dois meses até vencimento", () => {
  assert.deepEqual(billingCycle("2026-10-26", 25, 5), {
    closing_date: "2026-11-25",
    due_date: "2026-12-05",
    billing_month: "2026-12-01",
    defer_to_next_month: true,
  });
});
test("dia do fechamento e fevereiro bissexto", () => {
  assert.equal(billingCycle("2026-10-25", 25, 5).due_date, "2026-11-05");
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(billingCycle("2026-02-28", 31, 5).due_date, "2026-03-05");
});
test("adiamento explícito não avança dois ciclos", () => {
  assert.equal(billingCycle("2026-10-26", 25, 5, true).due_date, "2026-12-05");
});
test("normaliza banco/cartão e funciona sem merchant pago", () => {
  const t = {
    id: "x",
    accountId: "a",
    date: "2026-10-05T00:00:00Z",
    description: "  IFOOD  ",
    amount: 30,
    currencyCode: "BRL",
    status: "POSTED" as const,
  };
  assert.equal(normalizeTransaction(t, false).direction, "income");
  assert.equal(normalizeTransaction(t, true).direction, "expense");
  assert.equal(normalizeTransaction(t, true).merchant_name, null);
  assert.equal(normalizeTransaction(t, true).merchant_key, "ifood");
});
test("cursor opaco preservado sem permitir URL externa", () => {
  const q = "?accountId=a&after=ab%2B%3D";
  assert.equal(nextTransactionPath(q, "a"), "/v2/transactions" + q);
  assert.throws(() => nextTransactionPath("https://evil.test", "a"));
  assert.throws(() => nextTransactionPath("?accountId=b&after=x", "a"));
});

test("mês previsto Pluggy não é tratado como vencimento no dia primeiro", () => {
  const t = {
    id: "forecast",
    accountId: "card",
    date: "2026-10-09T00:00:00Z",
    description: "Compra",
    amount: 42.5,
    currencyCode: "BRL",
    status: "PENDING" as const,
  };
  const normalized = normalizeTransaction(
    { ...t, creditCardMetadata: { billForecastDate: "2026-11" } },
    true,
  );
  assert.equal(normalized.bill_forecast_month, "2026-11-01");
  assert.equal(normalized.bill_forecast_date, null);
  assert.equal(normalized.amount, "42.50");
  assert.equal(
    normalizeTransaction(
      { ...t, creditCardMetadata: { billForecastDate: "2026-11-17" } },
      true,
    ).bill_forecast_date,
    "2026-11-17",
  );
  assert.throws(() =>
    normalizeTransaction(
      { ...t, creditCardMetadata: { billForecastDate: "2026-13" } },
      true,
    ),
  );
});

test('compra internacional usa conversão do provedor e preserva o valor original', () => {
 const t={id:'usd',accountId:'card',date:'2026-10-09T00:00:00Z',description:'Compra internacional',amount:10,currencyCode:'USD',status:'POSTED' as const,amountInAccountCurrency:52.34};
 const r=normalizeTransaction(t,true,'BRL');
 assert.equal(r.amount,'52.34'); assert.equal(r.currency,'BRL');
 assert.equal(r.original_amount,'10.00'); assert.equal(r.original_currency,'USD');
 assert.equal(r.direction,'expense');
 assert.throws(()=>normalizeTransaction({...t,amountInAccountCurrency:null},true,'BRL'), /convertido/);
 assert.equal(normalizeTransaction({...t,amount:-10,amountInAccountCurrency:52.34},true,'BRL').direction,'income');
});
