import { test } from "node:test";
import assert from "node:assert/strict";
import { isIgnoredTransaction } from "../packages/core/src/features/transactions/visibility.ts";

test("ignora resgates automáticos bancários por descrição ou nome", () => {
  for (const description of [
    "RES APLIC AUT MAIS",
    "Crédito RES APLIC AUT MAIS 123",
    "res  aplic\taut mais",
    "Aplicação APL APLIC AUT MAIS",
    "apl aplic\taut mais",
  ])
    assert.equal(
      isIgnoredTransaction({ account_id: "bank", description }),
      true,
    );
  assert.equal(
    isIgnoredTransaction({
      account_id: "bank",
      description: "Crédito",
      merchant_name: "RES APLIC AUT MAIS",
    }),
    true,
  );
});
test("preserva outros lançamentos e cartões", () => {
  assert.equal(
    isIgnoredTransaction({
      account_id: "bank",
      description: "RES APLIC OUTRO",
    }),
    false,
  );
  assert.equal(
    isIgnoredTransaction({
      account_id: null,
      description: "RES APLIC AUT MAIS",
    }),
    false,
  );
});
