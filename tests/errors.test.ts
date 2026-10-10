import assert from "node:assert/strict";
import test from "node:test";
import { pancoErrorMessage } from "../packages/react-features/src/errors.ts";

test("traduz conflito de nome de categoria", () => {
  assert.equal(
    pancoErrorMessage({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "categories_name_uq"',
    }),
    "Já existe uma categoria com esse nome.",
  );
});

test("preserva mensagens reais e usa fallback para valores desconhecidos", () => {
  assert.equal(
    pancoErrorMessage(new Error("Esta categoria não existe mais.")),
    "Esta categoria não existe mais.",
  );
  assert.equal(
    pancoErrorMessage(null, "Não foi possível salvar."),
    "Não foi possível salvar.",
  );
});
