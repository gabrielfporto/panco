import type { MonthlyOverview } from "../../../../packages/react-features/src/types";
import { brl } from "../shared/format";
export function MonthlySummary({ report }: { report: MonthlyOverview }) {
  const fields = [
    ["Entrada estimada", report.estimated_income, "positive"],
    ["Entrada real", report.actual_income, "positive"],
    ["Saída estimada", report.estimated_expense, "negative"],
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
    <div className="planning-summary monthly-summary">
      {fields.map(([label, value, color]) => (
        <div className="card" key={String(label)}>
          <span>{label}</span>
          <strong className={String(color)}>{brl(value)}</strong>
        </div>
      ))}
    </div>
  );
}
