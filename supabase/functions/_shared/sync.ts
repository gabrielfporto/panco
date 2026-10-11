import { admin, check, env, HttpError, ownerId, syncStage } from "./http.ts";
import { Pluggy, type PluggyTransaction } from "./pluggy.ts";
function cents(value: string | number): bigint {
  const s = String(value);
  if (!/^-?\d+(\.\d{1,2})?$/.test(s))
    throw new Error(`Valor monetário inválido: ${s}`);
  const negative = s.startsWith("-");
  const [whole, fraction = ""] = s.replace("-", "").split(".");
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -result : result;
}
function decimal(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}
function dateOnly(value: string): string {
  const day = value.slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) !== day
  )
    throw new Error("Data inválida");
  return day;
}
const merchantKey = (name: string) =>
  name.normalize("NFKC").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
function normalizeTransaction(
  t: PluggyTransaction,
  isCard: boolean,
  accountCurrency = t.currencyCode,
) {
  if (
    !t.id ||
    !t.accountId ||
    !t.description ||
    !["PENDING", "POSTED"].includes(t.status)
  )
    throw new Error("Transação Pluggy inválida");
  dateOnly(t.date);
  const signed = cents(t.amount);
  const foreign = t.currencyCode !== accountCurrency;
  if (foreign && t.amountInAccountCurrency == null)
    throw new Error("Valor convertido da transação não informado pela Pluggy");
  const booked = foreign ? cents(t.amountInAccountCurrency!) : signed;
  const meta = t.creditCardMetadata;
  const n = meta?.installmentNumber,
    total = meta?.totalInstallments;
  const valid =
    Number.isInteger(n) && Number.isInteger(total) && n! >= 1 && n! <= total!;
  const name = t.merchant?.name?.trim() || null;
  const forecast = meta?.billForecastDate;
  const forecastMonth =
    forecast && /^\d{4}-\d{2}$/.test(forecast)
      ? dateOnly(`${forecast}-01`)
      : null;
  return {
    pluggy_transaction_id: t.id,
    occurred_at: t.date,
    description: t.description,
    merchant_name: name,
    merchant_key: merchantKey(name || t.description),
    amount: decimal(booked < 0n ? -booked : booked),
    direction: (isCard ? signed >= 0n : signed < 0n) ? "expense" : "income",
    currency: accountCurrency,
    original_currency: foreign ? t.currencyCode : null,
    original_amount: foreign ? decimal(signed < 0n ? -signed : signed) : null,
    status: t.status === "POSTED" ? "posted" : "pending",
    provider_status: t.status,
    payment_method: t.paymentData?.paymentMethod || null,
    kind:
      t.paymentData?.paymentMethod === "PAGAMENTO_FATURA"
        ? "invoice_payment"
        : "regular",
    installment_number: valid ? n : null,
    total_installments: valid ? total : null,
    provider_updated_at: t.updatedAt || null,
    source: "pluggy",
    purchase_date: meta?.purchaseDate ? dateOnly(meta.purchaseDate) : null,
    pluggy_bill_id: meta?.billId || null,
    bill_forecast_month: forecastMonth,
    bill_forecast_date: forecast && !forecastMonth ? dateOnly(forecast) : null,
    bill_closing_date: meta?.billClosingDate
      ? dateOnly(meta.billClosingDate)
      : null,
  };
}
type DB = ReturnType<typeof admin>;
export interface Connection {
  id: string;
  user_id: string;
  pluggy_item_id: string;
}
interface Account {
  id: string;
  itemId: string;
  name: string;
  type: string;
  subtype: string;
  currencyCode: string;
  balance: number;
  updatedAt?: string;
  number?: string;
  creditData?: {
    brand?: string;
    creditLimit?: number;
    availableCreditLimit?: number;
    balanceCloseDate?: string;
    balanceDueDate?: string;
  };
}
interface Bill {
  id: string;
  dueDate: string;
  billClosingDate?: string;
  totalAmount: number;
  totalAmountCurrencyCode: string;
  payments?: { id?: string; amount: number; currencyCode: string }[];
}
export async function connection(db: DB, itemId: string): Promise<Connection> {
  const row = check(
    await db
      .from("open_finance_connections")
      .select("id,user_id,pluggy_item_id,status")
      .eq("pluggy_item_id", itemId)
      .eq("user_id", ownerId())
      .maybeSingle(),
  );
  if (!row || row.status === "revoked")
    throw new HttpError(404, "Item não cadastrado. Use Adicionar conta.");
  return row as Connection;
}
export async function registerConnection(
  db: DB,
  api: Pluggy,
  itemId: string,
): Promise<Connection> {
  if (!/^[a-zA-Z0-9-]{1,128}$/.test(itemId))
    throw new HttpError(
      400,
      "Item ID inválido. Cole somente o ID, não uma URL.",
    );
  // A consulta autenticada verifica se o Item pertence à aplicação Pluggy configurada.
  const item = await api.get<{ id: string }>(
    "/items/" + encodeURIComponent(itemId),
  );
  if (item.id !== itemId)
    throw new HttpError(502, "Resposta Pluggy incompatível com o Item.");
  check(
    await db
      .from("open_finance_connections")
      .upsert(
        { user_id: ownerId(), pluggy_item_id: itemId },
        { onConflict: "pluggy_item_id", ignoreDuplicates: true },
      ),
  );
  return connection(db, itemId);
}
export async function importAccounts(db: DB, api: Pluggy, c: Connection) {
  const accounts = await api.all<Account>(
    "/accounts?itemId=" + encodeURIComponent(c.pluggy_item_id),
  );
  for (const a of accounts) {
    if (a.itemId !== c.pluggy_item_id) throw new Error("Conta de outro Item");
    const base = {
      user_id: c.user_id,
      connection_id: c.id,
      pluggy_account_id: a.id,
      name: a.name,
      currency: a.currencyCode,
    };
    if (a.type === "BANK")
      check(
        await db.from("accounts").upsert(
          {
            ...base,
            kind: a.subtype === "SAVINGS_ACCOUNT" ? "savings" : "checking",
            current_balance: decimal(cents(a.balance)),
            balance_as_of: a.updatedAt || null,
          },
          { onConflict: "connection_id,pluggy_account_id" },
        ),
      );
    else if (a.type === "CREDIT") {
      const credit = a.creditData || {};
      const current = check(
        await db
          .from("cards")
          .select("dates_manually_set")
          .eq("connection_id", c.id)
          .eq("pluggy_account_id", a.id)
          .maybeSingle(),
      );
      const providerClosingDay = credit.balanceCloseDate
        ? Number(credit.balanceCloseDate.slice(8, 10))
        : null;
      const providerDueDay = credit.balanceDueDate
        ? Number(credit.balanceDueDate.slice(8, 10))
        : null;
      const card: Record<string, unknown> = {
        ...base,
        brand: credit.brand || null,
        total_limit: credit.creditLimit ?? null,
        available_limit: credit.availableCreditLimit ?? null,
        provider_closing_day: providerClosingDay,
        provider_due_day: providerDueDay,
      };
      if (!current?.dates_manually_set) {
        if (providerClosingDay) card.closing_day = providerClosingDay;
        if (providerDueDay) card.due_day = providerDueDay;
      }
      if (a.number && /\d{4}$/.test(a.number))
        card.last_four = a.number.slice(-4);
      check(
        await db
          .from("cards")
          .upsert(card, { onConflict: "connection_id,pluggy_account_id" }),
      );
    }
  }
  return accounts
    .filter((a) => ["BANK", "CREDIT"].includes(a.type))
    .map((a) => ({ id: a.id, name: a.name, type: a.type }));
}
export async function importBills(
  db: DB,
  api: Pluggy,
  c: Connection,
  accountId: string,
) {
  const card = check(
    await db
      .from("cards")
      .select("*")
      .eq("connection_id", c.id)
      .eq("pluggy_account_id", accountId)
      .maybeSingle(),
  );
  if (!card) return;
  const bills = await api.all<Bill>(
    "/bills?accountId=" + encodeURIComponent(accountId),
  );
  for (const bill of bills) {
    if (bill.totalAmountCurrencyCode !== card.currency)
      throw new Error("Moeda de fatura divergente");
    const due = bill.dueDate.slice(0, 10),
      closing = bill.billClosingDate?.slice(0, 10) || null;
    const paid = (bill.payments || [])
      .filter((p) => p.currencyCode === card.currency)
      .reduce((sum, p) => sum + cents(p.amount), 0n);
    check(
      await db.from("invoices").upsert(
        {
          user_id: c.user_id,
          card_id: card.id,
          pluggy_bill_id: bill.id,
          reference_month: due.slice(0, 7) + "-01",
          closing_date: closing,
          due_date: due,
          status:
            closing && closing < new Date().toISOString().slice(0, 10)
              ? "CLOSED"
              : "OPEN",
          currency: card.currency,
          reported_total: decimal(cents(bill.totalAmount)),
          provider_paid: decimal(paid),
          total_paid: decimal(paid),
          source: "pluggy",
          synced_at: new Date().toISOString(),
        },
        { onConflict: "card_id,reference_month" },
      ),
    );
  }
  check(await db.rpc("auro_rebuild_invoices", { p_user: c.user_id }));
}
export async function mappedRows(
  db: DB,
  c: Connection,
  accountId: string,
  rows: PluggyTransaction[],
) {
  const card = check(
    await db
      .from("cards")
      .select("id,currency")
      .eq("connection_id", c.id)
      .eq("pluggy_account_id", accountId)
      .maybeSingle(),
  );
  const account = card || check(await db.from("accounts").select("id,currency")
    .eq("connection_id",c.id).eq("pluggy_account_id",accountId).single());
  if (!account) throw new Error("Conta não encontrada");
  return rows.map((t) => {
    if (t.accountId !== accountId) throw new Error("Conta divergente");
    return {
      ...normalizeTransaction(t, !!card, account.currency),
      external_account_id: accountId,
    };
  });
}
export async function syncAccount(
  db: DB,
  api: Pluggy,
  c: Connection,
  accountId: string,
  resource = "history",
  createdAtFrom?: string,
) {
  const claim = check(
    await db.rpc("auro_claim_sync", {
      p_connection: c.id,
      p_resource: resource + ":" + accountId,
      p_query: { accountId, ...(createdAtFrom ? { createdAtFrom } : {}) },
    }),
  );
  if (claim.busy) throw new HttpError(409, "Sincronização já em andamento.");
  let next: string | null = claim.next;
  let imported = 0;
  try {
    for (let i = 0; i < 2; i++) {
      const page = await syncStage("consulta de transações", () => api.page(accountId, next, createdAtFrom));
      if (page.next && page.next === next) throw new Error("Cursor repetido");
      const rows = await syncStage("leitura das transações", () => mappedRows(db, c, accountId, page.results));
      imported += await syncStage("gravação das transações", async () => check(
        await db.rpc("auro_commit_page", {
          p_checkpoint: claim.id,
          p_token: claim.token,
          p_rows: rows,
          p_next: page.next,
        }),
      ));
      next = page.next;
      if (!next) break;
    }
    return { imported, more: next !== null };
  } finally {
    check(
      await db
        .from("sync_checkpoints")
        .update({ lease_until: null })
        .eq("id", claim.id)
        .eq("lease_token", claim.token),
    );
  }
}
interface Investment {
  id: string;
  itemId: string;
  name: string;
  type: string;
  subtype?: string;
  currencyCode: string;
  balance: number;
  amountOriginal?: number;
  quantity?: number;
  date: string;
}
export async function syncInvestments(db: DB, api: Pluggy, c: Connection) {
  const rows = await api.all<Investment>(
    "/investments?itemId=" + encodeURIComponent(c.pluggy_item_id),
  );
  for (const r of rows) {
    if (r.itemId !== c.pluggy_item_id)
      throw new Error("Investimento fora do Item");
    const custody = check(
      await db
        .from("accounts")
        .upsert(
          {
            user_id: c.user_id,
            connection_id: c.id,
            pluggy_account_id: "custody:" + r.currencyCode,
            name: "Carteira de investimentos",
            kind: "investment",
            currency: r.currencyCode,
            include_in_forecast: false,
            current_balance: 0,
          },
          { onConflict: "connection_id,pluggy_account_id" },
        )
        .select("id")
        .single(),
    );
    if (!custody) throw new Error("Custódia não criada");
    const investment = check(
      await db
        .from("investments")
        .upsert(
          {
            user_id: c.user_id,
            connection_id: c.id,
            account_id: custody.id,
            pluggy_investment_id: r.id,
            name: r.name,
            asset_class:
              r.subtype === "REAL_ESTATE_FUND"
                ? "reit"
                : {
                    FIXED_INCOME: "fixed_income",
                    EQUITY: "equity",
                    MUTUAL_FUND: "fund",
                    ETF: "fund",
                  }[r.type] || "other",
            currency: r.currencyCode,
            current_value: r.balance,
            cost_basis: r.amountOriginal ?? null,
            quantity: r.quantity ?? null,
            valued_at: r.date,
          },
          { onConflict: "connection_id,pluggy_investment_id" },
        )
        .select("id")
        .single(),
    );
    if (!investment) throw new Error("Posição não criada");
    const movements = await api.all<{
      id?: string;
      type: string;
      date: string;
      netAmount?: number | null;
      amount: number;
    }>("/investments/" + encodeURIComponent(r.id) + "/transactions");
    for (const movement of movements) {
      // INTEREST cobre distribuições. AMORTIZATION é devolução de principal, não renda.
      if (movement.type !== "INTEREST" || !movement.id) continue;
      check(
        await db.from("investment_income").upsert(
          {
            user_id: c.user_id,
            investment_id: investment.id,
            provider_event_id: movement.id,
            kind: "distribution",
            payment_date: movement.date.slice(0, 10),
            net_amount: movement.netAmount ?? movement.amount,
            currency: r.currencyCode,
            status: "paid",
            amount_basis: movement.netAmount == null ? "gross" : "net",
          },
          { onConflict: "investment_id,provider_event_id" },
        ),
      );
    }
  }
  return { investments: rows.length };
}
