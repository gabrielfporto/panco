import { AccountLogo, cardBankName } from "../shared/AccountLogo";
import { useState } from "react";
import {
  CreditCard,
  Plus,
  ArrowUpRight,
  Repeat2,
  Pencil,
  Landmark,
} from "lucide-react";
import type { PancoController } from "../../../../packages/react-features/src/use-panco";
import type { Feature } from "../../../../packages/react-features/src/types";
import { categoryEmoji } from "../../../../packages/react-features/src/category-icons";
import { brl, shortDate, today } from "../shared/format";

function hasInvoiceActivity(invoice: {
  remaining_due: string | number;
}) {
  return Number(invoice.remaining_due) > 0.005;
}

function invoiceStatus(invoice: {
  due_date: string;
  status: string;
  remaining_due: string | number;
  reported_total: string | number | null;
  estimated_total: string | number;
  total_paid: string | number;
}) {
  const total = Math.max(
    Number(invoice.reported_total || 0),
    Number(invoice.estimated_total || 0),
  );
  const remaining = Number(invoice.remaining_due || 0);

  if (total > 0 && remaining <= 0.005) return "Paga";
  if (invoice.due_date < today() && remaining > 0.005) return "Vencida";
  if (invoice.due_date > today()) return "Futura";

  return (
    { FUTURE: "Futura", OPEN: "Aberta", CLOSED: "Fechada" }[
      invoice.status
    ] || invoice.status
  );
}
export function Management({
  panco,
  feature,
  open,
}: {
  panco: PancoController;
  feature: Feature;
  open: (type: string, id?: string) => void;
}) {
  const d = panco.data;
  const [showZero, setShowZero] = useState(false);
  const visibleInvestments = d.investments.filter(
    (i) => showZero || i.current_value == null || Number(i.current_value) !== 0,
  );
  const zeroCount =
    d.investments.length -
    d.investments.filter(
      (i) => i.current_value == null || Number(i.current_value) !== 0,
    ).length;
  const visibleInvoices = d.invoices
    .filter(hasInvoiceActivity)
    .slice()
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  if (feature === "cards")
    return (
      <>
        <div className="card-grid">
          {d.cards.map((c) => (
            <section className="card card-detail" key={c.id}>
              <div className="bank-card">
                <div>
                  <span>PANCO / {c.name}</span>
                  <AccountLogo name={cardBankName(c, d.accounts)} />
                </div>
                <span className="chip" />
                <div className="card-number">
                  ••••　••••　••••　{c.last_four || "••••"}
                </div>
                <div>
                  <small>SEU CARTÃO</small>
                  <b>{c.brand || "Crédito"}</b>
                </div>
              </div>
              <div className="section-top">
                <h2>{c.name}</h2>
                <button
                  className="icon-button"
                  aria-label={`Editar ${c.name}`}
                  onClick={() => open("card", c.id)}
                >
                  <Pencil size={17} />
                </button>
              </div>
              <div className="limit-label">
                <span>Limite disponível</span>
                <b>
                  {c.available_limit == null
                    ? "Não informado"
                    : brl(c.available_limit)}
                </b>
              </div>
              <div className="progress-track">
                <div
                  style={{
                    width: `${c.total_limit ? Math.max(0, Math.min(100, (1 - Number(c.available_limit) / Number(c.total_limit)) * 100)) : 0}%`,
                  }}
                />
              </div>
              <div className="muted">
                Limite total{" "}
                {c.total_limit == null ? "não informado" : brl(c.total_limit)}
              </div>
              <div className="card-dates">
                <span>
                  Fechamento<strong>Dia {c.closing_day || "—"}</strong>
                </span>
                <span>
                  Vencimento<strong>Dia {c.due_day || "—"}</strong>
                </span>
              </div>
              {(!c.closing_day || !c.due_day) && (
                <p className="notice">
                  Informe as datas para habilitar as projeções.
                </p>
              )}
            </section>
          ))}
        </div>
        <section className="card section-space">
          <div className="section-top">
            <h2>Suas faturas</h2>
          </div>
          {visibleInvoices.length ? (
            visibleInvoices.map((i) => (
                <div className="movement" key={i.id}>
                  <span className="avatar-icon">
                    <CreditCard size={18} />
                  </span>
                  <div className="grow">
                    <strong>
                      {d.cards.find((c) => c.id === i.card_id)?.name}
                    </strong>
                    <small>
                      Vence em {shortDate(i.due_date)} ·{" "}
                      {i.reported_total == null
                        ? "Estimativa"
                        : "Total informado pelo banco"}
                    </small>
                  </div>
                  <span className="tag">
                    {invoiceStatus(i)}
                  </span>
                  <b>{brl(i.remaining_due)}</b>
                </div>
              ))
          ) : (
            <p className="empty">
              Nenhuma fatura com valor neste período.
            </p>
          )}
        </section>
        <section className="card section-space">
          <div className="section-top">
            <h2>Contas bancárias</h2>
            <button className="text-button" onClick={() => open("account")}>
              Adicionar conta <Plus size={16} />
            </button>
          </div>
          {d.accounts.map((a) => (
            <div className="movement" key={a.id}>
              <Landmark size={22} />
              <div className="grow">
                <strong>{a.name}</strong>
                <small>
                  {a.pluggy_account_id
                    ? "Conectada via Pluggy"
                    : "Conta manual"}{" "}
                  ·{" "}
                  {a.include_in_forecast
                    ? "Incluída na previsão"
                    : "Fora da previsão"}
                </small>
              </div>
              <b>{brl(a.current_balance)}</b>
            </div>
          ))}
        </section>
      </>
    );
  if (feature === "subscriptions") {
    const monthly = d.subscriptions
      .filter((s) => s.status === "active")
      .reduce(
        (sum, s) =>
          sum +
          (Number(s.amount) / s.interval_count) *
            ({ month: 1, year: 1 / 12, week: 52 / 12, day: 365 / 12 }[
              s.interval_unit
            ] || 1),
        0,
      );
    return (
      <>
        <div className="summary-strip">
          <div>
            <span className="eyebrow">
              PEQUENOS COMPROMISSOS, VISÃO COMPLETA
            </span>
            <h2>
              {brl(monthly)} <small>/ mês equivalente</small>
            </h2>
          </div>
          <Repeat2 size={32} />
        </div>
        <div className="subscription-grid">
          {d.subscriptions.map((s) => (
            <section className="card subscription-card" key={s.id}>
              <div className="section-top">
                <span className="subscription-logo">{s.name.slice(0, 1)}</span>
                <span
                  className={"tag " + (s.status === "active" ? "green" : "")}
                >
                  {s.status === "active"
                    ? "Ativa"
                    : s.status === "paused"
                      ? "Pausada"
                      : "Cancelada"}
                </span>
              </div>
              <h2>{s.name}</h2>
              <strong className="subscription-price">
                {brl(s.amount)}{" "}
                <small>
                  / {s.interval_count > 1 ? s.interval_count + " " : ""}
                  {
                    { month: "mês", year: "ano", week: "semana", day: "dia" }[
                      s.interval_unit
                    ]
                  }
                </small>
              </strong>
              <p>Próxima cobrança: {shortDate(s.next_due_date)}</p>
              <div className="subscription-footer">
                <span>
                  {d.cards.find((c) => c.id === s.card_id)?.name ||
                    d.accounts.find((a) => a.id === s.account_id)?.name}
                </span>
                <button
                  className="text-button"
                  onClick={() => open("subscription", s.id)}
                >
                  Gerenciar <ArrowUpRight size={17} />
                </button>
              </div>
            </section>
          ))}
          <button className="add-tile" onClick={() => open("subscription")}>
            <Plus size={25} /> Nova assinatura
          </button>
        </div>
        <button
          className="primary-button section-space"
          onClick={() =>
            panco.schedule().catch((e) => panco.setError(e.message))
          }
        >
          Programar cobranças deste mês
        </button>
        <p className="fine-print">
          O total mensal equivalente serve para comparação. A previsão usa as
          cobranças nas datas em que vencem.
        </p>
      </>
    );
  }
  if (feature === "categories")
    return (
      <>
        <p className="intro-copy">
          Dê a cada movimento o seu lugar. Ao reclassificar uma compra, o Panco
          aprende uma regra para aquele estabelecimento.
        </p>
        {["income", "expense"].map((kind) => (
          <section className="section-space" key={kind}>
            <h2>{kind === "income" ? "Entradas" : "Saídas"}</h2>
            <div className="category-grid">
              {d.categories
                .filter((c) => !c.archived_at && c.kind === kind)
                .slice()
                .sort(
                  (a, b) =>
                    (a.sort_order || 0) - (b.sort_order || 0) ||
                    a.name.localeCompare(b.name),
                )
                .map((c) => (
                  <button
                    className="card category-card"
                    key={c.id}
                    onClick={() => open("category", c.id)}
                  >
                    <span
                      className="category-mark"
                      style={{ background: c.color + "20", color: c.color }}
                    >
                      {categoryEmoji(c.name, c.icon)}
                    </span>
                    <div className="grow">
                      <h3>{c.name}</h3>
                      <span>
                        {
                          {
                            income: "Receitas",
                            expense: "Despesas",
                            both: "Receitas e despesas",
                          }[c.kind]
                        }
                      </span>
                    </div>
                    <Pencil size={16} />
                  </button>
                ))}
            </div>
          </section>
        ))}
        <button
          className="add-tile category-add section-space"
          onClick={() => open("category")}
        >
          <Plus size={22} /> Criar categoria
        </button>
      </>
    );
  if (feature === "investments")
    return (
      <>
        <div className="summary-strip">
          <div>
            <span className="eyebrow">SEU PATRIMÔNIO EM CONSTRUÇÃO</span>
            <h2>
              {brl(
                d.investments.reduce(
                  (s, i) => s + Number(i.current_value || 0),
                  0,
                ),
              )}
            </h2>
          </div>
          <span>Posição atual informada</span>
        </div>
        <div className="dashboard-grid">
          <section className="card">
            <div className="section-top">
              <h2>Seus investimentos</h2>
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={showZero}
                  onChange={(e) => setShowZero(e.target.checked)}
                />{" "}
                Mostrar posições zeradas ({zeroCount})
              </label>
            </div>
            {visibleInvestments.map((i) => (
              <div className="movement" key={i.id}>
                <span className="avatar-icon">
                  <Landmark size={19} />
                </span>
                <div className="grow">
                  <strong>{i.name}</strong>
                  <small>
                    Aplicação{" "}
                    {i.pluggy_investment_id?.slice(-6) || i.id.slice(-6)}
                    {i.valued_at
                      ? " · Atualizada em " + shortDate(i.valued_at)
                      : ""}
                  </small>
                  <small>
                    {
                      {
                        fixed_income: "Renda fixa",
                        equity: "Renda variável",
                        reit: "Fundos imobiliários",
                        fund: "Fundos",
                        other: "Outros",
                      }[i.asset_class]
                    }
                  </small>
                </div>
                <b>
                  {i.current_value == null
                    ? "Não informado"
                    : brl(i.current_value)}
                </b>
              </div>
            ))}
            {!visibleInvestments.length && (
              <p className="empty">
                Nenhuma posição com saldo disponível. Sincronize ou mostre as
                posições zeradas.
              </p>
            )}
          </section>
          <section className="card">
            <div className="section-top">
              <h2>Renda passiva</h2>
              <button className="text-button" onClick={() => open("income")}>
                Registrar <Plus size={16} />
              </button>
            </div>
            {d.investment_income.map((i) => (
              <div className="movement" key={i.id}>
                <div className="grow">
                  <strong>
                    {d.investments.find((x) => x.id === i.investment_id)?.name}
                  </strong>
                  <small>
                    {shortDate(i.payment_date)} ·{" "}
                    {i.status === "paid" ? "Recebido" : "Previsto"}
                    {i.amount_basis === "gross"
                      ? " · Valor bruto informado"
                      : ""}
                  </small>
                </div>
                <b className="positive">+ {brl(i.net_amount)}</b>
              </div>
            ))}
            {!d.investment_income.length && (
              <p className="empty">Seus proventos aparecerão aqui.</p>
            )}
            <p className="fine-print">
              Proventos e valorização são separados. O saldo previsto considera
              apenas o lançamento bancário, evitando somar o mesmo crédito duas
              vezes.
            </p>
          </section>
        </div>
      </>
    );
  return null;
}
