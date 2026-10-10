import type { MonthlyOverview } from "../../../../packages/react-features/src/types";
import { brl } from "../shared/format";
export function MonthlySummary({
  report,
  variant,
}: {
  report: MonthlyOverview;
  variant: "planning" | "overview";
}) {
  const fields =
    variant === "planning"
      ? [
          ["Entrada estimada", report.estimated_income, "positive"],
          ["Saída estimada", report.estimated_expense, "negative"],
        ]
      : [
          ["Entrada real", report.actual_income, "positive"],
          ["Saída real", report.actual_expense, "negative"],
          [
            "Resultado estimado",
            report.estimated_result,
            Number(report.estimated_result) < 0 ? "negative" : "positive",
          ],
          [
            "Resultado real",
            report.actual_result,
            Number(report.actual_result) < 0 ? "negative" : "positive",
          ],
        ];
  return (
    <section
      className={`monthly-summary monthly-summary-${variant}`}
      aria-label={
        variant === "planning" ? "Estimativas do mês" : "Resumo do mês"
      }
    >
      {fields.map(([label, value, color]) => (
        <div className="monthly-metric" key={String(label)}>
          <span>{label}</span>
          <strong className={String(color)}>{brl(value)}</strong>
        </div>
      ))}
    </section>
  );
}
