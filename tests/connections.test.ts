import { test } from "node:test";
import assert from "node:assert/strict";
import {
  connection,
  registerConnection,
} from "../supabase/functions/_shared/sync.ts";
import { owner } from "../supabase/functions/_shared/http.ts";
import { Pluggy } from "../supabase/functions/_shared/pluggy.ts";

const values: Record<string, string> = {
  PANCO_OWNER_ID: "owner",
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "public-test",
  PLUGGY_CLIENT_ID: "test",
  PLUGGY_CLIENT_SECRET: "test",
};
Object.assign(globalThis, { Deno: { env: { get: (k: string) => values[k] } } });

type Row = {
  id: string;
  user_id: string;
  pluggy_item_id: string;
  status: string;
};
function fakeDatabase(rows: Row[] = []) {
  const db = {
    from() {
      const filters: Record<string, string> = {};
      const query = {
        select() {
          return query;
        },
        eq(k: string, v: string) {
          filters[k] = v;
          return query;
        },
        async maybeSingle() {
          return {
            data:
              rows.find((r) =>
                Object.entries(filters).every(
                  ([k, v]) => r[k as keyof Row] === v,
                ),
              ) || null,
            error: null,
          };
        },
        async upsert(
          row: Omit<Row, "id" | "status">,
          options: { ignoreDuplicates: boolean },
        ) {
          assert.equal(options.ignoreDuplicates, true);
          if (!rows.some((r) => r.pluggy_item_id === row.pluggy_item_id))
            rows.push({ ...row, id: "connection", status: "active" });
          return { data: null, error: null };
        },
      };
      return query;
    },
  };
  return { db: db as unknown as Parameters<typeof connection>[0], rows };
}

test("Item validado na Pluggy; cadastro repetido não duplica conexão", async () => {
  const { db, rows } = fakeDatabase();
  const api = new Pluggy(async (input) =>
    String(input).endsWith("/auth")
      ? Response.json({ apiKey: "test" })
      : Response.json({ id: "item-123" }),
  );
  await registerConnection(db, api, "item-123");
  await registerConnection(db, api, "item-123");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, "owner");
});

test("Item inválido, inexistente ou de outro dono não pode ser cadastrado", async () => {
  const { db, rows } = fakeDatabase([
    {
      id: "other",
      user_id: "someone-else",
      pluggy_item_id: "item-456",
      status: "active",
    },
  ]);
  const api = new Pluggy(async (input) =>
    String(input).endsWith("/auth")
      ? Response.json({ apiKey: "test" })
      : Response.json({ id: "item-456" }),
  );
  await assert.rejects(
    registerConnection(db, api, "https://outro.example"),
    /inválido/,
  );
  await assert.rejects(
    registerConnection(db, api, "item-456"),
    /não cadastrado/,
  );
  assert.equal(rows[0].user_id, "someone-else");
  const denied = new Pluggy(async () => new Response(null, { status: 404 }));
  await assert.rejects(registerConnection(db, denied, "missing"));
  assert.equal(rows.length, 1);
});

test("webhook não pode criar vínculo; conexões revogadas são recusadas", async () => {
  const { db, rows } = fakeDatabase([
    {
      id: "old",
      user_id: "owner",
      pluggy_item_id: "item-old",
      status: "revoked",
    },
  ]);
  await assert.rejects(connection(db, "not-registered"), /não cadastrado/);
  await assert.rejects(connection(db, "item-old"), /não cadastrado/);
  assert.equal(rows.length, 1);
});

test("autorização exige sessão válida, e-mail confirmado e UUID proprietário", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const request = new Request("https://test.supabase.co/functions/v1/sync", {
    headers: { Authorization: "Bearer test-token" },
  });
  await assert.rejects(owner(new Request(request.url)), /Faça login/);
  globalThis.fetch = async () =>
    Response.json({ id: "other", email_confirmed_at: "2026-10-06T00:00:00Z" });
  await assert.rejects(owner(request), /proprietário/);
  globalThis.fetch = async () => Response.json({ id: "owner" });
  await assert.rejects(owner(request), /Confirme seu e-mail/);
  globalThis.fetch = async () =>
    Response.json({ id: "owner", email_confirmed_at: "2026-10-06T00:00:00Z" });
  assert.equal((await owner(request)).user.id, "owner");
});
