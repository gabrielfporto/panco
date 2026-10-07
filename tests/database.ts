import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
async function run() {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;`);
  for (const name of [
    "001_auro_schema.sql",
    "002_core.sql",
    "003_manual_and_recurring.sql",
    "004_consistency.sql",
    "005_profile.sql",
    "20261007093914_ignore_automatic_redemptions.sql",
    "20261007232440_monthly_category_planning.sql",
  ]) {
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
    console.log("Migration OK:", name);
  }
  const u = "00000000-0000-4000-8000-000000000001",
    v = "00000000-0000-4000-8000-000000000002";
  await db.query("insert into auth.users(id) values ($1),($2)", [u, v]);
  await db.query(
    'update auth.users set raw_user_meta_data = \'{"name":"Pessoa","phone":"+5571999999999"}\' where id = $1',
    [u],
  );
  const profileId = "00000000-0000-4000-8000-000000000003";
  await db.query(
    "insert into auth.users(id,raw_user_meta_data) values ($1,$2)",
    [profileId, JSON.stringify({ name: "Meu nome", phone: "+5571999999999" })],
  );
  const profile = (
    await db.query<{ display_name: string; phone: string }>(
      "select display_name,phone from public.users where id=$1",
      [profileId],
    )
  ).rows[0];
  assert.equal(profile.display_name, "Meu nome");
  assert.equal(profile.phone, "+5571999999999");
  await db.query("delete from auth.users where id=$1", [profileId]);
  const result = await db.query<{ count: number }>(
    "select count(*)::integer as count from public.categories",
  );
  assert.equal(result.rows[0].count, 20);
  const one = async <T>(sql: string, args: unknown[] = []) =>
    (await db.query<T>(sql, args)).rows[0];
  const a = await one<{ id: string }>(
    `insert into accounts(user_id,name,kind,current_balance,balance_as_of) values($1,'Banco','checking',1000,now()) returning id`,
    [u],
  );
  const b = await one<{ id: string }>(
    `insert into accounts(user_id,name,kind) values($1,'Outro','checking') returning id`,
    [v],
  );
  const card = await one<{ id: string }>(
    `insert into cards(user_id,name,closing_day,due_day,payment_account_id) values($1,'Cartão',25,5,$2) returning id`,
    [u, a.id],
  );
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${u}',false);`,
  );
  assert.equal(
    (
      await one<{ count: number }>(
        "select count(*)::integer as count from accounts",
      )
    ).count,
    1,
  );
  await assert.rejects(
    db.query(
      `insert into transactions(user_id,account_id,occurred_at,description,amount,direction,status,source) values($1,$2,now(),'Ataque',1,'expense','pending','manual')`,
      [u, b.id],
    ),
  );
  await assert.rejects(
    db.query(
      `insert into transactions(user_id,account_id,card_id,occurred_at,description,amount,direction,status,source) values($1,$2,$3,now(),'Duplo',1,'expense','pending','manual')`,
      [u, a.id, card.id],
    ),
  );
  console.log("RLS e FKs: isolamento e conta XOR cartão OK");
  const day = new Date().toISOString().slice(0, 10);
  await db.query("select create_manual_transaction($1::jsonb)", [
    JSON.stringify({
      date: day,
      description: "Receita",
      account_id: a.id,
      direction: "income",
      amount: "200.00",
      status: "pending",
    }),
  ]);
  await db.query("select create_manual_transaction($1::jsonb)", [
    JSON.stringify({
      date: day,
      description: "Despesa",
      account_id: a.id,
      direction: "expense",
      amount: "100.00",
      status: "pending",
    }),
  ]);
  const inv = await one<{ id: string }>(
    `insert into invoices(user_id,card_id,reference_month,closing_date,due_date,status,reported_total) values($1,$2,date_trunc('month',current_date),current_date,current_date,'CLOSED',300) returning id`,
    [u, card.id],
  );
  const f = await one<{ value: { projected_balance: string } }>(
    "select forecast_month() as value",
  );
  assert.equal(Number(f.value.projected_balance), 800);
  const pay = await one<{ id: string }>(
    `insert into transactions(user_id,account_id,occurred_at,due_date,description,amount,direction,status,source,kind) values($1,$2,now(),current_date,'Pagamento fatura',300,'expense','pending','manual','invoice_payment') returning id`,
    [u, a.id],
  );
  await db.query(
    "insert into invoice_payments(user_id,invoice_id,transaction_id,amount) values($1,$2,$3,300)",
    [u, inv.id, pay.id],
  );
  assert.equal(
    Number(
      (
        await one<{ value: { projected_balance: string } }>(
          "select forecast_month() as value",
        )
      ).value.projected_balance,
    ),
    800,
  );
  console.log(
    "Forecast: saldo + receita - despesa - fatura, pagamento sem duplicidade OK",
  );
  await assert.rejects(db.query("select auro_ingest($1,$2)", [card.id, "[]"]));
  await db.exec("reset role;");
  const conn = await one<{ id: string }>(
    `insert into open_finance_connections(user_id,pluggy_item_id) values($1,'item') returning id`,
    [u],
  );
  await db.query(
    `update cards set connection_id=$1,pluggy_account_id='external' where id=$2`,
    [conn.id, card.id],
  );
  const tx = {
    external_account_id: "external",
    pluggy_transaction_id: "t1",
    occurred_at: "2026-10-26T12:00:00Z",
    description: "Curso",
    merchant_name: "Curso",
    merchant_key: "curso",
    amount: "100.00",
    direction: "expense",
    currency: "BRL",
    status: "posted",
    provider_status: "POSTED",
    kind: "regular",
    installment_number: 1,
    total_installments: 3,
    purchase_date: "2026-10-26",
  };
  await db.query("select auro_ingest($1,$2)", [conn.id, JSON.stringify([tx])]);
  await db.query("select auro_ingest($1,$2)", [conn.id, JSON.stringify([tx])]);
  assert.equal(
    (
      await one<{ n: number }>(
        `select count(*)::int n from transactions where merchant_key='curso'`,
      )
    ).n,
    3,
  );
  const first = await one<{ due_date: string }>(
    `select due_date::text from transactions where pluggy_transaction_id='t1'`,
  );
  assert.equal(first.due_date, "2026-12-05");
  await db.query("select auro_ingest($1,$2)", [
    conn.id,
    JSON.stringify([
      {
        ...tx,
        pluggy_transaction_id: "t2",
        occurred_at: "2026-11-26T12:00:00Z",
        installment_number: 2,
      },
    ]),
  ]);
  assert.equal(
    (
      await one<{ n: number }>(
        `select count(*)::int n from transactions where merchant_key='curso'`,
      )
    ).n,
    3,
  );
  assert.equal(
    (
      await one<{ n: number }>(
        `select count(*)::int n from transactions where merchant_key='curso' and source='pluggy'`,
      )
    ).n,
    2,
  );
  console.log(
    "Ingestão: repetição idempotente, adiamento e substituição da projeção OK",
  );
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${u}',false);`,
  );
  const category = await one<{ id: string }>(
    "select id from categories where user_id=$1 limit 1",
    [u],
  );
  await db.query(
    `update transactions set category_id=$1,category_source='manual' where pluggy_transaction_id='t1'`,
    [category.id],
  );
  assert.equal(
    (
      await one<{ n: number }>(
        `select count(*)::int n from category_rules where merchant_key='curso'`,
      )
    ).n,
    1,
  );
  console.log("Regra automática de categoria OK");
  const sub = await one<{ id: string }>(
    `insert into subscriptions(user_id,account_id,name,merchant_key,amount,next_due_date) values($1,$2,'Academia','academia',50,current_date) returning id`,
    [u, a.id],
  );
  await db.query("select schedule_subscriptions(current_date)");
  await db.query("select schedule_subscriptions(current_date)");
  assert.equal(
    (
      await one<{ n: number }>(
        "select count(*)::int n from transactions where subscription_id=$1",
        [sub.id],
      )
    ).n,
    1,
  );
  await db.query(`update subscriptions set status='paused' where id=$1`, [
    sub.id,
  ]);
  assert.equal(
    (
      await one<{ status: string }>(
        "select status from transactions where subscription_id=$1",
        [sub.id],
      )
    ).status,
    "cancelled",
  );
  console.log(
    "Assinaturas: programação idempotente e pausa cancelando projeção OK",
  );
  await assert.rejects(
    db.query(`update transactions set amount=1 where id=$1`, [pay.id]),
  );
  console.log("Pagamentos: edição não pode invalidar alocação existente OK");
  await db.exec("reset role;");
  await db.query(
    `update transactions set category_source='manual',category_id=$1 where pluggy_transaction_id='t1'`,
    [category.id],
  );
  await db.query("select auro_ingest($1,$2)", [
    conn.id,
    JSON.stringify([
      {
        ...tx,
        description: "Curso atualizado",
        provider_updated_at: "2026-10-05T18:00:00Z",
      },
    ]),
  ]);
  assert.equal(
    (
      await one<{ category_source: string }>(
        `select category_source from transactions where pluggy_transaction_id='t1'`,
      )
    ).category_source,
    "manual",
  );
  await db.query("select auro_ingest($1,$2)", [
    conn.id,
    JSON.stringify([
      {
        ...tx,
        description: "Evento atrasado",
        provider_updated_at: "2026-10-05T17:00:00Z",
      },
    ]),
  ]);
  assert.equal(
    (
      await one<{ description: string }>(
        `select description from transactions where pluggy_transaction_id='t1'`,
      )
    ).description,
    "Curso atualizado",
  );
  console.log("Sync preserva categoria manual e ignora atualização antiga OK");
  await db.query("select auro_delete_transactions($1,$2)", [conn.id, ["t2"]]);
  assert.equal(
    (
      await one<{ status: string }>(
        `select status from transactions where pluggy_transaction_id='t2'`,
      )
    ).status,
    "cancelled",
  );
  console.log("Webhook de exclusão preserva histórico e cancela lançamento OK");
  const checkpoint = await one<{ value: { id: string; token: string } }>(
    `select auro_claim_sync($1,'history','{}') as value`,
    [conn.id],
  );
  const busy = await one<{ value: { busy: boolean } }>(
    `select auro_claim_sync($1,'history','{}') as value`,
    [conn.id],
  );
  assert.equal(busy.value.busy, true);
  await assert.rejects(
    db.query("select auro_commit_page($1,$2,$3,$4)", [
      checkpoint.value.id,
      checkpoint.value.token,
      JSON.stringify([{ ...tx, external_account_id: "unknown" }]),
      "?next",
    ]),
  );
  const state = await one<{ next_cursor: string | null }>(
    "select next_cursor from sync_checkpoints where id=$1",
    [checkpoint.value.id],
  );
  assert.equal(state.next_cursor, null);
  console.log("Lease e rollback de cursor em página inválida OK");
  await db.query("select auro_ingest($1,$2)", [
    conn.id,
    JSON.stringify([
      {
        ...tx,
        pluggy_transaction_id: "t3",
        occurred_at: "2026-12-26T12:00:00Z",
        installment_number: 3,
        purchase_date: null,
      },
    ]),
  ]);
  const candidate = await one<{ id: string }>(
    `select id from transactions where merchant_key='curso' and source='projection' and installment_number=3 and status<>'cancelled'`,
  );
  const real = await one<{ id: string }>(
    `select id from transactions where pluggy_transaction_id='t3'`,
  );
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${u}',false);`,
  );
  await db.query("select reconcile_projection($1,$2)", [candidate.id, real.id]);
  await db.exec("reset role;");
  await db.query("select auro_ingest($1,$2)", [
    conn.id,
    JSON.stringify([{ ...tx, provider_updated_at: "2026-10-05T19:00:00Z" }]),
  ]);
  assert.equal(
    (
      await one<{ n: number }>(
        `select count(*)::int n from transactions where merchant_key='curso' and installment_number=3 and status<>'cancelled'`,
      )
    ).n,
    1,
  );
  console.log(
    "Conciliação manual de parcela e nova sincronização sem duplicidade OK",
  );

  // A separate currency isolates this regression from the existing BRL fixtures.
  const filterAccount = await one<{ id: string }>(
    `insert into accounts(user_id,name,kind,currency,current_balance,balance_as_of)
     values ($1,'Filter test','checking','USD',1000,now()-interval '1 day') returning id`,
    [u],
  );
  for (const [description, amount, direction, status] of [
    ["RES APLIC AUT MAIS", 100, "income", "pending"],
    ["prefix res  aplic aut mais 123", 200, "income", "posted"],
    ["RES APLIC AUT MAIS", 300, "expense", "posted"],
    ["Other income", 50, "income", "pending"],
    ["Other expense", 20, "expense", "posted"],
  ]) {
    await db.query(
      `insert into transactions(user_id,account_id,description,amount,direction,status,source,currency,occurred_at,due_date)
      values ($1,$2,$3,$4,$5,$6,'manual','USD',now(),current_date)`,
      [u, filterAccount.id, description, amount, direction, status],
    );
  }
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${u}',false);`,
  );
  const filteredForecast = await one<{ value: Record<string, string> }>(
    `select forecast_month(null,'USD') value`,
  );
  assert.equal(Number(filteredForecast.value.current_balance), 1000);
  assert.equal(Number(filteredForecast.value.pending_income), 50);
  assert.equal(Number(filteredForecast.value.pending_expenses), 20);
  assert.equal(Number(filteredForecast.value.projected_balance), 1030);
  const filteredSummary = await one<{
    value: { amount: string; count: number };
  }>(`select spending_summary(current_date-1,current_date+1,'','USD') value`);
  assert.equal(Number(filteredSummary.value.amount), 20);
  assert.equal(filteredSummary.value.count, 1);
  const keptHistory = await one<{ n: number }>(
    `select count(*)::int n from transactions where account_id=$1`,
    [filterAccount.id],
  );
  assert.equal(keptHistory.n, 5);
  await db.exec("reset role");
  console.log(
    "Filtro bancário: histórico preservado, saldo real intacto e totais/previsão excluídos OK",
  );

  const budgetCategory = await one<{ id: string }>(
    `select id from categories where user_id=$1 limit 1`,
    [u],
  );
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${u}',false);`,
  );
  await db.query(
    `insert into monthly_budgets(user_id,month,category_id,direction,amount) values($1,'2026-10-01',$2,'income',123.45)`,
    [u, budgetCategory.id],
  );
  await db.query(
    `insert into monthly_budgets(user_id,month,category_id,direction,amount) values($1,'2026-10-01',$2,'income',200.50) on conflict(user_id,month,category_id,direction) do update set amount=excluded.amount`,
    [u, budgetCategory.id],
  );
  assert.equal(
    (await one<{ amount: string }>(`select amount from monthly_budgets`))
      .amount,
    "200.50",
  );
  await assert.rejects(
    db.query(
      `insert into monthly_budgets(user_id,month,category_id,direction,amount) values($1,'2026-11-01',$2,'expense',-1)`,
      [u, budgetCategory.id],
    ),
  );
  await db.exec(`select set_config('request.jwt.claim.sub','${v}',false);`);
  assert.equal(
    (await one<{ n: number }>(`select count(*)::int n from monthly_budgets`)).n,
    0,
  );
  await assert.rejects(
    db.query(
      `insert into monthly_budgets(user_id,month,category_id,direction,amount) values($1,'2026-11-01',$2,'expense',10)`,
      [u, budgetCategory.id],
    ),
  );
  await db.exec("reset role");
  console.log(
    "Planejamento: gravação, atualização, valores não negativos e isolamento RLS OK",
  );
  await db.close();
  console.log("Todos os testes PostgreSQL passaram.");
}
run().catch(async (e) => {
  console.error(e);
  await db.close();
  process.exitCode = 1;
});
