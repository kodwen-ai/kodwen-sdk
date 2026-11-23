import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

type Seen = { url: string; method: string; body: unknown };

function capture(payload: unknown, status: number) {
  const seen: Seen[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      seen.push({
        url: url.replace(/^https:\/\/ai\.codai\.ro/, ''),
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
      });
      return new Response(JSON.stringify(payload), { status });
    }),
  );
  return seen;
}

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', baseUrl: 'https://ai.codai.ro', maxRetries: 0 });

const PROJECT_ID = '2b6d1c0e-4f3a-4b9c-8d7e-1a2b3c4d5e6f';
const TEAM = { id: 'team-1', project_id: PROJECT_ID, state: 'planning', name: 't', goal: 'g' };
const MEMBER = { id: 'm-1', team_id: 'team-1', role: 'worker', position: 1, status: 'running' };

describe('client.agentTeams', () => {
  it('creates a team under the project and returns {team, members}', async () => {
    const seen = capture({ team: TEAM, members: [MEMBER] }, 201);
    const res = await mk().agentTeams.create(PROJECT_ID, {
      name: 't',
      goal: 'g',
      workers: [{ brief: 'b', branch: undefined }],
    });
    expect(res.team.id).toBe('team-1');
    expect(seen).toEqual([
      {
        url: `/v1/projects/${PROJECT_ID}/teams`,
        method: 'POST',
        body: { name: 't', goal: 'g', workers: [{ brief: 'b' }] },
      },
    ]);
  });

  it('lists, binds, reconciles and cancels on the team routes, unwrapping each envelope', async () => {
    let seen = capture({ teams: [TEAM] }, 200);
    expect(await mk().agentTeams.list(PROJECT_ID)).toEqual([TEAM]);
    expect(seen[0]).toMatchObject({ url: `/v1/projects/${PROJECT_ID}/teams`, method: 'GET' });

    seen = capture({ member: MEMBER }, 200);
    expect(await mk().agentTeams.bindMember('team-1', 'm-1', { free_worktree: true })).toEqual(
      MEMBER,
    );
    expect(seen[0]).toEqual({
      url: '/v1/agent-teams/team-1/members/m-1',
      method: 'PATCH',
      body: { free_worktree: true },
    });

    seen = capture({ team: { ...TEAM, state: 'succeeded' } }, 200);
    expect((await mk().agentTeams.reconcile('team-1')).state).toBe('succeeded');
    expect(seen[0]).toMatchObject({ url: '/v1/agent-teams/team-1/reconcile', method: 'POST' });

    seen = capture({ team: { ...TEAM, state: 'cancelled' } }, 200);
    expect((await mk().agentTeams.cancel('team-1')).state).toBe('cancelled');
    expect(seen[0]).toMatchObject({ url: '/v1/agent-teams/team-1/cancel', method: 'POST' });
  });

  it('surfaces a 409 from reconcile as an error', async () => {
    capture({ error: { code: 'team_not_ready', message: 'pending' } }, 409);
    await expect(mk().agentTeams.reconcile('team-1')).rejects.toThrow();
  });
});
