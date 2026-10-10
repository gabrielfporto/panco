import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
export async function testMonthlyPlanning(db: PGlite) {
  const u = "00000000-0000-4000-8000-000000000101",
    other = "00000000-0000-4000-8000-000000000102";
  const one = async (sql: string, args: unknown[] = []) =>
    (await db.query<any>(sql, args)).rows[0];
  await db.exec("reset role");
  await db.query("insert into auth.users(id) values($1),($2)", [u, other]);
  const existing = await one(
    "insert into categories(user_id,name,kind) values($1,'Minha receita personalizada','income') returning id",
    [u],
  );
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${u}',false)`,
  );
  await db.query("select panco_initialize_planning()");
  const count = (await one("select count(*)::int n from categories")).n;
  await db.query("select panco_initialize_planning()");
  assert.equal((await one("select count(*)::int n from categories")).n, count);
  assert.equal(
    (await one("select id from categories where name='Minha receita personalizada'")).id,
    existing.id,
  );
  const food = await one(
    "select id from categories where name='Alimentação'",
  );
  const leisure = await one(
    "select id from categories where name='Lazer'",
  );
  await db.query("update categories set expense_group=null where id=$1", [
    leisure.id,
  ]);
  await db.query("select panco_initialize_planning()");
  assert.equal(
    (
      await one("select expense_group from categories where id=$1", [
        leisure.id,
      ])
    ).expense_group,
    null,
  );
  await db.query(
    "update categories set expense_group='non_essential' where id=$1",
    [leisure.id],
  );
  const account = await one(
    "insert into accounts(user_id,name,kind,currency,current_balance) values($1,'Manual','cash','BRL',555) returning id",
    [u],
  );
  async function movement(
    amount: string,
    category: string | null,
    direction = "expense",
    status = "posted",
    date = "2026-10-02T12:00:00Z",
    description = "Teste",
  ) {
    return one(
      "insert into transactions(user_id,account_id,description,merchant_key,amount,direction,status,source,currency,occurred_at,category_id) values($1,$2,$3,'teste',$4,$5,$6,'manual','BRL',$7,$8) returning id",
      [u, account.id, description, amount, direction, status, date, category],
    );
  }
  await movement("1000", existing.id, "income");
  await movement("120", food.id);
  await movement("30", leisure.id);
  await movement("7", null);
  await movement("99", food.id, "expense", "pending");
  await movement("99", food.id, "expense", "cancelled");
  await movement("99", food.id, "expense", "posted", "2026-11-02T12:00:00Z");
  await movement("99", food.id, "expense", "posted", "2026-10-01T01:00:00Z"); // September in Bahia
  await movement(
    "99",
    food.id,
    "income",
    "posted",
    "2026-10-02T12:00:00Z",
    "RES APLIC AUT MAIS",
  );
  await db.query(
    "insert into monthly_budgets(user_id,month,category_id,direction,amount) values($1,'2026-10-01',$2,'income',600),($1,'2026-10-01',$3,'expense',150),($1,'2026-10-01',$4,'expense',50)",
    [u, existing.id, food.id, leisure.id],
  );
  const card = await one(
    "insert into cards(user_id,name,currency) values($1,'Crédito','BRL') returning id",
    [u],
  );
  const invoice = await one(
    "insert into invoices(user_id,card_id,reference_month,due_date,status,currency,reported_total) values($1,$2,'2026-10-01','2026-10-10','OPEN','BRL',300) returning id",
    [u, card.id],
  );
  const payment = await movement("100", food.id);
  await db.query(
    "insert into invoice_payments(user_id,invoice_id,transaction_id,amount) values($1,$2,$3,100)",
    [u, invoice.id, payment.id],
  );
  await db.query(
    "insert into transactions(user_id,account_id,description,amount,direction,status,source,currency,occurred_at,projection_key) values($1,$2,'Projeção',55,'expense','pending','projection','BRL','2026-10-02T12:00:00Z','monthly-test')",
    [u, account.id],
  );
  const usd = await one(
    "insert into accounts(user_id,name,kind,currency) values($1,'Dólar','cash','USD') returning id",
    [u],
  );
  await db.query(
    "insert into transactions(user_id,account_id,description,amount,direction,status,source,currency,occurred_at) values($1,$2,'Dólar',88,'expense','posted','manual','USD','2026-10-02T12:00:00Z')",
    [u, usd.id],
  );
  let result = (await one("select monthly_overview('2026-10-01') data")).data;
  assert.equal(Number(result.actual_income), 1000);
  assert.equal(Number(result.actual_expense), 157);
  assert.equal(Number(result.estimated_result), 400);
  assert.equal(Number(result.actual_result), 843);
  assert.equal(Number(result.remaining_income), 0);
  assert.equal(Number(result.remaining_expense), 50);
  assert.equal(Number(result.invoice_due), 200);
  assert.equal(Number(result.projected_cash_balance), 305);
  assert.equal(
    Number(result.lines.find((x: any) => x.category_id === food.id).difference),
    30,
  );
  assert.equal(
    Number(result.lines.find((x: any) => x.category_id === null).actual),
    7,
  );
  assert.equal(
    Number(
      (
        await one("select current_balance from accounts where id=$1", [
          account.id,
        ])
      ).current_balance,
    ),
    555,
  );
  await db.query("update categories set archived_at=now() where id=$1", [
    food.id,
  ]);
  result = (await one("select monthly_overview('2026-10-01') data")).data;
  assert.equal(Number(result.actual_expense), 157);
  assert.equal(
    result.lines.find((x: any) => x.category_id === food.id).archived,
    true,
  );
  assert.equal(
    Number(
      (await one("select monthly_overview('2026-12-01') data")).data
        .actual_expense,
    ),
    0,
  );
  await assert.rejects(db.query("select monthly_overview('2026-10-02')"));
  await assert.rejects(db.query("select monthly_overview('2026-10-01','USD')"));
  await db.exec(`select set_config('request.jwt.claim.sub','${other}',false)`);
  result = (await one("select monthly_overview('2026-10-01') data")).data;
  assert.equal(Number(result.actual_expense), 0);
  assert.equal(Number(result.estimated_income), 0);
  assert.ok(!result.lines.some((x: any) => x.category_id === food.id));
  await db.exec("reset role;set role anon");
  await assert.rejects(db.query("select monthly_overview('2026-10-01')"));
  await db.exec("reset role");
  console.log(
    "Planejamento mensal: seed idempotente, IDs preservados, totais, fuso, exclusões, arquivadas e RLS OK",
  );
}
