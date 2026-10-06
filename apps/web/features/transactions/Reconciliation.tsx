import { useState } from 'react';
import type { PancoController } from '../../../../packages/react-features/src/use-panco';
import { brl, shortDate } from '../shared/format';
export function Reconciliation({ panco }: { panco: PancoController }) {
  const [selected, setSelected] = useState<Record<string, string>>({}),
    [invoice, setInvoice] = useState(''),
    [payment, setPayment] = useState(''),
    [amount, setAmount] = useState(''),
    [busy, setBusy] = useState(false);
  const projections = panco.data.transactions.filter(
    (t) => t.source === 'projection' && t.needs_review && t.status !== 'cancelled',
  );
  const payments = panco.data.transactions.filter(
    (t) => t.account_id && t.direction === 'expense' && t.status !== 'cancelled',
  );
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      panco.setError(e instanceof Error ? e.message : 'Não foi possível conciliar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card section-space">
      <div className="section-top">
        <h2>Conciliação</h2>
        <span className="muted">Uma despesa, uma vez</span>
      </div>
      {projections.map((p) => (
        <div className="reconcile-row" key={p.id}>
          <div>
            <strong>
              {p.description} · {brl(p.amount)}
            </strong>
            <small>Projeção de {shortDate(p.occurred_at)}</small>
          </div>
          <select
            aria-label={`Lançamento real de ${p.description}`}
            value={selected[p.id] || ''}
            onChange={(e) => setSelected((s) => ({ ...s, [p.id]: e.target.value }))}
          >
            <option value="">Escolher lançamento real</option>
            {panco.data.transactions
              .filter(
                (a) =>
                  a.source !== 'projection' &&
                  a.status !== 'cancelled' &&
                  a.account_id === p.account_id &&
                  a.card_id === p.card_id,
              )
              .map((a) => (
                <option value={a.id} key={a.id}>
                  {a.description} · {shortDate(a.occurred_at)} · {brl(a.amount)}
                </option>
              ))}
          </select>
          <button
            className="primary-button"
            disabled={busy || !selected[p.id]}
            onClick={() => void run(() => panco.reconcile(p.id, selected[p.id]))}
          >
            Conciliar
          </button>
        </div>
      ))}
      {!projections.length && (
        <p className="fine-print">Nenhuma projeção ambígua aguardando conciliação.</p>
      )}
      <details className="payment-details">
        <summary>Vincular pagamento bancário a uma fatura</summary>
        <p className="fine-print">
          Escolha o débito real da sua conta. Um pagamento pendente vinculado não será subtraído
          novamente além da fatura.
        </p>
        <form
          className="payment-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => panco.allocate(invoice, payment, amount));
          }}
        >
          <label>
            Fatura
            <select required value={invoice} onChange={(e) => setInvoice(e.target.value)}>
              <option value="">Selecione</option>
              {panco.data.invoices.map((i) => (
                <option value={i.id} key={i.id}>
                  {panco.data.cards.find((c) => c.id === i.card_id)?.name} · {i.due_date}
                </option>
              ))}
            </select>
          </label>
          <label>
            Pagamento
            <select required value={payment} onChange={(e) => setPayment(e.target.value)}>
              <option value="">Selecione</option>
              {payments.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.description} · {brl(t.amount)} · {shortDate(t.occurred_at)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Valor alocado
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <button className="primary-button" disabled={busy}>
            Vincular pagamento
          </button>
        </form>
      </details>
    </section>
  );
}
