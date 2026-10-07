import { test } from "node:test";
import assert from "node:assert/strict";
import { syncItems } from "../packages/react-features/src/sync.ts";

test("falha em transações não impede investimentos nem os próximos Items", async () => {
  const invested: unknown[] = [];
  await assert.rejects(syncItems(async (body) => {
    if (body.investments) { invested.push(body.itemId); return {}; }
    if (!body.accountId) return { accounts: [{ id: "bank", name: "Banco", type: "BANK" }] };
    throw new Error("Histórico indisponível");
  }, ["one", "two"]), /Transações de Banco: Histórico indisponível/);
  assert.deepEqual(invested, ["one", "two"]);
});

test("falha em investimentos e faturas preserva paginação de transações", async () => {
  let pages = 0;
  await assert.rejects(syncItems(async (body) => {
    if (body.investments || body.bills) throw new Error("Indisponível");
    if (!body.accountId) return { accounts: [{ id: "card", name: "Cartão", type: "CREDIT" }] };
    return { more: ++pages < 3 };
  }, ["one"]), /Investimentos: Indisponível.*Faturas de Cartão/);
  assert.equal(pages, 3);
});

test("conta de investimentos é consultada mesmo se importação de contas falha", async () => {
  let investmentCalled = false;
  await assert.rejects(syncItems(async (body) => {
    if (body.investments) { investmentCalled = true; return {}; }
    throw new Error("Falha nas contas");
  }, ["one"]), /Contas: Falha nas contas/);
  assert.equal(investmentCalled, true);
});
