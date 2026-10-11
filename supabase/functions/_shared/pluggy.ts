import { env, HttpError } from './http.ts';
export interface PluggyTransaction {
  id: string;
  accountId: string;
  date: string;
  amount: number | string;
  amountInAccountCurrency?: number | string | null;
  description: string;
  currencyCode: string;
  status: "PENDING" | "POSTED";
  type?: string;
  updatedAt?: string;
  merchant?: { name?: string; cnpj?: string } | null;
  paymentData?: { paymentMethod?: string } | null;
  creditCardMetadata?: {
    installmentNumber?: number;
    totalInstallments?: number;
    purchaseDate?: string;
    billId?: string;
    billForecastDate?: string;
    billClosingDate?: string;
    cardNumber?: string;
  } | null;
}
function nextTransactionPath(next: string, accountId: string): string {
  if (!next.startsWith('?') || next.includes('#'))
    throw new Error('Cursor inválido');
  const params = new URLSearchParams(next);
  if (
    params.get('accountId') !== accountId ||
    params.getAll('accountId').length !== 1 ||
    !params.get('after')
  )
    throw new Error('Cursor fora da conta');
  return '/v2/transactions' + next;
}
let cached: { key: string; expires: number } | undefined;
export class Pluggy {
  constructor(private transport: typeof fetch = fetch) {}
  private async key() {
    if (cached && cached.expires > Date.now()) return cached.key;
    const r = await this.transport('https://api.pluggy.ai/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: env('PLUGGY_CLIENT_ID'),
        clientSecret: env('PLUGGY_CLIENT_SECRET'),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new HttpError(502, 'Falha na autenticação Pluggy.');
    const data = await r.json();
    if (typeof data.apiKey !== 'string') throw new Error('Resposta auth inválida');
    cached = { key: data.apiKey, expires: Date.now() + 60 * 60 * 1000 };
    return data.apiKey;
  }
  async get<T>(path: string): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('://'))
      throw new Error('Endpoint inválido');
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await this.transport('https://api.pluggy.ai' + path, {
        headers: { 'X-API-KEY': await this.key() },
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      });
      if (r.ok) return (await r.json()) as T;
      if (r.status === 401 && attempt === 0) {
        cached = undefined;
        continue;
      }
      if (r.status === 429 || r.status >= 500) {
        const wait = Number(r.headers.get('retry-after') || 1);
        if (wait > 5) throw new HttpError(429, 'Limite Pluggy atingido; tente mais tarde.');
        await new Promise((r) => setTimeout(r, Math.max(1, wait) * 1000));
        continue;
      }
      throw new HttpError(502, `Consulta Pluggy indisponível (${r.status}).`);
    }
    throw new HttpError(503, 'Pluggy temporariamente indisponível.');
  }
  async page(accountId: string, next: string | null = null, createdAtFrom?: string) {
    const params = new URLSearchParams({ accountId });
    if (createdAtFrom) params.set('createdAtFrom', createdAtFrom);
    const path = next ? nextTransactionPath(next, accountId) : '/v2/transactions?' + params;
    const data = await this.get<{ results: PluggyTransaction[]; next: string | null }>(path);
    if (!Array.isArray(data.results) || !(data.next === null || typeof data.next === 'string'))
      throw new Error('Página Pluggy inválida');
    if (data.next) nextTransactionPath(data.next, accountId);
    if (data.results.some((t) => t.accountId !== accountId))
      throw new Error('Transação fora da conta');
    return data;
  }
  async all<T>(path: string): Promise<T[]> {
    const rows: T[] = [];
    for (let page = 1; page <= 100; page++) {
      const data = await this.get<{ results: T[]; totalPages?: number }>(
        path + (path.includes('?') ? '&' : '?') + 'page=' + page + '&pageSize=500',
      );
      if (!Array.isArray(data.results)) throw new Error('Lista inválida');
      rows.push(...data.results);
      if (page >= (data.totalPages ?? 1)) return rows;
    }
    throw new Error('Paginação excedeu limite');
  }
}
