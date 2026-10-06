import {
  admin,
  body,
  check,
  env,
  handler,
  HttpError,
  secretEqual,
} from "../_shared/http.ts";
import { Pluggy } from "../_shared/pluggy.ts";
import {
  connection,
  importAccounts,
  importBills,
  mappedRows,
  syncAccount,
} from "../_shared/sync.ts";
import type { PluggyTransaction } from "../../../packages/core/src/features/transactions/pluggy.ts";
Deno.serve(
  handler(async (request) => {
    if (
      !(await secretEqual(
        request.headers.get("x-panco-webhook-secret") ||
          request.headers.get("x-auro-webhook-secret") ||
          "",
        env("PLUGGY_WEBHOOK_SECRET"),
      ))
    )
      throw new HttpError(401, "Webhook não autorizado");
    const input = await body(request);
    if (
      typeof input.itemId !== "string" ||
      typeof input.eventId !== "string" ||
      typeof input.event !== "string"
    )
      throw new HttpError(400, "Evento inválido");
    const allowed = [
      "transactions/created",
      "transactions/updated",
      "transactions/deleted",
      "item/updated",
    ];
    if (!allowed.includes(input.event)) return { ignored: true };
    const db = admin(),
      api = new Pluggy(),
      c = await connection(db, input.itemId);
    check(
      await db.from("webhook_events").upsert(
        {
          user_id: c.user_id,
          connection_id: c.id,
          event_key: input.eventId,
          event_type: input.event,
          payload: input,
        },
        { onConflict: "event_key", ignoreDuplicates: true },
      ),
    );
    const event = check(
      await db
        .from("webhook_events")
        .select("id,status,attempts")
        .eq("event_key", input.eventId)
        .single(),
    );
    if (!event) throw new Error("Evento não persistido");
    if (event.status === "processed") return { duplicate: true };
    check(
      await db
        .from("webhook_events")
        .update({ status: "processing", attempts: event.attempts + 1 })
        .eq("id", event.id),
    );
    try {
      if (input.event === "item/updated") {
        await importAccounts(db, api, c);
      } else {
        if (typeof input.accountId !== "string")
          throw new HttpError(400, "Conta ausente");
        const ids = input.transactionIds;
        if (input.event === "transactions/deleted") {
          if (
            !Array.isArray(ids) ||
            ids.length > 500 ||
            ids.some((id) => typeof id !== "string")
          )
            throw new HttpError(400, "IDs inválidos");
          check(
            await db.rpc("auro_delete_transactions", {
              p_connection: c.id,
              p_ids: ids,
            }),
          );
        } else {
          await importAccounts(db, api, c);
          await importBills(db, api, c, input.accountId);
          if (input.event === "transactions/created") {
            if (
              typeof input.transactionsCreatedAtFrom !== "string" ||
              !Number.isFinite(Date.parse(input.transactionsCreatedAtFrom))
            )
              throw new HttpError(400, "Filtro temporal ausente");
            const result = await syncAccount(
              db,
              api,
              c,
              input.accountId,
              input.eventId,
              input.transactionsCreatedAtFrom,
            );
            if (result.more)
              throw new HttpError(
                503,
                "Página persistida; repetir entrega para continuar.",
              );
          } else {
            if (
              !Array.isArray(ids) ||
              ids.length > 500 ||
              ids.some((id) => typeof id !== "string")
            )
              throw new HttpError(400, "IDs inválidos");
            if (ids.length) {
              const rows =
                ids.length === 1
                  ? [
                      await api.get<PluggyTransaction>(
                        "/transactions/" + encodeURIComponent(ids[0]),
                      ),
                    ]
                  : (
                      await api.get<{ results: PluggyTransaction[] }>(
                        "/v2/transactions?" +
                          new URLSearchParams({
                            accountId: input.accountId,
                            ids: ids.join(","),
                          }),
                      )
                    ).results;
              if (!Array.isArray(rows) || rows.some((r) => !ids.includes(r.id)))
                throw new Error("Resposta de IDs inválida");
              check(
                await db.rpc("auro_ingest", {
                  p_connection: c.id,
                  p_rows: await mappedRows(db, c, input.accountId, rows),
                }),
              );
            }
          }
        }
      }
      check(
        await db
          .from("webhook_events")
          .update({
            status: "processed",
            processed_at: new Date().toISOString(),
            error_code: null,
          })
          .eq("id", event.id),
      );
      return { received: true };
    } catch (error) {
      check(
        await db
          .from("webhook_events")
          .update({ status: "failed", error_code: "RETRY_REQUIRED" })
          .eq("id", event.id),
      );
      throw error;
    }
  }),
);
