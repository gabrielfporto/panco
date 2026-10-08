import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type {
  PancoData,
  AssistantCard,
  Transaction,
  ChatMessage,
  Budget,
  MonthlyOverview,
} from "./types.ts";
import { demoMonthlyOverview } from "./monthly-demo.ts";
import { demoData } from "./demo.ts";
import { syncItems } from "./sync.ts";
import { isIgnoredTransaction } from "../../core/src/features/transactions/visibility.ts";
import { cents, decimal } from "../../core/src/money.ts";
import { merchantKey } from "../../core/src/features/transactions/billing.ts";
export type PancoController = ReturnType<typeof usePanco>;
export function usePanco(client: SupabaseClient | null) {
  const demo = !client;
  const empty = (): PancoData => ({
    ...demoData(),
    budgets: [],
    accounts: [],
    cards: [],
    categories: [],
    transactions: [],
    invoices: [],
    subscriptions: [],
    investments: [],
    investment_income: [],
    forecast: {
      current_balance: 0,
      pending_income: 0,
      pending_expenses: 0,
      invoices_due: 0,
      projected_balance: 0,
      review_count: 0,
      missing_balance_count: 0,
      as_of: null,
      through: "",
    },
  });
  const [session, setSession] = useState<Session | null>(null),
    [data, setData] = useState<PancoData>(() => (demo ? demoData() : empty())),
    [loading, setLoading] = useState(!!client),
    [error, setError] = useState(""),
    [syncing, setSyncing] = useState(false);
  // Keep the visible cache while revalidating; isolate responses by login and request.
  const cache = useRef({
    userId: "",
    generation: 0,
    request: 0,
    loaded: false,
  });
  const pendingCategories = useRef(new Map<string, string>());
  const [savingCategories, setSavingCategories] = useState<string[]>([]);
  const [month, setMonth] = useState(() =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bahia",
      year: "numeric",
      month: "2-digit",
    })
      .format(new Date())
      .slice(0, 7),
  );
  const displayed = useMemo(() => {
    const transactions = data.transactions.filter(
      (t) => !isIgnoredTransaction(t),
    );
    if (!demo) return { ...data, transactions };
    const income = transactions
      .filter(
        (t) =>
          t.account_id && t.status === "pending" && t.direction === "income",
      )
      .reduce((s, t) => s + cents(t.amount), 0n);
    const expenses = transactions
      .filter(
        (t) =>
          t.account_id && t.status === "pending" && t.direction === "expense",
      )
      .reduce((s, t) => s + cents(t.amount), 0n);
    const balance = data.accounts
      .filter((a) => a.include_in_forecast)
      .reduce((s, a) => s + cents(a.current_balance), 0n);
    const bills = data.invoices.reduce(
      (s, i) => s + cents(i.remaining_due),
      0n,
    );
    return {
      ...data,
      transactions,
      forecast: {
        ...data.forecast,
        current_balance: decimal(balance),
        pending_income: decimal(income),
        pending_expenses: decimal(expenses),
        invoices_due: decimal(bills),
        projected_balance: decimal(balance + income - expenses - bills),
      },
    };
  }, [data, demo]);
  const refresh = useCallback(async () => {
    if (!client || !cache.current.userId) return;
    const generation = cache.current.generation;
    const request = ++cache.current.request;
    const current = () =>
      generation === cache.current.generation &&
      request === cache.current.request;
    if (!cache.current.loaded) setLoading(true);
    try {
      const tables = [
        "accounts",
        "cards",
        "categories",
        "transactions",
        "invoices",
        "subscriptions",
        "investments",
        "investment_income",
        "monthly_budgets",
      ] as const;
      const entries = await Promise.all(
        tables.map(async (table) => {
          const rows: unknown[] = [];
          for (let page = 0; page < 100; page++) {
            const q = client
              .from(table)
              .select("*")
              .order("id")
              .range(page * 1000, page * 1000 + 999);
            const { data, error } = await q;
            if (error) throw error;
            rows.push(...data);
            if (data.length < 1000)
              return [
                table === "monthly_budgets" ? "budgets" : table,
                rows,
              ] as const;
          }
          throw new Error(
            "Limite local de 100 mil registros; reduza o período.",
          );
        }),
      );
      const forecast = await client.rpc("forecast_month");
      if (forecast.error) throw forecast.error;
      if (!current()) return;
      const fresh = {
        ...Object.fromEntries(entries),
        forecast: forecast.data,
      } as PancoData;
      fresh.transactions = fresh.transactions.map((t) =>
        pendingCategories.current.has(t.id)
          ? { ...t, category_id: pendingCategories.current.get(t.id)! }
          : t,
      );
      cache.current.loaded = true;
      setData(fresh);
    } catch (e) {
      if (current())
        setError(
          e instanceof Error
            ? e.message
            : "Falha ao atualizar dados. Tente novamente.",
        );
    } finally {
      if (current()) setLoading(false);
    }
  }, [client]);
  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }
    let active = true;
    let authEvent = false;
    function acceptSession(s: Session | null) {
      if (!active) return;
      const userId = s?.user.id || "";
      if (cache.current.userId !== userId) {
        cache.current = {
          userId,
          generation: cache.current.generation + 1,
          request: 0,
          loaded: false,
        };
        pendingCategories.current.clear();
        setSavingCategories([]);
        setData(empty());
        setError("");
        setLoading(!!userId);
      }
      setSession(s);
      if (!userId) setLoading(false);
    }
    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active || authEvent) return;
        if (error) setError(error.message);
        acceptSession(data.session);
      })
      .catch(() => {
        if (active && !authEvent) {
          setLoading(false);
          setError("Não foi possível recuperar sua sessão. Tente novamente.");
        }
      });
    const { data: listener } = client.auth.onAuthStateChange((_event, s) => {
      authEvent = true;
      acceptSession(s);
    });
    return () => {
      active = false;
      cache.current.generation++;
      listener.subscription.unsubscribe();
    };
  }, [client]);
  const userId = session?.user.id;
  useEffect(() => {
    if (!client || !userId) return;
    const generation = cache.current.generation;
    void (async () => {
      const result = await client.rpc("panco_initialize_planning");
      if (generation !== cache.current.generation) return;
      if (result.error)
        setError(
          "Não foi possível preparar as categorias do planejamento. Tente atualizar novamente.",
        );
      await refresh();
    })().catch(() => {
      if (generation === cache.current.generation) {
        setError("Falha ao carregar seu espaço. Tente novamente.");
        setLoading(false);
      }
    });
    let timer: ReturnType<typeof setTimeout>;
    const channel = client
      .channel("panco-data")
      .on("postgres_changes", { event: "*", schema: "public" }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => void refresh(), 300);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      void client.removeChannel(channel);
    };
  }, [client, userId, refresh]);
  async function loadMonthlyOverview(
    selectedMonth: string,
  ): Promise<MonthlyOverview> {
    if (!/^\d{4}-\d{2}$/.test(selectedMonth)) throw new Error("Mês inválido.");
    if (!client) return demoMonthlyOverview(displayed, selectedMonth);
    const r = await client.rpc("monthly_overview", {
      p_month: selectedMonth + "-01",
      p_currency: "BRL",
    });
    if (r.error)
      throw new Error("Não foi possível atualizar o resumo deste mês.");
    return r.data as MonthlyOverview;
  }
  async function saveBudget(
    month: string,
    rows: Omit<Budget, "month" | "id">[],
  ) {
    if (!/^\d{4}-\d{2}-01$/.test(month)) throw new Error("Mês inválido.");
    const budgets = rows.map((row) => {
      const amount = cents(row.amount);
      if (amount < 0n)
        throw new Error("Use valores estimados iguais ou maiores que zero.");
      return { ...row, month, amount: decimal(amount) };
    });
    if (demo) {
      setData((d) => ({
        ...d,
        budgets: [
          ...(d.budgets || []).filter((b) => b.month !== month),
          ...budgets,
        ],
      }));
      return;
    }
    const generation = cache.current.generation;
    if (budgets.length) {
      const { error } = await client!.from("monthly_budgets").upsert(
        budgets.map((row) => ({ ...row, user_id: session!.user.id })),
        { onConflict: "user_id,month,category_id,direction" },
      );
      if (error) throw error;
    }
    if (generation !== cache.current.generation) return;
    cache.current.request++;
    setData((d) => ({
      ...d,
      budgets: [
        ...(d.budgets || []).filter((b) => b.month !== month),
        ...budgets,
      ],
    }));
    void refresh();
  }
  async function login(email: string, password: string) {
    if (!client) return;
    const r = await client.auth.signInWithPassword({ email, password });
    if (r.error) throw r.error;
  }
  async function signup(
    email: string,
    password: string,
    name: string,
    phone: string,
    redirectTo?: string,
  ) {
    if (!client) throw new Error("Configure o Supabase para criar sua conta.");
    if (!name.trim() || name.trim().length > 80)
      throw new Error("Informe como quer ser chamado (até 80 caracteres).");
    if (
      !/^\+?[\d\s().-]{8,25}$/.test(phone.trim()) ||
      phone.replace(/\D/g, "").length < 8
    )
      throw new Error("Informe um telefone válido com DDD.");
    if (password.length < 8)
      throw new Error("Use uma senha com pelo menos 8 caracteres.");
    const r = await client.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { name: name.trim(), phone: phone.trim() },
        ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
      },
    });
    if (r.error) throw r.error;
    return !!r.data.session;
  }
  async function createAccount(
    name: string,
    balance: string,
    kind = "checking",
  ) {
    if (!name.trim() || name.trim().length > 120)
      throw new Error("Informe o nome da conta (até 120 caracteres).");
    if (!["checking", "savings", "cash", "investment", "other"].includes(kind))
      throw new Error("Tipo de conta inválido.");
    await save("accounts", {
      name: name.trim(),
      kind,
      current_balance: decimal(cents(balance)),
      currency: "BRL",
      balance_as_of: new Date().toISOString(),
      include_in_forecast: true,
    });
  }
  async function logout() {
    const result = await client?.auth.signOut();
    if (result?.error) {
      setError(result.error.message);
      return;
    }
    cache.current = {
      userId: "",
      generation: cache.current.generation + 1,
      request: 0,
      loaded: false,
    };
    pendingCategories.current.clear();
    setSavingCategories([]);
    setSession(null);
    setData(empty());
    setLoading(false);
  }
  async function save(
    table:
      | "categories"
      | "subscriptions"
      | "cards"
      | "accounts"
      | "investment_income",
    values: Record<string, unknown>,
  ) {
    if (demo) {
      const id = String(
        values.id ||
          globalThis.crypto?.randomUUID?.() ||
          "demo-" + Date.now() + "-" + Math.random().toString(36).slice(2),
      );
      setData((d) => ({
        ...d,
        [table]: [
          ...d[table].filter((x) => x.id !== id),
          { ...d[table].find((x) => x.id === id), ...values, id },
        ],
      }));
      return;
    }
    const generation = cache.current.generation;
    const { data: saved, error } = await client!
      .from(table)
      .upsert({ ...values, user_id: session!.user.id })
      .select("*")
      .single();
    if (error) throw error;
    if (generation !== cache.current.generation) return;
    cache.current.request++;
    setData((d) => ({
      ...d,
      [table]: [...d[table].filter((row) => row.id !== saved.id), saved],
    }));
    void refresh();
  }
  async function categorize(id: string, categoryId: string) {
    if (demo) {
      setData((d) => ({
        ...d,
        transactions: d.transactions.map((t) =>
          t.id === id ? { ...t, category_id: categoryId } : t,
        ),
      }));
      return;
    }
    if (pendingCategories.current.has(id))
      throw new Error("Aguarde o salvamento desta categoria.");
    const generation = cache.current.generation;
    const previous =
      data.transactions.find((t) => t.id === id)?.category_id ?? null;
    pendingCategories.current.set(id, categoryId);
    setSavingCategories((ids) => [...ids, id]);
    setData((d) => ({
      ...d,
      transactions: d.transactions.map((t) =>
        t.id === id ? { ...t, category_id: categoryId } : t,
      ),
    }));
    try {
      const { error } = await client!
        .from("transactions")
        .update({ category_id: categoryId, category_source: "manual" })
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
    } catch (error) {
      if (generation === cache.current.generation) {
        setData((d) => ({
          ...d,
          transactions: d.transactions.map((t) =>
            t.id === id ? { ...t, category_id: previous } : t,
          ),
        }));
      }
      throw error;
    } finally {
      if (generation === cache.current.generation) {
        // Invalidate reads started before this write finished, including Realtime reads.
        cache.current.request++;
        pendingCategories.current.delete(id);
        setSavingCategories((ids) => ids.filter((value) => value !== id));
        void refresh();
      }
    }
  }
  async function createTransaction(values: Record<string, unknown>) {
    if (demo) {
      const row = {
        ...values,
        id:
          globalThis.crypto?.randomUUID?.() ||
          "demo-" + Date.now() + "-" + Math.random().toString(36).slice(2),
        occurred_at: String(values.date) + "T12:00:00Z",
        due_date: String(values.date),
        merchant_name: values.description,
        merchant_key: merchantKey(String(values.description)),
        source: "manual",
        needs_review: false,
        kind: "regular",
        currency: "BRL",
      } as unknown as Transaction;
      setData((d) => ({ ...d, transactions: [row, ...d.transactions] }));
      return;
    }
    const generation = cache.current.generation;
    const { error } = await client!.rpc("create_manual_transaction", {
      p_data: values,
    });
    if (error) throw error;
    if (generation === cache.current.generation) void refresh();
  }
  async function sync(onlyItem?: string, register = false) {
    if (demo) {
      const message =
        "Demonstração: configure o Supabase para conectar suas contas.";
      if (onlyItem) throw new Error(message);
      setError(message);
      return;
    }
    setSyncing(true);
    setError("");
    async function invoke(body: Record<string, unknown>) {
      const r = await client!.functions.invoke("sync", { body });
      if (r.error) {
        let message = r.error.message;
        try {
          const payload = await r.error.context?.json();
          if (payload?.error) message = payload.error;
        } catch {}
        throw new Error(message);
      }
      if (r.data?.error) throw new Error(r.data.error);
      return r.data;
    }
    try {
      const { items } = onlyItem
        ? { items: [onlyItem.trim()] }
        : await invoke({});
      if (!items.length)
        throw new Error(
          "Use Adicionar conta para cadastrar um Item ID ou criar uma conta manual.",
        );
      try {
        await syncItems(invoke, items, register);
      } finally {
        // Load committed data even when another resource failed.
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao sincronizar.");
      if (onlyItem) throw e;
    } finally {
      setSyncing(false);
    }
  }
  async function ask(
    message: string,
    history: ChatMessage[] = [],
  ): Promise<{ text: string; cards: AssistantCard[] }> {
    if (demo) {
      const lower = message.toLowerCase();
      if (/saldo|previs|projet/.test(lower))
        return {
          text: "Na demonstração, esta é a previsão com os lançamentos de exemplo.",
          cards: [
            {
              type: "forecast",
              projected_balance: displayed.forecast.projected_balance,
              through: data.forecast.through,
            },
          ],
        };
      const term = lower.includes("ifood") ? "ifood" : "";
      const rows = displayed.transactions.filter(
        (t) =>
          t.direction === "expense" &&
          t.source !== "projection" &&
          t.kind === "regular" &&
          (!term || t.description.toLowerCase().includes(term)),
      );
      return {
        text: "Consulta demonstrativa, sem chamada à IA. Com sua chave configurada, as perguntas serão interpretadas pelo assistente.",
        cards: [
          {
            type: "spending_summary",
            title: term ? "iFood neste mês" : "Despesas de exemplo",
            amount: decimal(rows.reduce((s, t) => s + cents(t.amount), 0n)),
            count: rows.length,
          },
        ],
      };
    }
    const r = await client!.functions.invoke("assistant", {
      body: {
        message,
        history: history.slice(-6).map((m) => ({ role: m.role, text: m.text })),
      },
    });
    if (r.error) throw r.error;
    if (r.data?.error) throw new Error(r.data.error);
    return {
      text: String(r.data.text),
      cards: (r.data.cards || []).filter((c: AssistantCard) =>
        ["spending_summary", "forecast"].includes(c.type),
      ),
    };
  }
  async function schedule() {
    if (demo) {
      setError(
        "Na demonstração, as cobranças de exemplo já estão programadas.",
      );
      return;
    }
    const now = new Date(),
      end = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0))
        .toISOString()
        .slice(0, 10);
    const r = await client!.rpc("schedule_subscriptions", { p_until: end });
    if (r.error) throw r.error;
    await refresh();
  }
  async function reconcile(projection: string, actual: string) {
    if (demo) {
      setData((d) => ({
        ...d,
        transactions: d.transactions.map((t) =>
          t.id === projection
            ? { ...t, status: "cancelled", needs_review: false }
            : t.id === actual
              ? { ...t, needs_review: false }
              : t,
        ),
      }));
      return;
    }
    const r = await client!.rpc("reconcile_projection", {
      p_projection: projection,
      p_actual: actual,
    });
    if (r.error) throw r.error;
    await refresh();
  }
  async function allocate(
    invoiceId: string,
    transactionId: string,
    amount: string,
  ) {
    if (demo) {
      setError("Conciliação de pagamento disponível com Supabase conectado.");
      return;
    }
    const r = await client!.from("invoice_payments").upsert(
      {
        user_id: session!.user.id,
        invoice_id: invoiceId,
        transaction_id: transactionId,
        amount,
      },
      { onConflict: "invoice_id,transaction_id" },
    );
    if (r.error) throw r.error;
    await refresh();
  }
  return {
    demo,
    session,
    data: displayed,
    loading,
    error,
    syncing,
    savingCategories,
    month,
    setMonth,
    loadMonthlyOverview,
    setError,
    login,
    signup,
    createAccount,
    saveBudget,
    logout,
    refresh,
    save,
    categorize,
    createTransaction,
    sync,
    ask,
    schedule,
    reconcile,
    allocate,
  };
}
