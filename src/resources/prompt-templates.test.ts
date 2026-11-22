import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

type Seen = { url: string; method: string; body: unknown; headers: Record<string, string> };

function capture(payload: unknown, status = 200) {
  const seen: Seen[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      seen.push({
        url: url.replace(/^https:\/\/ai\.codai\.ro/, ''),
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
        headers: (init.headers ?? {}) as Record<string, string>,
      });
      return new Response(JSON.stringify(payload), { status });
    }),
  );
  return seen;
}

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', baseUrl: 'https://ai.codai.ro', maxRetries: 0 });

const TEMPLATE = {
  id: 'pt-1',
  name: 'Fix CI',
  body: 'Fix {{job}}',
  kind: 'agent_task',
  repo: null,
  branch: null,
  tags: ['ops'],
  variables: {},
  created_at: '2026-11-22T00:00:00Z',
  updated_at: '2026-11-22T00:00:00Z',
};

describe('client.promptTemplates', () => {
  it('maps every method to the gateway route', async () => {
    const seen = capture({ data: [TEMPLATE], next_cursor: null });
    const c = mk();
    await c.promptTemplates.list();
    await c.promptTemplates.list({ kind: 'session', tag: 'ops', limit: 10, cursor: 'cur-1' });
    await c.promptTemplates.create({ name: 'Fix CI', body: 'Fix {{job}}' });
    await c.promptTemplates.get('pt 1');
    await c.promptTemplates.update('pt-1', { tags: ['ops'] });
    await c.promptTemplates.delete('pt-1');
    await c.promptTemplates.instantiate('pt-1', { vars: { job: 'ci' } });
    await c.promptTemplates.instantiate('pt-1');
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      'GET /v1/prompt-templates',
      'GET /v1/prompt-templates?kind=session&tag=ops&limit=10&cursor=cur-1',
      'POST /v1/prompt-templates',
      'GET /v1/prompt-templates/pt%201',
      'PATCH /v1/prompt-templates/pt-1',
      'DELETE /v1/prompt-templates/pt-1',
      'POST /v1/prompt-templates/pt-1/instantiate',
      'POST /v1/prompt-templates/pt-1/instantiate',
    ]);
    expect(seen[2]!.body).toEqual({ name: 'Fix CI', body: 'Fix {{job}}' });
    expect(seen[4]!.body).toEqual({ tags: ['ops'] });
    expect(seen[6]!.body).toEqual({ vars: { job: 'ci' } });
    expect(seen[7]!.body).toEqual({});
  });

  it('returns the list page and the created template as-is', async () => {
    capture({ data: [TEMPLATE], next_cursor: 'cur-2' });
    await expect(mk().promptTemplates.list()).resolves.toEqual({
      data: [TEMPLATE],
      next_cursor: 'cur-2',
    });

    capture(TEMPLATE, 201);
    await expect(
      mk().promptTemplates.create({ name: 'Fix CI', body: 'Fix {{job}}' }),
    ).resolves.toEqual(TEMPLATE);
  });

  it('returns { deleted } and { prompt }, and get returns the template', async () => {
    capture({ deleted: 0 });
    await expect(mk().promptTemplates.delete('pt-1')).resolves.toEqual({ deleted: 0 });

    capture({ prompt: 'Fix ci' });
    await expect(
      mk().promptTemplates.instantiate('pt-1', { vars: { job: 'ci' } }),
    ).resolves.toEqual({ prompt: 'Fix ci' });

    capture(TEMPLATE);
    await expect(mk().promptTemplates.get('pt-1')).resolves.toEqual(TEMPLATE);
  });

  it('forwards requestId as the x-request-id header (merged with ext)', async () => {
    const seen = capture({ data: [], next_cursor: null });
    const c = mk();
    await c.promptTemplates.list({ requestId: 'req-42' });
    await c.promptTemplates.get('pt-1', { requestId: 'req-43', ext: { sessionId: 's-1' } });
    expect(seen[0]!.headers['x-request-id']).toBe('req-42');
    expect(seen[1]!.headers['x-request-id']).toBe('req-43');
    expect(seen[1]!.headers['x-codai-session-id']).toBe('s-1');
  });

  it('does not retry instantiate (same shape as prompts.instantiate)', async () => {
    const seen = capture({ error: { message: 'unavailable' } }, 503);
    const c = new Codai({ apiKey: 'sk-test', baseUrl: 'https://ai.codai.ro', maxRetries: 2 });
    await expect(c.promptTemplates.instantiate('pt-1')).rejects.toThrow();
    expect(seen).toHaveLength(1);
  });
});
