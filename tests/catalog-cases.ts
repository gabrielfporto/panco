import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
export async function testCategoryCatalog(db: PGlite) {
  const u = "00000000-0000-4000-8000-000000000201",
    other = "00000000-0000-4000-8000-000000000202";
  const one = async (sql: string, args: unknown[] = []) =>
    (await db.query<any>(sql, args)).rows[0];
  await db.exec("reset role");
  await db.query("insert into auth.users(id) values($1),($2)", [u, other]);
  const legacy = await one(
    "insert into categories(user_id,name,kind) values($1,'Mesada','income') returning id",
    [u],
  );
  const destination = await one(
    "insert into categories(user_id,name,kind) values($1,'Outros ganhos','income') returning id",
    [u],
  );
  const account = await one(
    "insert into accounts(user_id,name,kind,current_balance) values($1,'Teste','cash',999) returning id",
    [u],
  );
  await db.query(
    "insert into transactions(user_id,account_id,category_id,description,amount,direction,status,source,occurred_at) values($1,$2,$3,'Receita preservada',123,'income','posted','manual','2026-10-09T12:00:00Z')",
    [u, account.id, legacy.id],
  );
  await db.query(
    "insert into monthly_budgets(user_id,month,category_id,direction,amount) values($1,'2026-10-01',$2,'income',100),($1,'2026-10-01',$3,'income',20),($1,'2026-11-01',$2,'income',50)",
    [u, legacy.id, destination.id],
  );
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${u}',false)`,
  );
  await db.query("select panco_initialize_planning()");
  const cats = (
    await db.query<any>(
      "select name,icon from categories where archived_at is null",
    )
  ).rows;
  assert.equal(cats.length, 13);
  assert.deepEqual(
    cats.map((c) => c.name).sort(),
    [
      "Salário",
      "Outros ganhos",
      "Ressarcimento",
      "Moradia",
      "Saúde",
      "Alimentação",
      "Transporte",
      "Farmácia",
      "Barbeiro",
      "Lazer",
      "Compras",
      "Assinaturas",
      "Manutenção do Carro",
    ].sort(),
  );
  assert.ok(cats.every((c) => /\p{Extended_Pictographic}/u.test(c.icon)));
  assert.equal(
    (
      await one(
        "select category_id from transactions where description='Receita preservada'",
      )
    ).category_id,
    destination.id,
  );
  assert.equal(
    Number(
      (
        await one(
          "select amount from monthly_budgets where category_id=$1 and month='2026-10-01'",
          [destination.id],
        )
      ).amount,
    ),
    120,
  );
  assert.equal(
    Number(
      (
        await one("select current_balance from accounts where id=$1", [
          account.id,
        ])
      ).current_balance,
    ),
    999,
  );
  await assert.rejects(db.query("select panco_category_catalog($1)", [other]));
  await assert.rejects(
    db.query("select panco_delete_category($1)", [destination.id]),
  );
  const salary = await one("select id from categories where name='Salário'");
  const food = await one("select id from categories where name='Alimentação'");
  await assert.rejects(
    db.query("select panco_delete_category($1,$2)", [destination.id, food.id]),
  );
  await db.query("select panco_delete_category($1,$2)", [
    destination.id,
    salary.id,
  ]);
  assert.equal(
    (
      await one("select count(*)::int n from categories where id=$1", [
        destination.id,
      ])
    ).n,
    0,
  );
  assert.equal(
    (await one("select category_id from transactions")).category_id,
    salary.id,
  );
  assert.equal(
    Number(
      (await one("select sum(amount) amount from monthly_budgets")).amount,
    ),
    170,
  );
  assert.equal(
    Number((await one("select sum(amount) amount from transactions")).amount),
    123,
  );
  await db.query("select panco_initialize_planning()");
  assert.equal(
    (
      await one(
        "select count(*)::int n from categories where name='Outros ganhos'",
      )
    ).n,
    0,
  );
  await db.query("select panco_delete_category($1)", [food.id]);
  assert.equal(
    (await one("select count(*)::int n from categories where id=$1", [food.id]))
      .n,
    0,
  );
  await db.exec(`select set_config('request.jwt.claim.sub','${other}',false)`);
  await assert.rejects(
    db.query("select panco_delete_category($1)", [salary.id]),
  );
  await db.exec("reset role;set role anon");
  await assert.rejects(
    db.query("select panco_delete_category($1)", [salary.id]),
  );
  await db.exec("reset role");
  console.log(
    "Catálogo: 13 padrões, emojis, consolidação, exclusão atômica, valores preservados, não recriação e RLS OK",
  );
}

export async function testForecastPeriod(db: PGlite) {
  const one = async (sql: string, args: unknown[] = []) =>
    (await db.query<any>(sql, args)).rows[0];
  await db.exec("reset role");
  const c = await one(
    "select id,user_id from open_finance_connections where pluggy_item_id='item'",
  );
  const row = {
    external_account_id: "external",
    pluggy_transaction_id: "forecast-month",
    occurred_at: "2091-02-09T00:00:00Z",
    description: "Período documentado",
    merchant_key: "periodo",
    amount: "42.50",
    direction: "expense",
    currency: "BRL",
    status: "pending",
    provider_status: "PENDING",
    kind: "regular",
    bill_forecast_month: "2091-03-01", original_currency: "USD", original_amount: "10.00",
  };
  await db.query("select auro_ingest($1,$2)", [c.id, JSON.stringify([row])]);
  const tx = await one(
    "select due_date::text,billing_month::text,needs_review,original_currency,original_amount from transactions where pluggy_transaction_id='forecast-month'",
  );
  assert.equal(tx.due_date, "2091-03-05");
  assert.equal(tx.billing_month, "2091-03-01");
  assert.equal(tx.needs_review, false);
  assert.equal(tx.original_currency, "USD");
  assert.equal(Number(tx.original_amount), 10);
  await db.query(
    "update invoices set due_date='2091-03-08' where reference_month='2091-03-01' and user_id=$1",
    [c.user_id],
  );
  await db.query("select auro_ingest($1,$2)", [c.id, JSON.stringify([row])]);
  assert.equal(
    (
      await one(
        "select due_date::text from transactions where pluggy_transaction_id='forecast-month'",
      )
    ).due_date,
    "2091-03-08",
  );
  await db.query("update cards set due_day=null where connection_id=$1", [
    c.id,
  ]);
  await db.query("select auro_ingest($1,$2)", [
    c.id,
    JSON.stringify([
      {
        ...row,
        pluggy_transaction_id: "forecast-unknown",
        bill_forecast_month: "2091-04-01",
      },
    ]),
  ]);
  const unknown = await one(
    "select invoice_id,needs_review from transactions where pluggy_transaction_id='forecast-unknown'",
  );
  assert.equal(unknown.invoice_id, null);
  assert.equal(unknown.needs_review, true);
  assert.equal(
    (
      await one(
        "select panco_ignored_transaction('Aplicação APL APLIC AUT MAIS') ignored",
      )
    ).ignored,
    true,
  );
  console.log(
    "Pluggy: período mensal, vencimento real preservado e ausência de data sinalizada OK",
  );
}
