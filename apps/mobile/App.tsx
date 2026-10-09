import { Donut } from "./features/dashboard/Donut";
import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  SafeAreaView,
  Modal,
  Platform,
  ActivityIndicator,
  AppState,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { usePanco } from "../../packages/react-features/src/use-panco";
import type {
  ChatMessage,
  Feature,
} from "../../packages/react-features/src/types";
import { brl } from "../../packages/core/src/money";
import { addMonths } from "../../packages/core/src/features/transactions/billing";
import { pancoTokens } from "../../packages/core/src/theme";
const url = process.env.EXPO_PUBLIC_SUPABASE_URL,
  key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const client =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: AsyncStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;
if (client)
  AppState.addEventListener("change", (s) =>
    s === "active"
      ? client.auth.startAutoRefresh()
      : client.auth.stopAutoRefresh(),
  );
const tabs: { id: Feature; name: string }[] = [
  { id: "dashboard", name: "Visão geral" },
  { id: "calendar", name: "Calendário" },
  { id: "transactions", name: "Transações" },
  { id: "cards", name: "Cartões" },
  { id: "subscriptions", name: "Assinaturas" },
  { id: "categories", name: "Categorias" },
  { id: "investments", name: "Investimentos" },
  { id: "assistant", name: "Assistente" },
];
const day = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bahia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[s.button, secondary && s.secondary, disabled && { opacity: 0.5 }]}
    >
      <Text style={[s.buttonText, secondary && { color: "#0F3B2E" }]}>
        {title}
      </Text>
    </Pressable>
  );
}
function Field({
  label,
  value,
  onChange,
  secure = false,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  secure?: boolean;
}) {
  return (
    <View style={{ marginBottom: 15 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={s.input}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        autoCapitalize="none"
      />
    </View>
  );
}
export default function App() {
  const panco = usePanco(client),
    d = panco.data;
  const [feature, setFeature] = useState<Feature>("dashboard"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [signup, setSignup] = useState(false),
    [displayName, setDisplayName] = useState(""),
    [phone, setPhone] = useState(""),
    [authMessage, setAuthMessage] = useState(""),
    [demoEntered, setDemoEntered] = useState(false),
    [accountMode, setAccountMode] = useState("manual"),
    [itemId, setItemId] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all");
  const [month, setMonth] = useState(day().slice(0, 7) + "-01"),
    [selected, setSelected] = useState(day()),
    [messages, setMessages] = useState<ChatMessage[]>([]),
    [question, setQuestion] = useState("");
  const [editor, setEditor] = useState(""),
    [editingId, setEditingId] = useState(""),
    [name, setName] = useState(""),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(day()),
    [linked, setLinked] = useState(""),
    [direction, setDirection] = useState("expense"),
    [category, setCategory] = useState(""),
    [closing, setClosing] = useState("25"),
    [due, setDue] = useState("5");
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      panco.setError(
        e instanceof Error ? e.message : "Não foi possível concluir.",
      );
    } finally {
      setBusy(false);
    }
  };
  function open(type: string, id = "") {
    panco.setError("");
    setEditor(type);
    setAccountMode("manual");
    setItemId("");
    setEditingId(id);
    setName("");
    setAmount(type === "account" ? "0" : "");
    setLinked(
      d.accounts[0]
        ? "account:" + d.accounts[0].id
        : d.cards[0]
          ? "card:" + d.cards[0].id
          : "",
    );
    setDate(day());
    setCategory("");
    if (type === "card") {
      const c = d.cards.find((c) => c.id === id);
      setName(c?.name || "");
      setClosing(String(c?.closing_day || 25));
      setDue(String(c?.due_day || 5));
    }
  }
  async function save() {
    if (editor === "account") {
      if (accountMode === "pluggy") await panco.sync(itemId.trim(), true);
      else await panco.createAccount(name, amount);
    }
    if (editor === "transaction")
      await panco.createTransaction({
        description: name,
        amount,
        date,
        account_id: linked.startsWith("account:") ? linked.slice(8) : null,
        card_id: linked.startsWith("card:") ? linked.slice(5) : null,
        category_id: category || null,
        direction,
        status: "pending",
      });
    if (editor === "category")
      await panco.save("categories", {
        name,
        kind: "expense",
        color: "#0F3B2E",
        icon: "tag",
      });
    if (editor === "subscription")
      await panco.save("subscriptions", {
        name,
        merchant_key: name.toLowerCase().trim(),
        amount,
        currency: "BRL",
        interval_unit: "month",
        interval_count: 1,
        next_due_date: date,
        status: "active",
        account_id: linked.startsWith("account:") ? linked.slice(8) : null,
        card_id: linked.startsWith("card:") ? linked.slice(5) : null,
      });
    if (editor === "card")
      await panco.save("cards", {
        id: editingId,
        name,
        closing_day: Number(closing),
        due_day: Number(due),
      });
    setEditor("");
  }
  async function send() {
    if (!question.trim()) return;
    const q = question;
    setQuestion("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    const answer = await panco.ask(q, messages);
    setMessages((m) => [...m, { role: "assistant", ...answer }]);
  }
  const rows = d.transactions.filter(
    (t) =>
      t.status !== "cancelled" &&
      t.description.toLowerCase().includes(query.toLowerCase()) &&
      (status === "all" || t.status === status),
  );
  const selectedEvents = [
    ...d.transactions
      .filter(
        (t) =>
          (t.due_date || t.occurred_at).slice(0, 10) === selected &&
          t.status !== "cancelled",
      )
      .map((t) => ({ id: t.id, name: t.description, amount: t.amount })),
    ...d.invoices
      .filter((i) => i.due_date === selected)
      .map((i) => ({
        id: i.id,
        name: "Fatura do cartão",
        amount: i.remaining_due,
      })),
  ];
  if (!panco.session && !(panco.demo && demoEntered))
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={s.login}>
          <Text style={s.logo}>panco ✳</Text>
          <Text style={s.title}>Seu dinheiro.{"\n"}Mais possibilidades.</Text>
          <Text style={s.subtitle}>
            {signup
              ? "Crie sua conta no Panco."
              : "Entre no seu espaço pessoal."}
          </Text>
          {signup && (
            <>
              <Field
                label="Como quer ser chamado?"
                value={displayName}
                onChange={setDisplayName}
              />
              <Field
                label="Telefone com DDD"
                value={phone}
                onChange={setPhone}
              />
            </>
          )}
          <Field label="E-mail" value={email} onChange={setEmail} />
          <Field label="Senha" value={password} onChange={setPassword} secure />
          {panco.error ? <Text style={s.error}>{panco.error}</Text> : null}
          <Button
            title={busy ? "Aguarde…" : signup ? "Criar minha conta" : "Entrar"}
            disabled={busy}
            onPress={() =>
              void run(async () => {
                setAuthMessage("");
                if (panco.demo)
                  throw new Error(
                    "Configure o Supabase para entrar ou criar sua conta.",
                  );
                if (signup) {
                  const signedIn = await panco.signup(
                    email,
                    password,
                    displayName,
                    phone,
                  );
                  if (!signedIn)
                    setAuthMessage(
                      "Confirme seu e-mail e depois entre com sua senha.",
                    );
                } else await panco.login(email, password);
              })
            }
          />
          {authMessage ? <Text style={s.subtitle}>{authMessage}</Text> : null}
          <Button
            title={signup ? "Já tenho cadastro" : "Criar cadastro"}
            secondary
            onPress={() => {
              setSignup(!signup);
              setAuthMessage("");
              panco.setError("");
            }}
          />
          {panco.demo && (
            <Button
              title="Explorar demonstração"
              secondary
              onPress={() => setDemoEntered(true)}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <Text style={s.logo}>
          panco <Text style={{ color: "#99AA7C" }}>✳</Text>
        </Text>
        <Pressable
          onPress={() => void panco.sync()}
          accessibilityLabel="Sincronizar"
        >
          <Text style={s.headerAction}>
            {panco.syncing
              ? "Sincronizando…"
              : panco.demo
                ? "Demonstração ↻"
                : "Atualizar ↻"}
          </Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.tabs}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}
      >
        {tabs.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => setFeature(t.id)}
            style={[s.tab, feature === t.id && s.tabActive]}
          >
            <Text style={[s.tabText, feature === t.id && { color: "white" }]}>
              {t.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        {panco.error ? (
          <Pressable onPress={() => panco.setError("")}>
            <Text style={s.error}>{panco.error} ×</Text>
          </Pressable>
        ) : null}
        {panco.loading ? <ActivityIndicator color="#0F3B2E" /> : null}
        {feature === "dashboard" && (
          <>
            <Text style={s.eyebrow}>UM OLHAR PARA O QUE VEM A SEGUIR</Text>
            <Text style={s.title}>Seu dinheiro.{"\n"}Mais possibilidades.</Text>
            <Text style={s.subtitle}>
              Um espaço para cuidar do presente e do futuro.
            </Text>
            <View style={[s.card, s.hero]}>
              <Text style={s.heroLabel}>SALDO PROJETADO · FIM DO MÊS</Text>
              <Text style={s.heroValue}>
                {brl(d.forecast.projected_balance)}
              </Text>
              <Text style={s.heroFoot}>
                Saldo atual {brl(d.forecast.current_balance)}
              </Text>
            </View>
            <View style={s.twoCols}>
              <View style={[s.card, { flex: 1 }]}>
                <Text style={s.label}>A receber</Text>
                <Text style={s.stat}>{brl(d.forecast.pending_income)}</Text>
              </View>
              <View style={[s.card, { flex: 1 }]}>
                <Text style={s.label}>Despesas e faturas</Text>
                <Text style={s.stat}>
                  {brl(
                    Number(d.forecast.pending_expenses) +
                      Number(d.forecast.invoices_due),
                  )}
                </Text>
              </View>
            </View>
            {d.forecast.review_count > 0 && (
              <Text style={s.error}>
                Há {d.forecast.review_count} movimentos para revisar.
              </Text>
            )}
            <View style={s.card}>
              <Text style={s.sectionTitle}>O ritmo do seu mês</Text>
              <Donut
                income={d.transactions
                  .filter(
                    (t) =>
                      t.direction === "income" &&
                      t.kind === "regular" &&
                      t.source !== "projection" &&
                      t.status !== "cancelled" &&
                      t.occurred_at.startsWith(day().slice(0, 7)),
                  )
                  .reduce((sum, t) => sum + Number(t.amount), 0)}
                expense={d.transactions
                  .filter(
                    (t) =>
                      t.direction === "expense" &&
                      t.kind === "regular" &&
                      t.source !== "projection" &&
                      t.status !== "cancelled" &&
                      t.occurred_at.startsWith(day().slice(0, 7)),
                  )
                  .reduce((sum, t) => sum + Number(t.amount), 0)}
              />
              <Text style={s.small}>Verde: receitas · Cinza: despesas</Text>
            </View>
            <View style={s.card}>
              <Text style={s.sectionTitle}>Próximos vencimentos</Text>
              {d.transactions
                .filter((t) => t.status === "pending" && t.account_id)
                .slice(0, 4)
                .map((t) => (
                  <View style={s.row} key={t.id}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowTitle}>{t.description}</Text>
                      <Text style={s.small}>{t.due_date}</Text>
                    </View>
                    <Text style={s.rowAmount}>{brl(t.amount)}</Text>
                  </View>
                ))}
              {d.invoices
                .filter((i) => Number(i.remaining_due) > 0)
                .slice(0, 3)
                .map((i) => (
                  <View style={s.row} key={i.id}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowTitle}>Fatura do cartão</Text>
                      <Text style={s.small}>{i.due_date}</Text>
                    </View>
                    <Text style={s.rowAmount}>{brl(i.remaining_due)}</Text>
                  </View>
                ))}
            </View>
            <Button
              title="+ Novo movimento"
              onPress={() => open("transaction")}
            />
            <View
              style={[s.card, { backgroundColor: "#EDF1E4", marginTop: 18 }]}
            >
              <Text style={s.eyebrow}>SEU ASSISTENTE PANCO</Text>
              <Text style={s.sectionTitle}>Uma pergunta. Mais clareza.</Text>
              <Button
                title="Vamos conversar ↗"
                secondary
                onPress={() => setFeature("assistant")}
              />
            </View>
          </>
        )}
        {feature === "transactions" && (
          <>
            <Text style={s.title}>Seus movimentos</Text>
            <TextInput
              style={[s.input, { marginVertical: 15 }]}
              placeholder="Buscar transações…"
              value={query}
              onChangeText={setQuery}
            />
            <View style={s.chips}>
              {[
                ["all", "Todas"],
                ["pending", "Pendentes"],
                ["posted", "Confirmadas"],
              ].map(([v, l]) => (
                <Pressable
                  style={[s.chip, status === v && s.chipActive]}
                  key={v}
                  onPress={() => setStatus(v)}
                >
                  <Text style={s.chipText}>{l}</Text>
                </Pressable>
              ))}
            </View>
            <Button
              title="+ Novo movimento"
              onPress={() => open("transaction")}
            />
            <View style={s.card}>
              {rows.map((t) => (
                <View key={t.id} style={s.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle}>
                      {t.merchant_name || t.description}
                    </Text>
                    <Text style={s.small}>
                      {d.accounts.find((a) => a.id === t.account_id)?.name ||
                        d.cards.find((c) => c.id === t.card_id)?.name}{" "}
                      · {t.occurred_at.slice(0, 10)}
                    </Text>
                    <Pressable
                      onPress={() => {
                        setEditingId(t.id);
                        setEditor("categorize");
                      }}
                    >
                      <Text style={s.link}>
                        {d.categories.find((c) => c.id === t.category_id)
                          ?.name || "Categorizar"}{" "}
                        ✎
                      </Text>
                    </Pressable>
                    {t.total_installments && (
                      <Text style={s.small}>
                        Parcela {t.installment_number}/{t.total_installments}
                      </Text>
                    )}
                  </View>
                  <Text
                    style={[
                      s.rowAmount,
                      t.direction === "income" && { color: "#4D7D4D" },
                    ]}
                  >
                    {t.direction === "income" ? "+" : "−"} {brl(t.amount)}
                  </Text>
                </View>
              ))}
              {!rows.length && (
                <Text style={s.subtitle}>Nenhum resultado.</Text>
              )}
            </View>
          </>
        )}
        {feature === "calendar" && (
          <>
            <View style={s.calendarHeader}>
              <Button
                title="‹"
                secondary
                onPress={() => setMonth(addMonths(month, -1))}
              />
              <Text style={s.sectionTitle}>{month.slice(0, 7)}</Text>
              <Button
                title="›"
                secondary
                onPress={() => setMonth(addMonths(month, 1))}
              />
            </View>
            <View style={[s.card, s.calendar]}>
              {["D", "S", "T", "Q", "Q", "S", "S"].map((v, i) => (
                <Text key={"w" + i} style={s.weekday}>
                  {v}
                </Text>
              ))}
              {Array.from(
                { length: new Date(month + "T12:00:00Z").getUTCDay() },
                (_, i) => (
                  <View key={"b" + i} style={s.day} />
                ),
              )}
              {Array.from(
                {
                  length: new Date(
                    Date.UTC(
                      Number(month.slice(0, 4)),
                      Number(month.slice(5, 7)),
                      0,
                    ),
                  ).getUTCDate(),
                },
                (_, i) => {
                  const dt =
                    month.slice(0, 7) + "-" + String(i + 1).padStart(2, "0");
                  const has = d.transactions.some((t) =>
                    (t.due_date || t.occurred_at).startsWith(dt),
                  );
                  return (
                    <Pressable
                      key={dt}
                      style={[s.day, dt === selected && s.selectedDay]}
                      onPress={() => setSelected(dt)}
                    >
                      <Text
                        style={
                          dt === selected ? { color: "white" } : s.rowTitle
                        }
                      >
                        {i + 1}
                      </Text>
                      <Text
                        style={{
                          color: dt === selected ? "#C8DAB1" : "#97AE78",
                          fontSize: 10,
                        }}
                      >
                        {has ? "●" : " "}
                      </Text>
                    </Pressable>
                  );
                },
              )}
            </View>
            <View style={s.card}>
              <Text style={s.sectionTitle}>{selected}</Text>
              {selectedEvents.map((t) => (
                <View style={s.row} key={t.id}>
                  <Text style={[s.rowTitle, { flex: 1 }]}>{t.name}</Text>
                  <Text style={s.rowAmount}>{brl(t.amount)}</Text>
                </View>
              ))}
              {!selectedEvents.length && (
                <Text style={s.subtitle}>
                  Nada programado. Um respiro no calendário.
                </Text>
              )}
            </View>
          </>
        )}
        {feature === "cards" && (
          <>
            <Text style={s.title}>Contas e cartões</Text>
            <Button title="Adicionar conta" onPress={() => open("account")} />
            {d.accounts.map((a) => (
              <View style={s.card} key={a.id}>
                <Text style={s.sectionTitle}>{a.name}</Text>
                <Text style={s.subtitle}>
                  {a.pluggy_account_id
                    ? "Conectada via Pluggy"
                    : "Conta manual"}
                </Text>
                <Text style={s.rowAmount}>{brl(a.current_balance)}</Text>
              </View>
            ))}
            <Text style={s.sectionTitle}>Seus cartões</Text>
            {d.cards.map((c) => (
              <View style={s.card} key={c.id}>
                <View style={[s.hero, { borderRadius: 16, padding: 25 }]}>
                  <Text style={s.heroLabel}>{c.name}</Text>
                  <Text
                    style={[s.heroValue, { fontSize: 23, marginVertical: 23 }]}
                  >
                    ••••　••••　{c.last_four || "••••"}
                  </Text>
                  <Text style={s.heroLabel}>{c.brand}</Text>
                </View>
                <View style={s.row}>
                  <Text style={{ flex: 1 }}>Limite disponível</Text>
                  <Text style={s.rowAmount}>
                    {c.available_limit == null
                      ? "Não informado"
                      : brl(c.available_limit)}
                  </Text>
                </View>
                <Text style={s.subtitle}>
                  Fecha dia {c.closing_day || "—"} · Vence dia{" "}
                  {c.due_day || "—"}
                </Text>
                <Button
                  title="Configurar datas"
                  secondary
                  onPress={() => open("card", c.id)}
                />
              </View>
            ))}
            {d.invoices.map((i) => (
              <View style={s.card} key={i.id}>
                <Text style={s.sectionTitle}>Fatura · {i.due_date}</Text>
                <Text style={s.stat}>{brl(i.remaining_due)}</Text>
                <Text style={s.small}>
                  {i.reported_total == null
                    ? "Estimada"
                    : "Informada pelo banco"}
                </Text>
              </View>
            ))}
            {!d.cards.length && (
              <Text style={s.subtitle}>
                Sincronize para carregar seus cartões.
              </Text>
            )}
          </>
        )}
        {feature === "subscriptions" && (
          <>
            <Text style={s.title}>Tudo o que se repete.</Text>
            <Text style={s.subtitle}>Suas assinaturas, em um só lugar.</Text>
            <Button
              title="+ Nova assinatura"
              onPress={() => open("subscription")}
            />
            {d.subscriptions.map((x) => (
              <View style={s.card} key={x.id}>
                <View style={s.row}>
                  <Text style={[s.sectionTitle, { flex: 1 }]}>{x.name}</Text>
                  <Text style={s.stat}>{brl(x.amount)}</Text>
                </View>
                <Text style={s.small}>
                  Próxima: {x.next_due_date} ·{" "}
                  {x.status === "active" ? "Ativa" : "Pausada"}
                </Text>
                <Button
                  title={x.status === "active" ? "Pausar" : "Retomar"}
                  secondary
                  onPress={() =>
                    void run(() =>
                      panco.save("subscriptions", {
                        ...x,
                        status: x.status === "active" ? "paused" : "active",
                      }),
                    )
                  }
                />
              </View>
            ))}
            <Button
              title="Programar cobranças do mês"
              secondary
              onPress={() => void run(panco.schedule)}
            />
          </>
        )}
        {feature === "categories" && (
          <>
            <Text style={s.title}>Cada coisa em seu lugar.</Text>
            <Text style={s.subtitle}>Suas categorias e regras pessoais.</Text>
            <Button title="+ Nova categoria" onPress={() => open("category")} />
            {d.categories.filter(c => !c.archived_at).map((c) => (
              <View style={[s.card, s.row]} key={c.id}>
                <View style={[s.categoryDot, { backgroundColor: c.color }]} />
                <Text style={[s.rowTitle, { flex: 1 }]}>{c.name}</Text>
                <Text style={s.small}>
                  {c.kind === "income" ? "Receita" : "Despesa"}
                </Text>
              </View>
            ))}
          </>
        )}
        {feature === "investments" && (
          <>
            <Text style={s.title}>O futuro em construção.</Text>
            <View style={[s.card, s.hero]}>
              <Text style={s.heroLabel}>PATRIMÔNIO INVESTIDO</Text>
              <Text style={s.heroValue}>
                {brl(
                  d.investments.reduce(
                    (sum, x) => sum + Number(x.current_value || 0),
                    0,
                  ),
                )}
              </Text>
            </View>
            {d.investments.map((x) => (
              <View style={s.card} key={x.id}>
                <Text style={s.sectionTitle}>{x.name}</Text>
                <Text style={s.stat}>{brl(x.current_value || 0)}</Text>
              </View>
            ))}
            <View style={s.card}>
              <Text style={s.sectionTitle}>Renda passiva</Text>
              {d.investment_income.map((x) => (
                <View style={s.row} key={x.id}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle}>
                      {
                        d.investments.find((i) => i.id === x.investment_id)
                          ?.name
                      }
                    </Text>
                    <Text style={s.small}>{x.payment_date}</Text>
                  </View>
                  <Text style={s.rowAmount}>+ {brl(x.net_amount)}</Text>
                </View>
              ))}
            </View>
          </>
        )}
        {feature === "assistant" && (
          <>
            <Text style={s.eyebrow}>SEU ASSISTENTE PANCO</Text>
            <Text style={s.title}>O que vamos descobrir?</Text>
            <Text style={s.subtitle}>
              Pergunte sobre gastos ou previsão de saldo.
            </Text>
            {messages.map((m, i) => (
              <View
                style={[
                  s.card,
                  m.role === "user" && {
                    backgroundColor: "#E9EFDE",
                    marginLeft: 30,
                  },
                ]}
                key={i}
              >
                <Text style={s.message}>{m.text}</Text>
                {m.cards?.map((c, j) => (
                  <View style={s.answer} key={j}>
                    <Text style={s.label}>{c.title || "Saldo projetado"}</Text>
                    <Text style={s.stat}>
                      {brl(c.amount ?? c.projected_balance ?? 0)}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
            <Field
              label="Sua pergunta"
              value={question}
              onChange={setQuestion}
            />
            <Button
              title={busy ? "Consultando…" : "Enviar ↑"}
              disabled={busy}
              onPress={() => void run(send)}
            />
            {panco.demo && (
              <Text style={s.small}>
                Demonstração com respostas locais. Não usa a API.
              </Text>
            )}
          </>
        )}
        {!panco.demo && (
          <Button
            title="Sair da conta"
            secondary
            onPress={() => void panco.logout()}
          />
        )}
        <Text style={s.footer}>Menos ruído. Mais cuidado.　✳</Text>
      </ScrollView>
      <Modal
        visible={!!editor}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (!busy) setEditor("");
        }}
      >
        <SafeAreaView style={s.safe}>
          <ScrollView contentContainerStyle={s.content}>
            <View style={s.row}>
              <Text style={[s.sectionTitle, { flex: 1 }]}>
                {editor === "categorize"
                  ? "Escolha a categoria"
                  : editor === "card"
                    ? "Configurar cartão"
                    : "Novo registro"}
              </Text>
              <Button
                title="Fechar"
                secondary
                disabled={busy}
                onPress={() => setEditor("")}
              />
            </View>
            {editor === "categorize" ? (
              d.categories.filter(c => !c.archived_at).map((c) => (
                <Button
                  key={c.id}
                  title={c.name}
                  secondary
                  onPress={() =>
                    void run(async () => {
                      await panco.categorize(editingId, c.id);
                      setEditor("");
                    })
                  }
                />
              ))
            ) : (
              <>
                {editor === "account" && (
                  <>
                    <Text style={s.sectionTitle}>Adicionar conta</Text>
                    <View style={s.chips}>
                      <Button
                        title="Conta manual"
                        secondary={accountMode !== "manual"}
                        disabled={busy}
                        onPress={() => setAccountMode("manual")}
                      />
                      <Button
                        title="Conectar com Pluggy"
                        secondary={accountMode !== "pluggy"}
                        disabled={busy}
                        onPress={() => setAccountMode("pluggy")}
                      />
                    </View>
                  </>
                )}
                {editor === "account" && accountMode === "pluggy" ? (
                  <>
                    <Field
                      label="Item ID da Pluggy"
                      value={itemId}
                      onChange={setItemId}
                    />
                    <Text style={s.subtitle}>
                      Use o Item ID do banco, não o ID de uma conta. Client ID e
                      secret ficam no servidor.
                    </Text>
                  </>
                ) : (
                  <Field label="Nome" value={name} onChange={setName} />
                )}
                {editor === "account" && accountMode === "manual" && (
                  <Field
                    label="Saldo atual (zero ou negativo permitido)"
                    value={amount}
                    onChange={setAmount}
                  />
                )}
                {["transaction", "subscription"].includes(editor) && (
                  <>
                    <Field
                      label="Valor (use ponto decimal)"
                      value={amount}
                      onChange={setAmount}
                    />
                    <Field
                      label="Data (AAAA-MM-DD)"
                      value={date}
                      onChange={setDate}
                    />
                    <Text style={s.label}>Conta ou cartão</Text>
                    <View style={s.chips}>
                      {[
                        ...d.accounts.map((a) => ({
                          id: "account:" + a.id,
                          name: a.name,
                        })),
                        ...d.cards.map((c) => ({
                          id: "card:" + c.id,
                          name: c.name,
                        })),
                      ].map((a) => (
                        <Pressable
                          key={a.id}
                          onPress={() => setLinked(a.id)}
                          style={[s.chip, linked === a.id && s.chipActive]}
                        >
                          <Text style={s.chipText}>{a.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}
                {editor === "transaction" && (
                  <>
                    <View style={s.chips}>
                      {[
                        ["expense", "Despesa"],
                        ["income", "Receita"],
                      ].map(([v, l]) => (
                        <Pressable
                          style={[s.chip, direction === v && s.chipActive]}
                          key={v}
                          onPress={() => setDirection(v)}
                        >
                          <Text style={s.chipText}>{l}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={s.label}>Categoria</Text>
                    <View style={s.chips}>
                      {d.categories.filter(c => !c.archived_at).map((c) => (
                        <Pressable
                          key={c.id}
                          style={[s.chip, category === c.id && s.chipActive]}
                          onPress={() => setCategory(c.id)}
                        >
                          <Text style={s.chipText}>{c.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}
                {editor === "card" && (
                  <>
                    <Field
                      label="Dia de fechamento"
                      value={closing}
                      onChange={setClosing}
                    />
                    <Field
                      label="Dia de vencimento"
                      value={due}
                      onChange={setDue}
                    />
                  </>
                )}
                {panco.error ? (
                  <Text style={s.error}>{panco.error}</Text>
                ) : null}
                <Button
                  title={busy ? "Salvando…" : "Salvar"}
                  disabled={
                    busy ||
                    (editor === "account" && accountMode === "pluggy"
                      ? !itemId.trim() || panco.demo
                      : !name.trim())
                  }
                  onPress={() => void run(save)}
                />
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
const serif = Platform.OS === "ios" ? "Georgia" : "serif";
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: pancoTokens.colors.background },
  header: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: {
    fontFamily: serif,
    fontSize: 42,
    color: "#0F3B2E",
    letterSpacing: -2,
  },
  headerAction: { fontSize: 11, color: "#78915E" },
  tabs: { flexGrow: 0, maxHeight: 49 },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 9,
    backgroundColor: "#EFF2E7",
  },
  tabActive: { backgroundColor: pancoTokens.colors.forest },
  tabText: { fontSize: 12, color: "#74865F" },
  content: { padding: 22, paddingBottom: 45 },
  eyebrow: {
    fontSize: 9,
    letterSpacing: 1.4,
    color: "#8E9C7B",
    marginBottom: 13,
  },
  title: {
    fontFamily: serif,
    fontSize: 33,
    color: "#213D2D",
    lineHeight: 42,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 20,
    color: "#8B967D",
    marginBottom: 23,
  },
  card: {
    padding: 21,
    borderWidth: 1,
    borderColor: "#E8EDDF",
    borderRadius: 18,
    backgroundColor: "white",
    marginVertical: 9,
  },
  hero: { backgroundColor: pancoTokens.colors.forest, borderColor: "#0F3B2E" },
  heroLabel: { fontSize: 10, letterSpacing: 1, color: "#C2D3AD" },
  heroValue: {
    fontSize: 35,
    color: "white",
    fontVariant: ["tabular-nums"],
    letterSpacing: -1,
    marginVertical: 19,
  },
  heroFoot: {
    fontSize: 11,
    color: "#ADCA99",
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#2D543B",
  },
  twoCols: { flexDirection: "row", gap: 12 },
  label: { fontSize: 11, color: "#8B9C74", marginBottom: 9 },
  stat: {
    fontSize: 21,
    color: "#29432F",
    fontVariant: ["tabular-nums"],
    fontWeight: "500",
    marginBottom: 7,
  },
  sectionTitle: {
    fontFamily: serif,
    fontSize: 23,
    color: "#29432F",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#EFF2E8",
  },
  rowTitle: { fontSize: 13, color: "#3B5138", fontWeight: "500" },
  rowAmount: { fontSize: 13, color: "#354D31", fontVariant: ["tabular-nums"] },
  small: { fontSize: 10, color: "#9BA88B", marginTop: 5, lineHeight: 17 },
  button: {
    backgroundColor: pancoTokens.colors.forest,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 19,
    alignItems: "center",
    marginVertical: 7,
  },
  buttonText: { fontSize: 12, color: "white", fontWeight: "500" },
  secondary: { backgroundColor: "#EFF4E7" },
  input: {
    borderWidth: 1,
    borderColor: "#DCE7CB",
    borderRadius: 9,
    padding: 13,
    color: "#29432F",
    backgroundColor: "white",
    fontSize: 14,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 10 },
  chip: { borderRadius: 7, padding: 9, backgroundColor: "#F0F3E9" },
  chipActive: { backgroundColor: "#DCE9C8" },
  chipText: { fontSize: 11, color: "#657D4A" },
  error: {
    backgroundColor: "#F5EBDD",
    color: "#947545",
    fontSize: 12,
    lineHeight: 20,
    padding: 13,
    borderRadius: 10,
    marginBottom: 14,
  },
  link: { fontSize: 10, color: "#738F51", marginTop: 7 },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  calendar: { flexDirection: "row", flexWrap: "wrap", padding: 10 },
  weekday: {
    width: "14.28%",
    textAlign: "center",
    paddingVertical: 12,
    color: "#869971",
    fontSize: 10,
  },
  day: {
    width: "14.28%",
    height: 51,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedDay: { backgroundColor: pancoTokens.colors.forest, borderRadius: 9 },
  categoryDot: { width: 20, height: 20, borderRadius: 6 },
  message: { fontSize: 13, color: "#526E3D", lineHeight: 22 },
  answer: {
    backgroundColor: "#EFF5E6",
    padding: 15,
    borderRadius: 10,
    marginTop: 14,
  },
  footer: {
    textAlign: "center",
    fontSize: 10,
    color: "#A4B191",
    marginTop: 28,
  },
  login: { padding: 32, paddingTop: 70 },
});
