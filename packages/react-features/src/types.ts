export type Money = string | number;
export interface Account {
  connection_id?: string | null;
  archived_at?: string | null;
  pluggy_account_id?: string | null;
  id: string;
  name: string;
  current_balance: Money;
  currency: string;
  include_in_forecast: boolean;
  balance_as_of: string | null;
  kind: string;
}
export interface Card {
  connection_id?: string | null;
  id: string;
  name: string;
  brand: string | null;
  last_four: string | null;
  total_limit: Money | null;
  available_limit: Money | null;
  closing_day: number | null;
  due_day: number | null;
  payment_account_id: string | null;
  currency: string;
}
export interface Category {
  expense_group?: "essential" | "non_essential" | null;
  sort_order?: number;
  archived_at?: string | null;
  id: string;
  name: string;
  kind: string;
  color: string;
  icon: string;
}
export interface Transaction {
  id: string;
  account_id: string | null;
  card_id: string | null;
  invoice_id: string | null;
  category_id: string | null;
  description: string;
  merchant_name: string | null;
  merchant_key: string | null;
  amount: Money;
  direction: "income" | "expense";
  status: "pending" | "posted" | "cancelled";
  source: string;
  occurred_at: string;
  due_date: string | null;
  installment_number: number | null;
  total_installments: number | null;
  defer_to_next_month: boolean;
  needs_review: boolean;
  kind: string;
  currency: string;
}
export interface Invoice {
  id: string;
  card_id: string;
  due_date: string;
  closing_date: string | null;
  status: string;
  remaining_due: Money;
  reported_total: Money | null;
  estimated_total: Money;
  total_paid: Money;
}
export interface Subscription {
  id: string;
  name: string;
  amount: Money;
  interval_unit: string;
  interval_count: number;
  next_due_date: string;
  status: string;
  account_id: string | null;
  card_id: string | null;
}
export interface Investment {
  pluggy_investment_id?: string | null;
  valued_at?: string | null;
  currency?: string;
  id: string;
  name: string;
  asset_class: string;
  current_value: Money | null;
  cost_basis: Money | null;
}
export interface Income {
  amount_basis?: "net" | "gross";
  id: string;
  investment_id: string;
  payment_date: string;
  net_amount: Money;
  kind: string;
  status: string;
}
export interface Forecast {
  current_balance: Money;
  pending_income: Money;
  pending_expenses: Money;
  invoices_due: Money;
  projected_balance: Money;
  review_count: number;
  missing_balance_count: number;
  as_of: string | null;
  through: string;
}
export interface Budget {
  id?: string;
  month: string;
  category_id: string;
  direction: "income" | "expense";
  amount: Money;
}
export interface PancoData {
  budgets?: Budget[];
  accounts: Account[];
  cards: Card[];
  categories: Category[];
  transactions: Transaction[];
  invoices: Invoice[];
  subscriptions: Subscription[];
  investments: Investment[];
  investment_income: Income[];
  forecast: Forecast;
}
export interface AssistantCard {
  type: "spending_summary" | "forecast";
  title?: string;
  amount?: Money;
  count?: number;
  from?: string;
  to?: string;
  projected_balance?: Money;
  through?: string;
}
export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  cards?: AssistantCard[];
}
export type Feature =
  | "planning"
  | "dashboard"
  | "calendar"
  | "transactions"
  | "cards"
  | "subscriptions"
  | "categories"
  | "investments"
  | "assistant";

export interface MonthlyLine {
  category_id: string | null;
  name: string;
  direction: "income" | "expense";
  expense_group: "essential" | "non_essential" | null;
  archived: boolean;
  estimated: Money;
  actual: Money;
  difference: Money;
}
export interface MonthlyOverview {
  month: string;
  currency: string;
  estimated_income: Money;
  estimated_expense: Money;
  actual_income: Money;
  actual_expense: Money;
  estimated_result: Money;
  actual_result: Money;
  remaining_income: Money;
  remaining_expense: Money;
  current_balance: Money;
  invoice_due: Money;
  projected_cash_balance: Money;
  lines: MonthlyLine[];
}
