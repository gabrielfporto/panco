import { cents, decimal } from "../../money.ts";
import { dateOnly, merchantKey } from "./billing.ts";
export interface PluggyTransaction {
  id: string;
  accountId: string;
  date: string;
  amount: number | string;
  description: string;
  currencyCode: string;
  status: "PENDING" | "POSTED";
  type?: string;
  updatedAt?: string;
  merchant?: { name?: string; cnpj?: string } | null;
  paymentData?: { paymentMethod?: string } | null;
  creditCardMetadata?: {
    installmentNumber?: number;
    totalInstallments?: number;
    purchaseDate?: string;
    billId?: string;
    billForecastDate?: string;
    billClosingDate?: string;
    cardNumber?: string;
  } | null;
}
export function normalizeTransaction(t: PluggyTransaction, isCard: boolean) {
  if (
    !t.id ||
    !t.accountId ||
    !t.description ||
    !["PENDING", "POSTED"].includes(t.status)
  )
    throw new Error("Transação Pluggy inválida");
  dateOnly(t.date);
  const signed = cents(t.amount);
  const meta = t.creditCardMetadata;
  const n = meta?.installmentNumber,
    total = meta?.totalInstallments;
  const valid =
    Number.isInteger(n) && Number.isInteger(total) && n! >= 1 && n! <= total!;
  const name = t.merchant?.name?.trim() || null;
  // Pluggy's Open Finance forecast is a billing period, not a due date.
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
    amount: decimal(signed < 0n ? -signed : signed),
    direction: (isCard ? signed >= 0n : signed < 0n) ? "expense" : "income",
    currency: t.currencyCode,
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
// Nunca seguir URLs fornecidas por webhook com a credencial do provedor.
export function nextTransactionPath(next: string, accountId: string): string {
  if (!next.startsWith("?") || next.includes("#"))
    throw new Error("Cursor inválido");
  const params = new URLSearchParams(next);
  if (
    params.get("accountId") !== accountId ||
    params.getAll("accountId").length !== 1 ||
    !params.get("after")
  )
    throw new Error("Cursor fora da conta");
  return "/v2/transactions" + next;
}
