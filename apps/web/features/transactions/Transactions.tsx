import { transactionMonth } from "../../../../packages/core/src/features/transactions/period";
import { useState } from "react";
import { Search } from "lucide-react";
import type { PancoController } from "../../../../packages/react-features/src/use-panco";
import type { Transaction } from "../../../../packages/react-features/src/types";
import { groupSimilar } from "../../../../packages/core/src/features/transactions/grouping";
import { brl, today } from "../shared/format";

export function Transactions({ panco }: { panco: PancoController }) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [account, setAccount] = useState("all"),
    [allMonths, setAllMonths] = useState(false),
    [similarOnly, setSimilarOnly] = useState(false);
  const { data } = panco;
  const month = allMonths ? "" : panco.month;
  const setMonth = (value: string) => {
    setAllMonths(!value);
    if (value) panco.setMonth(value);
  };
  const rows = data.transactions
    .filter(
      (t) =>
        `${t.description} ${t.merchant_name || ""}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (status === "all" ||
          t.status === status ||
          (status === "review" && t.needs_review)) &&
        (account === "all" ||
          t.account_id === account ||
          t.card_id === account) &&
        (!month || transactionMonth(t) === month),
    )
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const groups = groupSimilar(rows).filter(
    (group) => !similarOnly || group.length > 1,
  );
  const count = groups.reduce((sum, group) => sum + group.length, 0);
  function details(t: Transaction) {
    const accountName =
      data.accounts.find((a) => a.id === t.account_id)?.name ||
      data.cards.find((c) => c.id === t.card_id)?.name ||
      "Conta não informada";
    return (
      <article className="transaction-card" key={t.id}>
        <div className="transaction-heading">
          <div>
            <strong>{t.merchant_name || t.description}</strong>
            {t.merchant_name && t.merchant_name !== t.description && (
              <p>{t.description}</p>
            )}
          </div>
          <b className={t.direction === "income" ? "positive" : "negative"}>
            {t.direction === "income" ? "+" : "−"}{" "}
            {t.currency === "BRL"
              ? brl(t.amount)
              : new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: t.currency,
                }).format(Number(t.amount))}
          </b>
        </div>
        <dl className="transaction-details">
          <div>
            <dt>Conta / cartão</dt>
            <dd>{accountName}</dd>
          </div>
          <div>
            <dt>Data</dt>
            <dd>
              {new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
                new Date(t.occurred_at),
              )}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              {t.needs_review
                ? "Para revisar"
                : {
                    posted: "Confirmada",
                    pending: "Pendente",
                    cancelled: "Cancelada",
                  }[t.status]}
              {t.source === "projection" ? " · Projeção" : ""}
            </dd>
          </div>
          {t.total_installments && (
            <div>
              <dt>Parcela</dt>
              <dd>
                {t.installment_number}/{t.total_installments}
                {t.defer_to_next_month ? " · Próximo ciclo" : ""}
              </dd>
            </div>
          )}
        </dl>
        <label className="transaction-category">
          Categoria
          <select
            aria-label={`Categoria de ${t.description}`}
            value={t.category_id || ""}
            disabled={panco.savingCategories.includes(t.id)}
            onChange={(e) =>
              panco
                .categorize(t.id, e.target.value)
                .catch((e) => panco.setError(e.message))
            }
          >
            <option value="" disabled>
              Sem categoria
            </option>
            {data.categories
              .filter(
                (c) =>
                  !c.archived_at &&
                  (c.kind === t.direction || c.kind === "both"),
              )
              .map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
      </article>
    );
  }
  return (
    <section className="transactions-page">
      <div className="card transaction-controls">
        <div className="filters">
          <label className="search">
            <Search size={18} />
            <input
              aria-label="Buscar transações"
              placeholder="Buscar movimento…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">Todos os status</option>
            <option value="pending">Pendentes</option>
            <option value="posted">Confirmadas</option>
            <option value="review">Para revisar</option>
            <option value="cancelled">Canceladas</option>
          </select>
          <select
            aria-label="Conta ou cartão"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          >
            <option value="all">Todas as contas</option>
            {[...data.accounts, ...data.cards].map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="transaction-period">
          <label>
            Mês{" "}
            <input
              type="month"
              aria-label="Mês das transações"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
          <button className="text-button" onClick={() => setMonth("")}>
            Todo o histórico
          </button>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={similarOnly}
              onChange={(e) => {
                setSimilarOnly(e.target.checked);
                if (e.target.checked) setMonth("");
              }}
            />{" "}
            Somente semelhantes
          </label>
        </div>
        <p className="fine-print">
          RES APLIC AUT MAIS e APL APLIC AUT MAIS estão fora da lista e dos
          totais. Lançamentos semelhantes ficam agrupados para revisão, com os
          valores preservados.
        </p>
      </div>
      <div className="transaction-list">
        {groups.map((group) => (
          <div className="transaction-group" key={group[0].id}>
            {group.length > 1 && (
              <div className="similar-notice">
                {group.length} lançamentos semelhantes · todos contam nos totais
              </div>
            )}
            {details(group[0])}
            {group.length > 1 && (
              <details className="similar-details">
                <summary>
                  Revisar os outros {group.length - 1} lançamentos
                </summary>
                <p className="fine-print">
                  O banco enviou referências diferentes. Confira o extrato antes
                  de considerar uma duplicidade.
                </p>
                {group.slice(1).map(details)}
              </details>
            )}
          </div>
        ))}
      </div>
      {!groups.length && (
        <p className="empty">Nenhum movimento encontrado com esses filtros.</p>
      )}
      <div className="table-footer">
        {count} movimentos em {groups.length} grupos
        <span>Alterar a categoria cria uma regra para o estabelecimento.</span>
      </div>
    </section>
  );
}
