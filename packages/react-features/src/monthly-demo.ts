import { transactionMonth } from "../../core/src/features/transactions/period.ts";
import { cents, decimal } from "../../core/src/money.ts";
import type { PancoData, MonthlyOverview, MonthlyLine } from "./types.ts";
// Demonstration only; production reports are computed by monthly_overview in PostgreSQL.
export function demoMonthlyOverview(
  data: PancoData,
  month: string,
): MonthlyOverview {
  const lines: MonthlyLine[] = data.categories
    .filter((c) => !c.archived_at)
    .flatMap((c) =>
      (["income", "expense"] as const)
        .filter((d) => c.kind === d || c.kind === "both")
        .map((d) => ({
          category_id: c.id,
          name: c.name,
          direction: d,
          expense_group: d === "expense" ? c.expense_group || null : null,
          archived: false,
          estimated:
            data.budgets?.find(
              (b) =>
                b.month === month + "-01" &&
                b.category_id === c.id &&
                b.direction === d,
            )?.amount || "0",
          actual: "0",
          difference: "0",
        })),
    );
  for (const t of data.transactions) {
    if (
      t.status !== "posted" ||
      t.source === "projection" ||
      t.kind !== "regular" ||
      t.currency !== "BRL" ||
      transactionMonth(t) !== month
    )
      continue;
    let line = lines.find(
      (l) => l.category_id === t.category_id && l.direction === t.direction,
    );
    if (!line) {
      line = {
        category_id: t.category_id,
        name:
          data.categories.find((c) => c.id === t.category_id)?.name ||
          "Sem categoria",
        direction: t.direction,
        expense_group: null,
        archived: false,
        estimated: "0",
        actual: "0",
        difference: "0",
      };
      lines.push(line);
    }
    line.actual = decimal(cents(line.actual) + cents(t.amount));
  }
  for (const l of lines)
    l.difference = decimal(
      l.direction === "income"
        ? cents(l.actual) - cents(l.estimated)
        : cents(l.estimated) - cents(l.actual),
    );
  const total = (direction: string, key: "estimated" | "actual") =>
    lines
      .filter((l) => l.direction === direction)
      .reduce((n, l) => n + cents(l[key]), 0n);
  return {
    month: month + "-01",
    currency: "BRL",
    estimated_income: decimal(total("income", "estimated")),
    estimated_expense: decimal(total("expense", "estimated")),
    actual_income: decimal(total("income", "actual")),
    actual_expense: decimal(total("expense", "actual")),
    estimated_result: decimal(
      total("income", "estimated") - total("expense", "estimated"),
    ),
    actual_result: decimal(
      total("income", "actual") - total("expense", "actual"),
    ),
    lines,
  };
}
