import { createClient } from "@supabase/supabase-js";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export class DatabaseError extends Error {
  constructor(public code: string) {
    super("Falha no banco de dados.");
  }
}
export async function syncStage<T>(stage: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const code = error instanceof DatabaseError ? error.code : "INTERNAL";
    console.error("panco_sync_failed", JSON.stringify({ stage, code }));
    throw new HttpError(500, `Falha em ${stage} (${code}). Os dados já importados foram preservados.`);
  }
}
export function env(key: string) {
  const value = Deno.env.get(key);
  if (!value) throw new HttpError(503, `Configuração ausente: ${key}`);
  return value;
}
export const ownerId = () => {
  const id = Deno.env.get("PANCO_OWNER_ID") || Deno.env.get("AURO_OWNER_ID");
  if (!id)
    throw new HttpError(
      503,
      "Configure PANCO_OWNER_ID no Supabase com o UUID do seu cadastro.",
    );
  return id;
};
export const admin = () =>
  createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
export function check<T>(result: {
  data: T;
  error: { message: string; code?: string } | null;
}): T {
  if (result.error) throw new DatabaseError(
    /^[A-Z0-9]{5,12}$/.test(result.error.code || "") ? result.error.code! : "DATABASE",
  );
  return result.data;
}
export async function owner(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    throw new HttpError(401, "Faça login.");
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Sessão inválida.");
  if (!data.user.email_confirmed_at)
    throw new HttpError(403, "Confirme seu e-mail antes de conectar contas.");
  if (data.user.id !== ownerId())
    throw new HttpError(403, "Acesso restrito ao proprietário.");
  return { client, user: data.user };
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 250_000) throw new HttpError(413, "Payload muito grande.");
  try {
    const b = JSON.parse(text);
    if (!b || typeof b !== "object" || Array.isArray(b)) throw 0;
    return b;
  } catch {
    throw new HttpError(400, "JSON inválido.");
  }
}
export function handler(run: (r: Request) => Promise<unknown>) {
  return async (request: Request) => {
    const origin = request.headers.get("origin");
    const allowed = (Deno.env.get("ALLOWED_ORIGINS") || "")
      .split(",")
      .map((s) => s.trim());
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Vary: "Origin",
      "Cache-Control": "no-store",
    };
    if (origin && allowed.includes(origin))
      headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] =
      "authorization, apikey, content-type, x-client-info";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    if (origin && !allowed.includes(origin))
      return new Response(JSON.stringify({ error: "Origem não permitida" }), {
        status: 403,
        headers,
      });
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST")
      return new Response(JSON.stringify({ error: "Use POST" }), {
        status: 405,
        headers,
      });
    try {
      return new Response(JSON.stringify(await run(request)), { headers });
    } catch (e) {
      const known = e instanceof HttpError;
      console.error("panco_request_failed", known ? e.status : "internal");
      return new Response(
        JSON.stringify({
          error: known
            ? e.message
            : "Não foi possível concluir. Tente novamente.",
        }),
        { status: known ? e.status : 500, headers },
      );
    }
  };
}
export async function secretEqual(a: string, b: string) {
  const digest = async (s: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    );
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

