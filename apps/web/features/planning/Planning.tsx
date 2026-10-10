import { useEffect, useMemo, useRef, useState } from "react";
import type { PancoController } from "../../../../packages/react-features/src/use-panco";
import type { MonthlyOverview } from "../../../../packages/react-features/src/types";
import { useMonthlyOverview } from "../../../../packages/react-features/src/use-monthly-overview";
import { cents, decimal } from "../../../../packages/core/src/money";
import { brl, monthLabel } from "../shared/format";
import { categoryEmoji } from "../../../../packages/react-features/src/category-icons";
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
  const planned = useMemo(() => {
    const total = (direction: "income" | "expense") =>
      report.lines
        .filter((line) => line.category_id && line.direction === direction)
        .reduce((sum, line) => {
          try {
            return sum + cents((values[key(line)] || "0").replace(",", "."));
          } catch {
            return sum;
          }
        }, 0n);
    const income = total("income"),
      expense = total("expense");
    return {
      income: decimal(income),
      expense: decimal(expense),
      result: decimal(income - expense),
    };
  }, [report.lines, values]);
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
    { id: "expense", title: "Saídas" },
  ];
  return (
    <form onSubmit={save}>
      <section className="plan-live-summary" aria-label="Resumo do planejamento">
        <div>
          <span>Entrada estimada</span>
          <strong className="positive">{brl(planned.income)}</strong>
        </div>
        <div>
          <span>Saída estimada</span>
          <strong className="negative">{brl(planned.expense)}</strong>
        </div>
        <div className="plan-live-result">
          <span>Sobra planejada</span>
          <strong className={Number(planned.result) < 0 ? "negative" : "positive"}>
            {brl(planned.result)}
          </strong>
        </div>
      </section>
      <div className="plan-sections">
        {groups.map((group) => {
          const lines = report.lines.filter((l) => l.direction === group.id);
          if (!lines.length) return null;
          return (
            <section className={`plan-section plan-${group.id}`} key={group.id}>
              <div className="section-top">
                <h2>{group.title}</h2>
                <span className="muted">
                  {group.id === "income"
                    ? "O que você espera receber"
                    : "Como pretende distribuir seu dinheiro"}
                </span>
              </div>
              <div className="plan-category-grid">
                {lines.map((line) => (
                  <label className="card plan-category" key={key(line)}>
                    <span className="plan-category-heading">
                      <span className="category-emoji" aria-hidden="true">
                        {categoryEmoji(
                          line.name,
                          panco.data.categories.find(
                            (c) => c.id === line.category_id,
                          )?.icon,
                        )}
                      </span>
                      <strong>
                        {line.name}
                        {line.archived ? " · Arquivada" : ""}
                      </strong>
                    </span>
                    {line.category_id ? (
                      <span className="plan-estimate-label">
                        {line.direction === "income"
                          ? "Quero receber"
                          : "Planejo gastar"}
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
                      </span>
                    ) : (
                      <span className="muted">Categorize os movimentos</span>
                    )}
                  </label>
                ))}
              </div>
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
