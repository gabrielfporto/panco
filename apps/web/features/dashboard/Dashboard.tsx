import { transactionMonth } from "../../../../packages/core/src/features/transactions/period";
import {
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRight,
  Wallet,
  CalendarDays,
  Sparkles,
} from "lucide-react";
import type { PancoController } from "../../../../packages/react-features/src/use-panco";
import type { Feature } from "../../../../packages/react-features/src/types";
import { useMonthlyOverview } from "../../../../packages/react-features/src/use-monthly-overview";
import { MonthlySummary } from "../planning/MonthlySummary";
import { AccountLogo } from "../shared/AccountLogo";
import { cents, decimal } from "../../../../packages/core/src/money";
import { brl, shortDate, today, monthLabel } from "../shared/format";
export function Dashboard({
  panco,
  navigate,
}: {
  panco: PancoController;
  navigate: (f: Feature) => void;
}) {
  const { data } = panco;
  const f = data.forecast;
  const bankAccounts = data.accounts.filter(
    (a) => !a.archived_at && a.kind !== "investment" && a.currency === "BRL",
  );
  const currentTotal = decimal(
    bankAccounts.reduce((sum, a) => sum + cents(a.current_balance), 0n),
  );
  const { report, error } = useMonthlyOverview(panco);
  const income = Number(report?.actual_income || 0),
    expense = Number(report?.actual_expense || 0);
  const actual = data.transactions.filter(
    (t) =>
      t.status === "posted" &&
      t.source !== "projection" &&
      t.kind === "regular" &&
      t.currency === "BRL" &&
      transactionMonth(t) === panco.month,
  );
  const percent = income + expense ? (income / (income + expense)) * 100 : 0;
  const upcoming = [
    ...data.transactions
      .filter((t) => t.account_id && t.status === "pending")
      .map((t) => ({
        id: t.id,
        name: t.description,
        date: t.due_date || t.occurred_at,
        amount: t.amount,
        income: t.direction === "income",
        label: "Conta bancária",
      })),
    ...data.invoices
      .filter((i) => Number(i.remaining_due) > 0)
      .map((i) => ({
        id: i.id,
        name:
          "Fatura · " +
          (data.cards.find((c) => c.id === i.card_id)?.name || "Cartão"),
        date: i.due_date,
        amount: i.remaining_due,
        income: false,
        label:
          (i.due_date < today() ? "Vencida · " : "Fatura de ") +
          monthLabel(i.due_date),
      })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);
  return (
    <>
      <div className="welcome">
        <div>
          <span className="eyebrow">
            UM POUCO MAIS DE CLAREZA, TODOS OS DIAS
          </span>
          <h1>
            Seu dinheiro.
            <br className="mobile-only" /> Mais possibilidades.
          </h1>
          <p>Um olhar tranquilo para o presente e para o que vem a seguir.</p>
        </div>
        <span className="welcome-mark">✳</span>
      </div>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {report && (
        <>
          <h2 className="capitalize">{monthLabel(panco.month)}</h2>
          <MonthlySummary report={report} />
          <p className="fine-print">
            Resultado mensal = entradas menos saídas confirmadas. O saldo
            bancário atual aparece separadamente abaixo.
          </p>
        </>
      )}
      <div className="stat-grid">
        <section className="card projection">
          <div className="card-eyebrow">
            <span>
              <Wallet size={17} /> Saldo atual nas contas
            </span>
            <span className="light-tag">AGORA · BRL</span>
          </div>
          <div className="hero-number">{brl(currentTotal)}</div>
          <p>
            Total das contas em reais, sem somar investimentos ou limite de
            cartão.
          </p>
          <div className="account-balances">
            {bankAccounts.map((a) => (
              <div className="account-balance" key={a.id}>
                <AccountLogo name={a.name} />
                <span>
                  <strong>{a.name}</strong>
                  <small>
                    {{
                      checking: "Conta corrente",
                      savings: "Poupança",
                      cash: "Dinheiro",
                      other: "Outra conta",
                    }[a.kind] || a.kind}
                  </small>
                </span>
                <b className={Number(a.current_balance) < 0 ? "negative" : ""}>
                  {brl(a.current_balance)}
                </b>
              </div>
            ))}
          </div>
          {!bankAccounts.length && <p>Nenhuma conta cadastrada.</p>}
          <div className="projection-footer">
            <span>
              Previsão ao fim do mês <b>{brl(f.projected_balance)}</b>
            </span>
            <ArrowUpRight size={25} />
          </div>
        </section>
        <section className="card metric">
          <div className="metric-icon">
            <ArrowDownLeft size={22} />
          </div>
          <span>Receitas a receber</span>
          <strong className="positive">{brl(f.pending_income)}</strong>
          <small>Até o fim do mês</small>
        </section>
        <section className="card metric">
          <div className="metric-icon sand">
            <ArrowUpRight size={22} />
          </div>
          <span>Despesas + faturas</span>
          <strong className="negative">
            {brl(Number(f.pending_expenses) + Number(f.invoices_due))}
          </strong>
          <small>Faturas: {brl(f.invoices_due)}</small>
        </section>
      </div>
      {(f.review_count > 0 || f.missing_balance_count > 0) && (
        <div className="notice">
          Há dados para revisar: {f.review_count} lançamentos e{" "}
          {f.missing_balance_count} saldos sem data. A previsão pode estar
          incompleta.{" "}
          <button onClick={() => navigate("transactions")}>Revisar</button>
        </div>
      )}
      <div className="dashboard-grid">
        <section className="card flow">
          <div className="section-top">
            <h2>O ritmo do seu mês</h2>
            <span className="muted">Receitas e despesas</span>
          </div>
          <div className="flow-body">
            <div
              className="donut"
              style={{
                background: `conic-gradient(#16805d 0 ${percent}%, #d34e59 ${percent}% 100%)`,
              }}
              role="img"
              aria-label={`Receitas ${brl(income)}, despesas ${brl(expense)}`}
            >
              <div>
                <span>Movimentação</span>
                <strong>{brl(income + expense)}</strong>
                <small>no mês</small>
              </div>
            </div>
            <div className="legend">
              <div>
                <i />
                <span>
                  Receitas<strong>{brl(income)}</strong>
                </span>
              </div>
              <div>
                <i className="pale" />
                <span>
                  Despesas<strong>{brl(expense)}</strong>
                </span>
              </div>
              <p>
                Os valores consideram lançamentos confirmados do mês
                selecionado.
              </p>
            </div>
          </div>
        </section>
        <section className="card">
          <div className="section-top">
            <h2>Próximos passos</h2>
            <button
              className="text-button"
              onClick={() => navigate("calendar")}
            >
              Calendário <ArrowRight size={15} />
            </button>
          </div>
          <div className="due-list">
            {upcoming.length ? (
              upcoming.map((t) => (
                <div className="due-row" key={t.id}>
                  <div className="date-tile">
                    <b>{t.date.slice(8, 10)}</b>
                    <small>{shortDate(t.date).split(" ")[2]}</small>
                  </div>
                  <div className="grow">
                    <strong>{t.name}</strong>
                    <small>{t.label}</small>
                  </div>
                  <span className={t.income ? "positive" : "negative"}>
                    {t.income ? "+ " : ""}
                    {brl(t.amount)}
                  </span>
                </div>
              ))
            ) : (
              <p className="empty">Nenhum vencimento programado.</p>
            )}
          </div>
        </section>
      </div>
      <div className="dashboard-grid bottom-grid">
        <section className="card">
          <div className="section-top">
            <h2>Últimos movimentos</h2>
            <button
              className="text-button"
              onClick={() => navigate("transactions")}
            >
              Ver todos <ArrowRight size={15} />
            </button>
          </div>
          {actual
            .filter((t) => t.status === "posted")
            .slice()
            .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
            .slice(0, 4)
            .map((t) => (
              <div className="movement" key={t.id}>
                <span className="avatar-icon">
                  {(t.merchant_name || t.description).slice(0, 1)}
                </span>
                <div className="grow">
                  <strong>{t.merchant_name || t.description}</strong>
                  <small>
                    {data.categories.find((c) => c.id === t.category_id)
                      ?.name || "Sem categoria"}{" "}
                    · {shortDate(t.occurred_at)}
                  </small>
                </div>
                <b
                  className={t.direction === "income" ? "positive" : "negative"}
                >
                  {t.direction === "income" ? "+" : "−"} {brl(t.amount)}
                </b>
              </div>
            ))}
        </section>
        <section className="assistant-teaser">
          <Sparkles size={27} />
          <span className="eyebrow">SEU ASSISTENTE PANCO</span>
          <h2>
            Uma boa pergunta.
            <br />
            Uma visão mais clara.
          </h2>
          <p>“Quanto gastei com alimentação este mês?”</p>
          <button onClick={() => navigate("assistant")}>
            Vamos conversar <ArrowUpRight size={17} />
          </button>
          <div className="teaser-flower">✳</div>
        </section>
      </div>
      <footer className="page-footer">
        <span>
          <span className="status-dot" />{" "}
          {panco.demo
            ? "Dados de exemplo · demonstração"
            : `Saldo atualizado: ${f.as_of ? shortDate(f.as_of) : "ainda não informado"}`}
        </span>
        <a href="https://www.logo.dev" target="_blank" rel="noreferrer">
          Logos por Logo.dev
        </a>
      </footer>
    </>
  );
}
