import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Sparkles } from 'lucide-react';
import type { PancoController } from '../../../../packages/react-features/src/use-panco';
import type { ChatMessage } from '../../../../packages/react-features/src/types';
import { brl } from '../shared/format';
export function Assistant({ panco }: { panco: PancoController }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [question, setQuestion] = useState(''),
    [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, busy]);
  async function send(q = question) {
    if (!q.trim() || busy) return;
    setQuestion('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setBusy(true);
    try {
      const r = await panco.ask(q, messages);
      setMessages((m) => [...m, { role: 'assistant', ...r }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: e instanceof Error ? e.message : 'Não foi possível consultar.' },
      ]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card chat">
      <div className="chat-content">
        {!messages.length && (
          <div className="chat-welcome">
            <span className="chat-symbol">
              <Sparkles size={30} />
            </span>
            <span className="eyebrow">CONVERSAS QUE TRAZEM CLAREZA</span>
            <h2>O que vamos descobrir hoje?</h2>
            <p>Pergunte sobre os seus gastos ou sobre o saldo que está por vir.</p>
            <div className="suggestions">
              {[
                'Quanto gastei com iFood este mês?',
                'Qual é meu saldo projetado?',
                'Quanto gastei neste mês?',
              ].map((q) => (
                <button key={q} onClick={() => void send(q)}>
                  {q}
                  <ArrowUp size={15} />
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div className={'message ' + m.role} key={i}>
            {m.role === 'assistant' && <Sparkles size={18} />}
            <div>
              <p>{m.text}</p>
              {m.cards?.map((c, j) => (
                <div className="answer-card" key={j}>
                  <span>{c.type === 'forecast' ? 'Saldo projetado' : c.title || 'Despesas'}</span>
                  <strong>
                    {brl(c.type === 'forecast' ? c.projected_balance || 0 : c.amount || 0)}
                  </strong>
                  <small>
                    {c.type === 'forecast'
                      ? `Até ${c.through || 'o fim do mês'}`
                      : `${c.count || 0} movimentos encontrados`}
                  </small>
                </div>
              ))}
            </div>
          </div>
        ))}
        {busy && (
          <p className="chat-thinking" role="status">
            Consultando seus dados…
          </p>
        )}
        <div ref={end} />
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          aria-label="Sua pergunta"
          maxLength={2000}
          placeholder="Pergunte ao Panco…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button disabled={busy || !question.trim()} aria-label="Enviar pergunta">
          <ArrowUp size={22} />
        </button>
      </form>
      <p className="chat-footnote">
        {panco.demo
          ? 'Modo demonstração · respostas locais com dados de exemplo'
          : 'As respostas usam consultas aos seus dados. Confira os valores antes de decidir.'}
      </p>
    </section>
  );
}
