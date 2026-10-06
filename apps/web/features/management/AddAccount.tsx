import { useEffect, useRef, useState } from "react";
import { Landmark, Wallet, X } from "lucide-react";
import type { PancoController } from "../../../../packages/react-features/src/use-panco";

export function AddAccount({
  panco,
  close,
}: {
  panco: PancoController;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"manual" | "pluggy">("manual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="editor"
      aria-labelledby="add-account-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
      onClose={close}
    >
      <div className="section-top">
        <h2 id="add-account-title">Adicionar conta</h2>
        <button
          className="icon-button"
          aria-label="Fechar"
          disabled={busy}
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      <p>Escolha como quer acompanhar seu dinheiro.</p>
      <div className="account-options">
        <button
          type="button"
          aria-pressed={mode === "manual"}
          disabled={busy}
          onClick={() => {
            setMode("manual");
            setError("");
          }}
        >
          <Wallet size={22} />
          <strong>Conta manual</strong>
          <small>Você registra os movimentos.</small>
        </button>
        <button
          type="button"
          aria-pressed={mode === "pluggy"}
          disabled={busy}
          onClick={() => {
            setMode("pluggy");
            setError("");
          }}
        >
          <Landmark size={22} />
          <strong>Conectar com Pluggy</strong>
          <small>Importe pelo Item ID do banco.</small>
        </button>
      </div>
      <form
        key={mode}
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            if (mode === "manual")
              await panco.createAccount(
                String(f.get("name")),
                String(f.get("balance")),
                String(f.get("kind")),
              );
            else await panco.sync(String(f.get("itemId")).trim(), true);
            close();
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Não foi possível adicionar a conta.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {mode === "manual" ? (
          <>
            <label>
              Nome da conta
              <input
                name="name"
                placeholder="Ex.: Minha carteira"
                maxLength={120}
                required
              />
            </label>
            <label>
              Tipo de conta
              <select name="kind">
                <option value="checking">Conta corrente</option>
                <option value="savings">Poupança</option>
                <option value="cash">Carteira / dinheiro</option>
                <option value="investment">Investimentos</option>
                <option value="other">Outra</option>
              </select>
            </label>
            <label>
              Saldo atual (R$)
              <input
                name="balance"
                type="number"
                step="0.01"
                defaultValue="0"
                required
              />
              <small>
                Pode ser zero ou negativo. Incluído na previsão de saldo.
              </small>
            </label>
          </>
        ) : (
          <>
            <label>
              Item ID da Pluggy
              <input
                name="itemId"
                autoComplete="off"
                spellCheck={false}
                maxLength={128}
                pattern="[a-zA-Z0-9\-]+"
                placeholder="Cole o Item ID do seu banco"
                required
              />
            </label>
            <p className="muted">
              Use o Item ID disponível na aplicação Pluggy ligada ao Meu Pluggy.
              Um Item pode conter várias contas e cartões. Não use o ID de uma
              conta individual.
            </p>
            <p className="muted">
              Client ID e secret ficam configurados apenas no servidor.
            </p>
            {panco.demo && (
              <p className="notice">
                Conexão bancária disponível após configurar o Supabase e a
                Pluggy. Contas manuais podem ser testadas nesta demonstração.
              </p>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button
          className="primary-button"
          disabled={busy || (mode === "pluggy" && panco.demo)}
        >
          {busy
            ? "Importando e salvando…"
            : mode === "manual"
              ? "Criar conta manual"
              : "Conectar e importar"}
        </button>
        {busy && (
          <small role="status">
            Aguarde. A importação pode levar alguns instantes; páginas
            concluídas ficam salvas.
          </small>
        )}
      </form>
    </dialog>
  );
}
