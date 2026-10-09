import { useEffect, useRef, useState } from "react";
import { X, Trash2 } from "lucide-react";
import type { PancoController } from "../../../../packages/react-features/src/use-panco";
import { categoryEmoji } from "../../../../packages/react-features/src/category-icons";
import { today } from "./format";
export function Editor({
  type,
  id,
  panco,
  close,
}: {
  type: string;
  id?: string;
  panco: PancoController;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false),
    [replacement, setReplacement] = useState("");
  const d = panco.data;
  const existing = (
    type === "category"
      ? d.categories
      : type === "subscription"
        ? d.subscriptions
        : type === "card"
          ? d.cards
          : []
  ).find((x) => x.id === id) as Record<string, unknown> | undefined;
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const field = (key: string, fallback: unknown = "") =>
    String(existing?.[key] ?? fallback);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      s = (key: string) => String(f.get(key) || "");
    setBusy(true);
    setError("");
    const linked = s("linked").split(":");
    try {
      if (type === "transaction")
        await panco.createTransaction({
          description: s("name"),
          amount: s("amount"),
          date: s("date"),
          account_id: linked[0] === "account" ? linked[1] : null,
          card_id: linked[0] === "card" ? linked[1] : null,
          category_id: s("category") || null,
          direction: s("direction"),
          status: s("status"),
          installment_number: 1,
          total_installments: Number(s("installments") || 1),
          defer_to_next_month: f.has("defer"),
        });
      if (type === "category")
        await panco.save("categories", {
          ...(id ? { id } : {}),
          name: s("name"),
          kind: s("kind"),
          color: s("color"),
          icon: s("icon"),
          expense_group: null,
          sort_order: Number(s("sort_order") || 0),
        });
      if (type === "subscription")
        await panco.save("subscriptions", {
          ...(id ? { id } : {}),
          name: s("name"),
          merchant_key: s("name").toLowerCase().trim(),
          amount: s("amount"),
          currency: "BRL",
          interval_unit: s("interval"),
          interval_count: 1,
          next_due_date: s("date"),
          status: s("status"),
          account_id: linked[0] === "account" ? linked[1] : null,
          card_id: linked[0] === "card" ? linked[1] : null,
        });
      if (type === "card")
        await panco.save("cards", {
          ...(id ? { id } : {}),
          name: s("name"),
          closing_day: Number(s("closing")),
          due_day: Number(s("due")),
          payment_account_id: s("payment") || null,
          currency: "BRL",
        });
      if (type === "account") await panco.createAccount(s("name"), s("amount"));
      if (type === "income")
        await panco.save("investment_income", {
          investment_id: s("investment"),
          net_amount: s("amount"),
          payment_date: s("date"),
          kind: "distribution",
          status: "paid",
          currency: "BRL",
        });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  const titles: Record<string, string> = {
    transaction: "Novo movimento",
    category: id ? "Editar categoria" : "Nova categoria",
    subscription: id ? "Gerenciar assinatura" : "Nova assinatura",
    card: "Configurar cartão",
    account: "Nova conta",
    income: "Registrar provento",
  };
  return (
    <dialog ref={ref} className="editor" onCancel={close} onClose={close}>
      <div className="section-top">
        <h2>{titles[type]}</h2>
        <button className="icon-button" aria-label="Fechar" onClick={close}>
          <X size={20} />
        </button>
      </div>
      <form onSubmit={submit}>
        {type !== "income" && (
          <label>
            Nome / descrição
            <input
              name="name"
              required
              maxLength={120}
              defaultValue={field("name")}
            />
          </label>
        )}
        {["transaction", "subscription", "account", "income"].includes(
          type,
        ) && (
          <label>
            {type === "transaction"
              ? "Valor da parcela ou compra"
              : "Valor (R$)"}
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              defaultValue={field("amount")}
            />
          </label>
        )}
        {["transaction", "subscription", "income"].includes(type) && (
          <label>
            Data
            <input
              name="date"
              type="date"
              required
              defaultValue={field("next_due_date", today())}
            />
          </label>
        )}
        {type === "category" && (
          <>
            <label>
              Emoji
              <select
                name="icon"
                defaultValue={categoryEmoji(field("name"), field("icon"))}
              >
                {Array.from(
                  new Set([
                    categoryEmoji(field("name"), field("icon")),
                    "💼",
                    "✨",
                    "↩️",
                    "🏠",
                    "🩺",
                    "🍽️",
                    "🚌",
                    "💊",
                    "💈",
                    "🎮",
                    "🛍️",
                    "🔁",
                    "🔧",
                    "🏷️",
                    "🐾",
                    "🎓",
                    "✈️",
                  ]),
                ).map((emoji) => (
                  <option key={emoji}>{emoji}</option>
                ))}
              </select>
            </label>
            <label>
              Ordem de exibição
              <input
                name="sort_order"
                type="number"
                step="1"
                min="0"
                defaultValue={field("sort_order", 0)}
              />
            </label>
          </>
        )}
        {["transaction", "subscription"].includes(type) && (
          <label>
            Conta ou cartão
            <select
              name="linked"
              required
              defaultValue={
                existing?.card_id
                  ? "card:" + existing.card_id
                  : existing?.account_id
                    ? "account:" + existing.account_id
                    : ""
              }
            >
              <option value="">Selecione</option>
              {d.accounts.map((a) => (
                <option key={a.id} value={"account:" + a.id}>
                  {a.name}
                </option>
              ))}
              {d.cards.map((c) => (
                <option key={c.id} value={"card:" + c.id}>
                  {c.name} · cartão
                </option>
              ))}
            </select>
          </label>
        )}
        {type === "transaction" && (
          <>
            <div className="form-columns">
              <label>
                Tipo
                <select name="direction">
                  <option value="expense">Despesa</option>
                  <option value="income">Receita</option>
                </select>
              </label>
              <label>
                Status
                <select name="status">
                  <option value="pending">Pendente</option>
                  <option value="posted">Confirmada</option>
                </select>
              </label>
            </div>
            <label>
              Categoria
              <select name="category">
                <option value="">Sem categoria</option>
                {d.categories
                  .filter((c) => !c.archived_at)
                  .map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Quantidade de parcelas (cartão)
              <input
                type="number"
                min="1"
                max="120"
                defaultValue="1"
                name="installments"
              />
            </label>
            <label className="checkbox">
              <input type="checkbox" name="defer" /> Adiar para o próximo ciclo
              do cartão
            </label>
          </>
        )}
        {type === "category" && (
          <>
            <label>
              Usar para
              <select name="kind" defaultValue={field("kind", "expense")}>
                <option value="expense">Despesas</option>
                <option value="income">Receitas</option>
              </select>
            </label>
            <label>
              Cor
              <input
                name="color"
                type="color"
                defaultValue={field("color", "#0F3B2E")}
              />
            </label>
          </>
        )}
        {type === "subscription" && (
          <>
            <label>
              Frequência
              <select
                name="interval"
                defaultValue={field("interval_unit", "month")}
              >
                <option value="month">Mensal</option>
                <option value="year">Anual</option>
                <option value="week">Semanal</option>
              </select>
            </label>
            <label>
              Status
              <select name="status" defaultValue={field("status", "active")}>
                <option value="active">Ativa</option>
                <option value="paused">Pausada</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </label>
          </>
        )}
        {type === "card" && (
          <>
            <div className="form-columns">
              <label>
                Dia do fechamento
                <input
                  name="closing"
                  type="number"
                  min="1"
                  max="31"
                  required
                  defaultValue={field("closing_day")}
                />
              </label>
              <label>
                Dia do vencimento
                <input
                  name="due"
                  type="number"
                  min="1"
                  max="31"
                  required
                  defaultValue={field("due_day")}
                />
              </label>
            </div>
            <label>
              Conta de pagamento
              <select name="payment" defaultValue={field("payment_account_id")}>
                <option value="">Ainda não definida</option>
                {d.accounts.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {type === "income" && (
          <label>
            Investimento
            <select name="investment" required>
              <option value="">Selecione</option>
              {d.investments.map((i) => (
                <option value={i.id} key={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="primary-button" disabled={busy}>
          {busy ? "Salvando…" : "Salvar"}
        </button>
      </form>
      {type === "category" && id && (
        <div className="category-delete">
          {!deleting ? (
            <button
              type="button"
              className="text-button negative"
              disabled={busy}
              onClick={() => setDeleting(true)}
            >
              <Trash2 size={17} /> Excluir categoria
            </button>
          ) : (
            <>
              <h3>Excluir {field("name")}?</h3>
              <p>
                Os movimentos serão mantidos. Se houver registros vinculados,
                escolha a categoria que receberá seus lançamentos e valores
                planejados.
              </p>
              <label>
                Transferir para
                <select
                  value={replacement}
                  onChange={(e) => setReplacement(e.target.value)}
                  disabled={busy}
                >
                  <option value="">
                    Sem substituição (categoria sem vínculos)
                  </option>
                  {d.categories
                    .filter(
                      (c) =>
                        c.id !== id &&
                        !c.archived_at &&
                        c.kind === field("kind"),
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {categoryEmoji(c.name, c.icon)} {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <div className="delete-actions">
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => setDeleting(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="primary-button danger-button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await panco.deleteCategory(id, replacement || null);
                      close();
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Não foi possível excluir a categoria.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Excluindo…" : "Confirmar exclusão"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
