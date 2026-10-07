import { useState } from "react";
import type { PancoController } from "../../../../packages/react-features/src/use-panco";
import { cents, decimal } from "../../../../packages/core/src/money";
import { brl, today, monthLabel } from "../shared/format";

export function Planning({ panco }: { panco: PancoController }) {
  const [month, setMonth] = useState(today().slice(0, 7));
  return (
    <>
      <label className="planning-month">
        Mês do planejamento
        <input
          type="month"
          value={month}
          onChange={(e) => {
            if (e.target.value) setMonth(e.target.value);
          }}
        />
      </label>
      <MonthlyPlan key={month} month={month} panco={panco} />
    </>
  );
}

function MonthlyPlan({
  month,
  panco,
}: {
  month: string;
  panco: PancoController;
}) {
  const categories = panco.data.categories;
  const lines = categories.flatMap((category) =>
    (["income", "expense"] as const)
      .filter(
        (direction) => category.kind === direction || category.kind === "both",
      )
      .map((direction) => ({
        category,
        direction,
        key: `${category.id}:${direction}`,
      })),
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      lines.map((line) => [
        line.key,
        String(
          panco.data.budgets?.find(
            (b) =>
              b.month === month + "-01" &&
              b.category_id === line.category.id &&
              b.direction === line.direction,
          )?.amount ?? "",
        ),
      ]),
    ),
  );
  const [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  const parsed = (value: string) =>
    cents((value.trim() || "0").replace(",", "."));
  const total = (direction: string) =>
    lines
      .filter((l) => l.direction === direction)
      .reduce((sum, l) => {
        try {
          return sum + parsed(values[l.key] || "");
        } catch {
          return sum;
        }
      }, 0n);
  const income = total("income"),
    expense = total("expense");
  const actual = (category: string, direction: string) =>
    panco.data.transactions
      .filter(
        (t) =>
          t.category_id === category &&
          t.direction === direction &&
          t.status === "posted" &&
          t.source !== "projection" &&
          t.kind === "regular" &&
          t.currency === "BRL" &&
          t.occurred_at.startsWith(month),
      )
      .reduce((sum, t) => sum + cents(t.amount), 0n);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setSaving(true);
    try {
      await panco.saveBudget(
        month + "-01",
        lines.map((l) => ({
          category_id: l.category.id,
          direction: l.direction,
          amount: decimal(parsed(values[l.key] || "")),
        })),
      );
      setMessage("Planejamento salvo.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={save}>
      <div className="planning-summary">
        <div className="card">
          <span>Receita estimada</span>
          <strong className="positive">{brl(decimal(income))}</strong>
        </div>
        <div className="card">
          <span>Despesa estimada</span>
          <strong className="negative">{brl(decimal(expense))}</strong>
        </div>
        <div className="card">
          <span>Resultado planejado</span>
          <strong className={income >= expense ? "positive" : "negative"}>
            {brl(decimal(income - expense))}
          </strong>
        </div>
      </div>
      <p className="fine-print">
        Valores em reais para {monthLabel(month)}. O planejamento não cria
        transações nem altera seu saldo. Realizado considera lançamentos
        confirmados; transferências, projeções e o filtro de resgates ficam de
        fora.
      </p>
      <div className="planning-columns">
        {(["income", "expense"] as const).map((direction) => (
          <section className="card" key={direction}>
            <h2>
              {direction === "income"
                ? "Quanto espero receber"
                : "Quanto espero gastar"}
            </h2>
            {lines
              .filter((l) => l.direction === direction)
              .map((line) => (
                <label className="budget-row" key={line.key}>
                  <span>
                    <strong>{line.category.name}</strong>
                    <small>
                      Realizado:{" "}
                      {brl(decimal(actual(line.category.id, direction)))}
                    </small>
                  </span>
                  <span className="budget-input">
                    R$
                    <input
                      aria-label={`${line.category.name} — ${direction === "income" ? "receita" : "despesa"} estimada`}
                      inputMode="decimal"
                      placeholder="0,00"
                      value={values[line.key] || ""}
                      onChange={(e) => {
                        setValues({ ...values, [line.key]: e.target.value });
                        setMessage("");
                      }}
                    />
                  </span>
                </label>
              ))}
            {!lines.some((l) => l.direction === direction) && (
              <p className="empty">
                Crie uma categoria de{" "}
                {direction === "income" ? "receita" : "despesa"} na aba
                Categorias.
              </p>
            )}
          </section>
        ))}
      </div>
      <div className="planning-save">
        <button className="primary-button" disabled={saving || !lines.length}>
          {saving ? "Salvando…" : "Salvar planejamento"}
        </button>
        <span role="status">{message}</span>
      </div>
    </form>
  );
}
