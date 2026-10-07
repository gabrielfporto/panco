import { useState } from "react";
import { Search, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { PancoController } from "../../../../packages/react-features/src/use-panco";
import { brl, shortDate } from "../shared/format";
export function Transactions({ panco }: { panco: PancoController }) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [account, setAccount] = useState("all");
  const { data } = panco;
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
          t.card_id === account),
    )
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return (
    <section className="card">
      <p className="transaction-filter-note">
        Filtro ativo: RES APLIC AUT MAIS não aparece nas transações nem nos
        totais e na previsão. O saldo informado pelo banco é mantido.
      </p>
      <div className="filters">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Buscar transações"
            placeholder="Buscar um movimento..."
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
            <option value={a.id} key={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Movimento</th>
              <th>Categoria</th>
              <th>Conta / cartão</th>
              <th>Data</th>
              <th>Status</th>
              <th className="align-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>
                  <div className="table-name">
                    <span className="avatar-icon">
                      {t.direction === "income" ? (
                        <ArrowDownLeft size={18} />
                      ) : (
                        <ArrowUpRight size={18} />
                      )}
                    </span>
                    <div>
                      <strong>{t.merchant_name || t.description}</strong>
                      <small>
                        {t.total_installments
                          ? `Parcela ${t.installment_number}/${t.total_installments}`
                          : t.description !== t.merchant_name
                            ? t.description
                            : "Pagamento único"}
                        {t.defer_to_next_month ? " · Próximo ciclo" : ""}
                        {t.source === "projection" ? " · Projeção" : ""}
                      </small>
                    </div>
                  </div>
                </td>
                <td>
                  <select
                    className="category-select"
                    aria-label={`Categoria de ${t.description}`}
                    value={t.category_id || ""}
                    onChange={(e) =>
                      panco
                        .categorize(t.id, e.target.value)
                        .catch((e) => panco.setError(e.message))
                    }
                  >
                    <option value="" disabled>
                      Sem categoria
                    </option>
                    {data.categories.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {data.accounts.find((a) => a.id === t.account_id)?.name ||
                    data.cards.find((c) => c.id === t.card_id)?.name}
                </td>
                <td>{shortDate(t.occurred_at)}</td>
                <td>
                  <span
                    className={"tag " + (t.status === "posted" ? "green" : "")}
                  >
                    {t.needs_review
                      ? "Revisar"
                      : {
                          posted: "Confirmada",
                          pending: "Pendente",
                          cancelled: "Cancelada",
                        }[t.status]}
                  </span>
                </td>
                <td
                  className={
                    "align-right amount " +
                    (t.direction === "income" ? "positive" : "")
                  }
                >
                  {t.direction === "income" ? "+" : "−"} {brl(t.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <p className="empty">Nenhum movimento encontrado com esses filtros.</p>
      )}
      <div className="table-footer">
        {rows.length} movimentos{" "}
        <span>Alterar a categoria cria uma regra para o estabelecimento.</span>
      </div>
    </section>
  );
}
