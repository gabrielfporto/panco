"use client";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  LayoutDashboard,
  Target,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ArrowLeftRight,
  CreditCard,
  Repeat2,
  Tags,
  ChartNoAxesCombined,
  Sparkles,
  Plus,
  RefreshCw,
  LogOut,
  X,
  ArrowUpRight,
} from "lucide-react";
import { usePanco } from "../../../../packages/react-features/src/use-panco";
import type { Feature } from "../../../../packages/react-features/src/types";
import { Reconciliation } from "../transactions/Reconciliation";
import { Planning } from "../planning/Planning";
import { Dashboard } from "../dashboard/Dashboard";
import { Transactions } from "../transactions/Transactions";
import { Calendar } from "../calendar/Calendar";
import { Management } from "../management/Management";
import { Assistant } from "../assistant/Assistant";
import { Auth } from "./Auth";
import { AddAccount } from "../management/AddAccount";
import { Editor } from "../shared/Editor";
import { addMonths } from "../../../../packages/core/src/features/transactions/billing";
import { monthLabel, today } from "../shared/format";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const client = url && key ? createClient(url, key) : null;
const nav = [
  { id: "dashboard", label: "Visão geral", icon: LayoutDashboard },
  { id: "planning", label: "Planejamento", icon: Target },
  { id: "calendar", label: "Calendário", icon: CalendarDays },
  { id: "transactions", label: "Transações", icon: ArrowLeftRight },
  { id: "cards", label: "Contas e cartões", icon: CreditCard },
  { id: "subscriptions", label: "Assinaturas", icon: Repeat2 },
  { id: "categories", label: "Categorias", icon: Tags },
  { id: "investments", label: "Investimentos", icon: ChartNoAxesCombined },
  { id: "assistant", label: "Assistente Panco", icon: Sparkles },
] as const;
const subtitles: Record<Feature, string> = {
  dashboard: "",
  planning: "Estime suas receitas e despesas, categoria por categoria.",
  calendar: "O que aconteceu. O que está por vir.",
  transactions: "Cada movimento, no seu lugar.",
  cards: "Suas contas e seus próximos ciclos.",
  subscriptions: "Tudo o que se repete, em um só lugar.",
  categories: "Uma organização com a sua cara.",
  investments: "Cuide hoje das suas possibilidades de amanhã.",
  assistant: "Seu dinheiro também pode ser uma boa conversa.",
};
export function PancoApp() {
  const panco = usePanco(client),
    [feature, setFeature] = useState<Feature>("dashboard"),
    [editor, setEditor] = useState<{ type: string; id?: string } | null>(null),
    [demoEntered, setDemoEntered] = useState(false);
  const open = (type: string, id?: string) => setEditor({ type, id });
  const navigate = (f: Feature) => {
    setFeature(f);
  };
  if (!panco.session && !(panco.demo && demoEntered))
    return <Auth panco={panco} enterDemo={() => setDemoEntered(true)} />;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="logo"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("dashboard");
          }}
        >
          panco<span>✳</span>
        </a>
        <span className="sidebar-caption">SEU ESPAÇO FINANCEIRO</span>
        <nav aria-label="Navegação principal">
          {nav.map((n) => (
            <button
              key={n.id}
              aria-current={feature === n.id ? "page" : undefined}
              className={feature === n.id ? "active" : ""}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} />
              {n.label}
              {n.id === "assistant" && <span className="new-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="personal-note">
            <span>FEITO PARA VOCÊ</span>
            <p>
              Mais presença.
              <br />
              Menos preocupação.
            </p>
            <span className="small-flower">✳</span>
          </div>
          <div className="profile">
            <span className="profile-avatar">
              {panco.demo
                ? "P"
                : (
                    panco.session?.user.user_metadata.name ||
                    panco.session?.user.email ||
                    "P"
                  )
                    .slice(0, 1)
                    .toUpperCase()}
            </span>
            <div>
              <strong>
                {panco.session?.user.user_metadata.name || "Meu espaço"}
              </strong>
              <small>{panco.demo ? "Demonstração" : "Conta pessoal"}</small>
            </div>
            {panco.demo && (
              <button
                className="icon-button"
                aria-label="Voltar ao login"
                onClick={() => setDemoEntered(false)}
              >
                <LogOut size={17} />
              </button>
            )}
            {!panco.demo && (
              <button
                className="icon-button"
                onClick={() => void panco.logout()}
                aria-label="Sair"
              >
                <LogOut size={17} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-start">
            <span>{nav.find((n) => n.id === feature)?.label}</span>
            {panco.demo && <span className="demo-badge">DEMO</span>}
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button mobile-only"
              aria-label={panco.demo ? "Voltar ao login" : "Sair"}
              onClick={() =>
                panco.demo ? setDemoEntered(false) : void panco.logout()
              }
            >
              <LogOut size={18} />
            </button>
            <div className="month-picker">
              <button
                className="icon-button"
                aria-label="Mês anterior"
                onClick={() =>
                  panco.setMonth(addMonths(panco.month + "-01", -1).slice(0, 7))
                }
              >
                <ChevronLeft size={17} />
              </button>
              <input
                aria-label="Mês e ano"
                type="month"
                value={panco.month}
                onChange={(e) => {
                  if (e.target.value) panco.setMonth(e.target.value);
                }}
              />
              <button
                className="icon-button"
                aria-label="Próximo mês"
                onClick={() =>
                  panco.setMonth(addMonths(panco.month + "-01", 1).slice(0, 7))
                }
              >
                <ChevronRight size={17} />
              </button>
            </div>
            <button
              className="icon-button"
              title="Sincronizar contas"
              aria-label="Sincronizar contas"
              disabled={panco.syncing}
              onClick={() => void panco.sync()}
            >
              <RefreshCw size={18} className={panco.syncing ? "spin" : ""} />
            </button>
            <button
              aria-label={
                feature === "cards"
                  ? "Adicionar conta"
                  : feature === "subscriptions"
                    ? "Nova assinatura"
                    : feature === "categories"
                      ? "Nova categoria"
                      : "Novo movimento"
              }
              className="primary-button compact"
              onClick={() =>
                open(
                  feature === "cards"
                    ? "account"
                    : feature === "subscriptions"
                      ? "subscription"
                      : feature === "categories"
                        ? "category"
                        : "transaction",
                )
              }
            >
              <Plus size={17} />
              <span>
                {feature === "cards"
                  ? "Adicionar conta"
                  : feature === "subscriptions"
                    ? "Nova assinatura"
                    : feature === "categories"
                      ? "Nova categoria"
                      : "Novo movimento"}
              </span>
            </button>
          </div>
        </header>
        <main className="main-content">
          {panco.error && (
            <div className="notice" role="alert">
              {panco.error}
              <button
                className="icon-button"
                aria-label="Fechar aviso"
                onClick={() => panco.setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {panco.syncing && (
            <div className="notice" role="status">
              Sincronizando suas contas. As páginas concluídas ficam salvas.
            </div>
          )}
          {feature !== "dashboard" && (
            <div className="feature-title">
              <span className="eyebrow">SEU ESPAÇO FINANCEIRO</span>
              <h1>{nav.find((n) => n.id === feature)?.label}</h1>
              <p>{subtitles[feature]}</p>
            </div>
          )}
          {panco.loading ? (
            <div className="empty" role="status">
              Carregando seu espaço…
            </div>
          ) : (
            <>
              {feature === "dashboard" && (
                <Dashboard panco={panco} navigate={navigate} />
              )}{" "}
              {feature === "transactions" && (
                <>
                  <Transactions panco={panco} />
                  <Reconciliation panco={panco} />
                </>
              )}{" "}
              {feature === "planning" && <Planning panco={panco} />}
              {feature === "calendar" && <Calendar panco={panco} />}{" "}
              {feature === "assistant" && <Assistant panco={panco} />}{" "}
              {["cards", "subscriptions", "categories", "investments"].includes(
                feature,
              ) && <Management panco={panco} feature={feature} open={open} />}
            </>
          )}
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Navegação principal no celular">
        {nav.map((n) => (
          <button
            key={n.id}
            title={n.label}
            aria-label={n.label}
            aria-current={feature === n.id ? "page" : undefined}
            className={feature === n.id ? "active" : ""}
            onClick={(event) => {
              navigate(n.id);
              event.currentTarget.scrollIntoView({
                block: "nearest",
                inline: "nearest",
              });
            }}
          >
            <n.icon size={21} aria-hidden="true" />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      {editor?.type === "account" ? (
        <AddAccount panco={panco} close={() => setEditor(null)} />
      ) : (
        editor && (
          <Editor
            key={editor.type + (editor.id || "")}
            {...editor}
            panco={panco}
            close={() => setEditor(null)}
          />
        )
      )}
    </div>
  );
}
