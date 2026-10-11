import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PancoController } from "../../../../packages/react-features/src/use-panco";
import { addMonths } from "../../../../packages/core/src/features/transactions/billing";
import { brl, monthLabel, today, shortDate } from "../shared/format";
export function Calendar({ panco }: { panco: PancoController }) {
  const month = panco.month + "-01";
  const setMonth = (value: string) => panco.setMonth(value.slice(0, 7));
  const [selected, setSelected] = useState(today());
  const selectedDate =
    selected.slice(0, 7) === panco.month ? selected : panco.month + "-01";
  const first = new Date(month + "T12:00:00Z"),
    days = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
    ).getUTCDate();
  const items = [
    ...panco.data.transactions
      .filter((t) => t.status !== "cancelled")
      .map((t) => ({
        id: t.id,
        date: (t.due_date || t.occurred_at).slice(0, 10),
        name: t.description,
        amount: t.amount,
        income: t.direction === "income",
        status:
          t.source === "projection"
            ? "Projetado"
            : t.status === "posted"
              ? "Confirmado"
              : "Programado",
      })),
    ...panco.data.invoices.map((i) => ({
      id: i.id,
      date: i.manual_due_date || i.due_date,
      name:
        "Fatura · " +
        (panco.data.cards.find((c) => c.id === i.card_id)?.name || "Cartão"),
      amount: i.remaining_due,
      income: false,
      status: "Fatura",
    })),
  ];
  const selectedItems = items.filter((t) => t.date === selectedDate);
  return (
    <div className="calendar-layout">
      <section className="card">
        <div className="section-top">
          <h2 className="capitalize">{monthLabel(month)}</h2>
          <div className="button-row">
            <button
              className="icon-button"
              aria-label="Mês anterior"
              onClick={() => setMonth(addMonths(month, -1))}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="text-button"
              onClick={() => {
                setMonth(today().slice(0, 7) + "-01");
                setSelected(today());
              }}
            >
              Hoje
            </button>
            <button
              className="icon-button"
              aria-label="Próximo mês"
              onClick={() => setMonth(addMonths(month, 1))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        <div className="calendar-grid">
          {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map((d) => (
            <span className="weekday" key={d}>
              {d}
            </span>
          ))}
          {Array.from({ length: first.getUTCDay() }, (_, i) => (
            <div key={"blank" + i} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const day =
                month.slice(0, 7) + "-" + String(i + 1).padStart(2, "0"),
              entries = items.filter((t) => t.date === day);
            return (
              <button
                key={day}
                className={
                  "calendar-day " +
                  (day === selectedDate ? "selected " : "") +
                  (day === today() ? "today" : "")
                }
                onClick={() => setSelected(day)}
                aria-pressed={day === selectedDate}
              >
                <b>{i + 1}</b>
                {entries.length > 0 && (
                  <span
                    className="calendar-day-count"
                    aria-label={`${entries.length} movimentos`}
                  >
                    {entries.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>
      <aside className="card day-detail" aria-live="polite">
        <span className="eyebrow">UM DIA DE CADA VEZ</span>
        <h2>{shortDate(selectedDate)}</h2>
        {selectedItems.length ? (
          selectedItems.map((t) => (
            <div className="day-item" key={t.id}>
              <span
                className={"event-dot " + (t.income ? "positive-bg" : "")}
              />
              <div className="grow">
                <strong>{t.name}</strong>
                <small>{t.status}</small>
                <b className={t.income ? "positive" : ""}>{brl(t.amount)}</b>
              </div>
            </div>
          ))
        ) : (
          <p className="empty">
            Nada programado para este dia.
            <br />
            Um respiro no calendário.
          </p>
        )}
      </aside>
    </div>
  );
}
