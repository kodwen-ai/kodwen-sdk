import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

type Seen = { url: string; method: string; body: unknown; headers: Record<string, string> };

function capture(payload: unknown, status: number) {
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

const PROJECT_ID = '2b6d1c0e-4f3a-4b9c-8d7e-1a2b3c4d5e6f';

const TICKET = {
  id: 41,
  projectId: PROJECT_ID,
  resource: 'build:codai',
  lane: 'gate',
  priority: 0,
  capacity: 1,
  purpose: '',
  cmd: '',
  session: '',
  holder: '',
  state: 'queued',
  enqueuedAt: '2026-11-22T09:00:00Z',
  claimedAt: null,
  beatAt: null,
  finishedAt: null,
};

describe('client.coordination (agentq queue)', () => {
  it('POSTs the enqueue body to /v1/agentq/queue and returns the 201 body as-is', async () => {
    const payload = {
      ok: true,
      ticket: TICKET,
      admitted: true,
      holders: 0,
      capacity: 1,
      waiting: 1,
    };
    const seen = capture(payload, 201);
    const res = await mk().coordination.enqueue({
      project_id: PROJECT_ID,
      resource: 'build:codai',
      lane: 'heavy',
      priority: 5,
      capacity: 2,
      purpose: 'why',
      cmd: 'pnpm build',
      session: 's-1',
      holder: 'desk-7',
    });
    expect(res).toEqual(payload);
    expect(seen).toEqual([
      {
        url: '/v1/agentq/queue',
        method: 'POST',
        body: {
          project_id: PROJECT_ID,
          resource: 'build:codai',
          lane: 'heavy',
          priority: 5,
          capacity: 2,
          purpose: 'why',
          cmd: 'pnpm build',
          session: 's-1',
          holder: 'desk-7',
        },
        headers: expect.any(Object),
      },
    ]);
  });

  it('POSTs the claim body to /v1/agentq/claim and returns the 200 body, including the polling answer', async () => {
    const empty = { ok: true, claimed: false, ticket: null, holders: 1, capacity: 1, waiting: 0 };
    const seen = capture(empty, 200);
    const res = await mk().coordination.claim({
      project_id: PROJECT_ID,
      resource: 'build:codai',
      holder: 'desk-7',
      session: 's-1',
    });
    expect(res).toEqual(empty);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe('/v1/agentq/claim');
    expect(seen[0]!.method).toBe('POST');
    expect(seen[0]!.body).toEqual({
      project_id: PROJECT_ID,
      resource: 'build:codai',
      holder: 'desk-7',
      session: 's-1',
    });

    const claimed = {
      ok: true,
      claimed: true,
      ticket: TICKET,
      holders: 1,
      capacity: 1,
      waiting: 0,
    };
    capture(claimed, 200);
    await expect(
      mk().coordination.claim({
        project_id: PROJECT_ID,
        resource: 'build:codai',
        holder: 'desk-7',
      }),
    ).resolves.toEqual(claimed);
  });

  it('strips optional fields left undefined and keeps the required ones', async () => {
    const seen = capture(
      { ok: true, ticket: TICKET, admitted: false, holders: 1, capacity: 1, waiting: 2 },
      201,
    );
    await mk().coordination.enqueue({
      project_id: PROJECT_ID,
      resource: 'deploy:gateway',
      lane: undefined,
      priority: undefined,
      capacity: undefined,
      purpose: undefined,
      cmd: undefined,
      session: undefined,
      holder: undefined,
    });
    await mk().coordination.claim({
      project_id: PROJECT_ID,
      resource: 'deploy:gateway',
      holder: 'desk-7',
      session: undefined,
    });
    expect(seen[0]!.body).toEqual({ project_id: PROJECT_ID, resource: 'deploy:gateway' });
    expect(seen[1]!.body).toEqual({
      project_id: PROJECT_ID,
      resource: 'deploy:gateway',
      holder: 'desk-7',
    });
  });

  it('forwards the ext bag as x-codai-* headers', async () => {
    const seen = capture(
      { ok: true, ticket: TICKET, admitted: false, holders: 0, capacity: 1, waiting: 1 },
      201,
    );
    await mk().coordination.enqueue(
      { project_id: PROJECT_ID, resource: 'build:codai' },
      { ext: { sessionId: 's-1', requestId: 'req-42' } },
    );
    expect(seen[0]!.headers['x-codai-session-id']).toBe('s-1');
    expect(seen[0]!.headers['x-request-id']).toBe('req-42');
  });

  it('POSTs the heartbeat body to /v1/agentq/heartbeat and returns the 200 body, including the no-op answer', async () => {
    const beaten = { ok: true, beaten: true, ticket: { ...TICKET, state: 'claimed' } };
    const seen = capture(beaten, 200);
    const res = await mk().coordination.heartbeat({
      project_id: PROJECT_ID,
      resource: 'build:codai',
      ticket_id: 41,
      holder: 'desk-7',
    });
    expect(res).toEqual(beaten);
    expect(seen).toEqual([
      {
        url: '/v1/agentq/heartbeat',
        method: 'POST',
        body: { project_id: PROJECT_ID, resource: 'build:codai', ticket_id: 41, holder: 'desk-7' },
        headers: expect.any(Object),
      },
    ]);
  });

  it('carries the no-op answer of a heartbeat (beaten false, ticket null) as a plain 200 body', async () => {
    const noop = { ok: true, beaten: false, ticket: null };
    capture(noop, 200);
    await expect(
      mk().coordination.heartbeat({
        project_id: PROJECT_ID,
        resource: 'build:codai',
        ticket_id: 99,
        holder: 'ghost',
      }),
    ).resolves.toEqual(noop);
  });

  it('POSTs the release body to /v1/agentq/release and omits an unset outcome', async () => {
    const released = {
      ok: true,
      released: true,
      ticket: { ...TICKET, state: 'done' },
      holders: 0,
      capacity: 1,
      waiting: 0,
    };
    const seen = capture(released, 200);
    await mk().coordination.release({
      project_id: PROJECT_ID,
      resource: 'build:codai',
      ticket_id: 41,
      holder: 'desk-7',
    });
    await mk().coordination.release({
      project_id: PROJECT_ID,
      resource: 'build:codai',
      ticket_id: 41,
      holder: 'desk-7',
      outcome: 'cancelled',
    });
    expect(seen[0]!.url).toBe('/v1/agentq/release');
    expect(seen[0]!.body).toEqual({
      project_id: PROJECT_ID,
      resource: 'build:codai',
      ticket_id: 41,
      holder: 'desk-7',
    });
    expect(seen[1]!.body).toEqual({
      project_id: PROJECT_ID,
      resource: 'build:codai',
      ticket_id: 41,
      holder: 'desk-7',
      outcome: 'cancelled',
    });
  });
});
