import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { PancoController } from "../../../../packages/react-features/src/use-panco";

export function Auth({
  panco,
  enterDemo,
}: {
  panco: PancoController;
  enterDemo: () => void;
}) {
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  return (
    <main className="login-page">
      <div className="login-art">
        <span className="logo">
          panco<span>✳</span>
        </span>
        <h1>
          Seu dinheiro.
          <br />
          Seu ritmo.
          <br />
          Seu espaço.
        </h1>
        <p>Mais clareza para cuidar do que vem a seguir.</p>
        <span className="login-flower">✳</span>
      </div>
      <section className="login-form">
        <span className="eyebrow">BEM-VINDO AO PANCO</span>
        <h2>{signup ? "Vamos começar?" : "Seu espaço te espera."}</h2>
        <p>
          {signup
            ? "Crie sua conta para organizar suas finanças."
            : "Entre para acompanhar suas contas de qualquer lugar."}
        </p>
        <div className="auth-tabs" aria-label="Acesso à conta">
          <button
            type="button"
            aria-pressed={!signup}
            onClick={() => {
              setSignup(false);
              setError("");
              setMessage("");
            }}
          >
            Entrar
          </button>
          <button
            type="button"
            aria-pressed={signup}
            onClick={() => {
              setSignup(true);
              setError("");
              setMessage("");
            }}
          >
            Criar cadastro
          </button>
        </div>
        <form
          key={String(signup)}
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setMessage("");
            if (panco.demo) {
              setError(
                "O cadastro real estará disponível após configurar o Supabase. Você pode explorar a demonstração abaixo.",
              );
              return;
            }
            const f = new FormData(e.currentTarget);
            setBusy(true);
            try {
              if (signup) {
                const signedIn = await panco.signup(
                  String(f.get("email")),
                  String(f.get("password")),
                  String(f.get("name")),
                  String(f.get("phone")),
                  window.location.origin + window.location.pathname,
                );
                if (!signedIn)
                  setMessage(
                    "Confira seu e-mail para confirmar o cadastro. Depois, volte e entre com sua senha. Se já tem uma conta, use a opção Entrar.",
                  );
              } else
                await panco.login(
                  String(f.get("email")),
                  String(f.get("password")),
                );
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Não foi possível concluir.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {signup && (
            <label>
              Como quer ser chamado?
              <input
                name="name"
                autoComplete="nickname"
                maxLength={80}
                required
              />
            </label>
          )}
          <label>
            E-mail
            <input name="email" type="email" autoComplete="email" required />
          </label>
          {signup && (
            <label>
              Telefone com DDD
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                maxLength={25}
                placeholder="(71) 99999-9999"
                required
              />
              <small>
                Usado no seu perfil. O login será por e-mail e senha.
              </small>
            </label>
          )}
          <label>
            Senha
            <input
              name="password"
              type="password"
              minLength={signup ? 8 : undefined}
              autoComplete={signup ? "new-password" : "current-password"}
              required
            />
            {signup && <small>Pelo menos 8 caracteres.</small>}
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="notice" role="status">
              {message}
            </p>
          )}
          <button className="primary-button" disabled={busy || panco.loading}>
            {busy
              ? "Aguarde…"
              : signup
                ? "Criar minha conta"
                : "Entrar no Panco"}
            <ArrowUpRight size={18} />
          </button>
        </form>
        {panco.demo && (
          <div className="demo-entry">
            <p>Prévia sem conexão com seus dados bancários.</p>
            <button className="text-button" onClick={enterDemo}>
              Explorar demonstração <ArrowUpRight size={17} />
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
