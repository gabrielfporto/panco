import { useEffect, useRef, useState } from "react";
import type { PancoController } from "../../../../packages/react-features/src/use-panco";
import type { MonthlyOverview } from "../../../../packages/react-features/src/types";
import { useMonthlyOverview } from "../../../../packages/react-features/src/use-monthly-overview";
import { cents, decimal } from "../../../../packages/core/src/money";
import { brl, monthLabel } from "../shared/format";
import { MonthlySummary } from "./MonthlySummary";
export function Planning({ panco }: { panco: PancoController }) {
  const { report, error } = useMonthlyOverview(panco);
  return (
    <>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {report ? (
        <MonthlyPlan key={panco.month} report={report} panco={panco} />
      ) : (
        <p role="status" className="empty">
          Carregando planejamento de {monthLabel(panco.month)}…
        </p>
      )}
    </>
  );
}
function MonthlyPlan({
  report,
  panco,
}: {
  report: MonthlyOverview;
  panco: PancoController;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const dirty = useRef(new Set<string>());
  const [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  const key = (line: MonthlyOverview["lines"][number]) =>
    `${line.category_id}:${line.direction}`;
  useEffect(() => {
    setValues((old) =>
      Object.fromEntries(
        report.lines
          .filter((l) => l.category_id)
          .map((l) => [
            key(l),
            dirty.current.has(key(l)) ? old[key(l)] : String(l.estimated),
          ]),
      ),
    );
  }, [report]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await panco.saveBudget(
        report.month,
        report.lines
          .filter((l) => l.category_id)
          .map((l) => ({
            category_id: l.category_id!,
            direction: l.direction,
            amount: decimal(
              cents((values[key(l)] || "0").trim().replace(",", ".")),
            ),
          })),
      );
      dirty.current.clear();
      setMessage("Planejamento salvo.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }
  const groups = [
    { id: "income", title: "Entradas" },
    { id: "essential", title: "Gastos essenciais" },
    { id: "non_essential", title: "Gastos não essenciais" },
    { id: "unassigned", title: "Gastos a organizar" },
  ];
  return (
    <form onSubmit={save}>
      <MonthlySummary report={report} />
      <p className="fine-print">
        {monthLabel(report.month)} · Valores em reais. O realizado usa
        movimentações confirmadas do mês, sem transferências, pagamentos de
        fatura vinculados ou resgates ignorados. O resultado do mês é diferente
        do saldo bancário.
      </p>
      <p className="fine-print">
        Salve suas estimativas para atualizar o resumo e as diferenças.
        Categorias antigas sem grupo continuam em “Gastos a organizar”; você
        pode definir o grupo na aba Categorias.
      </p>
      <div className="planning-columns">
        {groups.map((group) => {
          const lines = report.lines.filter((l) =>
            group.id === "income"
              ? l.direction === "income"
              : l.direction === "expense" &&
                (l.expense_group || "unassigned") === group.id,
          );
          if (!lines.length) return null;
          return (
            <section className="card" key={group.id}>
              <h2>{group.title}</h2>
              {lines.map((line) => (
                <label className="budget-row" key={key(line)}>
                  <span>
                    <strong>
                      {line.name}
                      {line.archived ? " · Arquivada" : ""}
                    </strong>
                    <small>Realizado: {brl(line.actual)}</small>
                    <small
                      className={
                        Number(line.difference) < 0 ? "negative" : "positive"
                      }
                    >
                      {line.direction === "income" ? "Diferença" : "Falta"}:{" "}
                      {brl(line.difference)}
                      {line.direction === "expense" &&
                      Number(line.difference) < 0
                        ? " · Acima do orçamento"
                        : ""}
                    </small>
                  </span>
                  {line.category_id ? (
                    <span className="budget-input">
                      R$
                      <input
                        aria-label={`${line.name} — ${line.direction === "income" ? "receita" : "despesa"} estimada`}
                        inputMode="decimal"
                        disabled={saving || line.archived}
                        value={values[key(line)] ?? String(line.estimated)}
                        onChange={(e) => {
                          dirty.current.add(key(line));
                          setValues((v) => ({
                            ...v,
                            [key(line)]: e.target.value,
                          }));
                          setMessage("Há alterações não salvas.");
                        }}
                      />
                    </span>
                  ) : (
                    <span className="muted">Categorize os movimentos</span>
                  )}
                </label>
              ))}
            </section>
          );
        })}
      </div>
      <div className="planning-save">
        <button
          className="primary-button"
          disabled={saving || !report.lines.some((l) => l.category_id)}
        >
          {saving ? "Salvando…" : "Salvar planejamento"}
        </button>
        <span role="status">{message}</span>
      </div>
    </form>
  );
}
