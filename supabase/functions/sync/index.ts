import {
  admin,
  body,
  check,
  env,
  handler,
  HttpError,
  owner,
} from "../_shared/http.ts";
import { Pluggy } from "../_shared/pluggy.ts";
import {
  connection,
  registerConnection,
  importAccounts,
  importBills,
  syncAccount,
  syncInvestments,
} from "../_shared/sync.ts";
Deno.serve(
  handler(async (request) => {
    const { user } = await owner(request);
    const input = await body(request);
    const db = admin();
    const api = new Pluggy();
    if (!input.itemId) {
      const rows =
        check(
          await db
            .from("open_finance_connections")
            .select("pluggy_item_id")
            .eq("user_id", user.id)
            .neq("status", "revoked"),
        ) || [];
      const legacy = (Deno.env.get("PLUGGY_ITEM_IDS") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const id of legacy)
        if (!rows.some((r) => r.pluggy_item_id === id)) {
          await registerConnection(db, api, id);
          rows.push({ pluggy_item_id: id });
        }
      return { items: rows.map((r) => r.pluggy_item_id) };
    }
    if (typeof input.itemId !== "string")
      throw new HttpError(400, "Item inválido");
    const c =
      input.register === true
        ? await registerConnection(db, api, input.itemId)
        : await connection(db, input.itemId);
    if (input.investments === true) return await syncInvestments(db, api, c);
    if (typeof input.accountId !== "string")
      return { accounts: await importAccounts(db, api, c) };
    // Permite apenas contas previamente importadas da conexão autorizada.
    const [a, card] = await Promise.all([
      db
        .from("accounts")
        .select("id")
        .eq("connection_id", c.id)
        .eq("pluggy_account_id", input.accountId)
        .maybeSingle(),
      db
        .from("cards")
        .select("id")
        .eq("connection_id", c.id)
        .eq("pluggy_account_id", input.accountId)
        .maybeSingle(),
    ]);
    if (!check(a) && !check(card))
      throw new HttpError(404, "Conta não encontrada.");
    if (input.bills === true) {
      await importBills(db, api, c, input.accountId);
      return { bills: true };
    }
    const result = await syncAccount(db, api, c, input.accountId);
    if (!result.more)
      check(
        await db
          .from("open_finance_connections")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", c.id),
      );
    return result;
  }),
);
