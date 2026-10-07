import { test } from "node:test";
import assert from "node:assert/strict";
import { groupSimilar } from "../packages/core/src/features/transactions/grouping.ts";

test("agrupa semelhantes preservando cada transação e seu valor", () => {
  const row = {
    account_id: "bank",
    card_id: null,
    description: "Pix",
    amount: 25,
    occurred_at: "2026-10-07T12:00:00Z",
    direction: "expense",
    status: "posted",
    currency: "BRL",
    source: "pluggy",
  };
  const rows = [
    row,
    { ...row },
    { ...row, account_id: "other" },
    { ...row, currency: "USD" },
    { ...row, amount: 30 },
  ];
  const groups = groupSimilar(rows);
  assert.equal(groups.length, 4);
  assert.equal(groups[0].length, 2);
  assert.equal(groups.flat().length, rows.length);
  assert.equal(
    groups.flat().reduce((sum, t) => sum + t.amount, 0),
    130,
  );
});
test("não agrupa parcelas diferentes nem lançamentos manuais", () => {
  const row = {
    account_id: null,
    card_id: "card",
    description: "Compra",
    amount: 25,
    occurred_at: "2026-10-07T12:00:00Z",
    direction: "expense",
    status: "posted",
    currency: "BRL",
    source: "pluggy",
  };
  assert.equal(
    groupSimilar([
      { ...row, installment_number: 1 },
      { ...row, installment_number: 2 },
    ]).length,
    2,
  );
  assert.equal(
    groupSimilar([
      { ...row, source: "manual" },
      { ...row, source: "manual" },
    ]).length,
    2,
  );
});
