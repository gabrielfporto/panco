import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pluggy } from '../supabase/functions/_shared/pluggy.ts';
Object.assign(globalThis, {
  Deno: {
    env: { get: (k: string) => ({ PLUGGY_CLIENT_ID: 'test', PLUGGY_CLIENT_SECRET: 'test' })[k] },
  },
});
test('cliente usa next/after real e não perde filtros na segunda página', async () => {
  const paths: string[] = [];
  const transport: typeof fetch = async (input) => {
    const url = String(input);
    paths.push(url);
    if (url.endsWith('/auth')) return Response.json({ apiKey: 'fake' });
    return Response.json({
      results: [],
      next:
        paths.length === 2
          ? '?accountId=acc&createdAtFrom=2026-01-01T00%3A00%3A00Z&after=abc%2B%3D'
          : null,
    });
  };
  const api = new Pluggy(transport),
    first = await api.page('acc', null, '2026-01-01T00:00:00Z');
  await api.page('acc', first.next);
  assert.equal(
    paths[2],
    'https://api.pluggy.ai/v2/transactions?accountId=acc&createdAtFrom=2026-01-01T00%3A00%3A00Z&after=abc%2B%3D',
  );
});
test('cliente rejeita URL externa antes de enviar credencial', async () => {
  let called = false;
  const api = new Pluggy(async () => {
    called = true;
    return Response.json({});
  });
  await assert.rejects(api.get('https://malicious.example'));
  assert.equal(called, false);
});
test('cliente valida conta de todos os registros da página', async () => {
  const api = new Pluggy(async (input) =>
    String(input).endsWith('/auth')
      ? Response.json({ apiKey: 'fake' })
      : Response.json({ results: [{ accountId: 'other' }], next: null }),
  );
  await assert.rejects(api.page('acc'), /fora da conta/);
});
