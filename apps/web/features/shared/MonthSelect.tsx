import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { monthLabel } from "./format";

const names = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

export function MonthSelect({
  value,
  onChange,
  label = "Selecionar mês",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(
    Number(value.slice(0, 4)) || new Date().getFullYear(),
  );
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (value) setYear(Number(value.slice(0, 4)));
  }, [value]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key === "Escape")
        setOpen(false);
      if (
        event instanceof MouseEvent &&
        !ref.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div className="month-select" ref={ref}>
      <button
        type="button"
        className="month-select-trigger"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{value ? monthLabel(value) : "Todo o histórico"}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="month-select-panel">
          <div className="month-select-year">
            <button
              type="button"
              aria-label="Ano anterior"
              onClick={() => setYear((y) => y - 1)}
            >
              <ChevronLeft size={17} />
            </button>
            <strong>{year}</strong>
            <button
              type="button"
              aria-label="Próximo ano"
              onClick={() => setYear((y) => y + 1)}
            >
              <ChevronRight size={17} />
            </button>
          </div>
          <div className="month-select-grid">
            {names.map((name, index) => {
              const month = `${year}-${String(index + 1).padStart(2, "0")}`;
              return (
                <button
                  type="button"
                  key={month}
                  className={value === month ? "active" : ""}
                  aria-pressed={value === month}
                  onClick={() => {
                    onChange(month);
                    setOpen(false);
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
