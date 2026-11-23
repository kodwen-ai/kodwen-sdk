/**
 * Durable agent teams per project (DSC-0066): one planner + N workers, each with its own worktree.
 *
 *   `GET   /v1/projects/{id}/teams`                    — `list`
 *   `POST  /v1/projects/{id}/teams`                    — `create` (HTTP 201)
 *   `GET   /v1/agent-teams/{teamId}`                   — `get`
 *   `PATCH /v1/agent-teams/{teamId}/members/{memberId}` — `bindMember`
 *   `POST  /v1/agent-teams/{teamId}/reconcile`         — `reconcile` (409 while a worker is not terminal)
 *   `POST  /v1/agent-teams/{teamId}/cancel`            — `cancel` (409 once the team has settled)
 *
 * A team is a registry, not a second agent loop: creating one runs nothing. Bind each member to the cloud session
 * and environment task that executes it, then `reconcile` once every worker is terminal. A project the caller
 * cannot see is `404`, never `403`.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type Reply, stripUndefined } from './_shared';

/** `{ name, goal, environment_id?, workers: [{ brief, branch? }] }` — 1..N workers. */
export type AgentTeamCreateBody = Mutable<Body<'createAgentTeam'>>;
/** `{ status?, session_id?, environment_task_id?, branch?, summary?, free_worktree? }`. */
export type AgentTeamMemberBindBody = Mutable<Body<'bindAgentTeamMember'>>;
/** `{ team, members }` — `members[0]` is the planner, workers are positions 1..N. */
export type AgentTeamWithMembers = Reply<'getAgentTeam', 200>;
export type AgentTeam = AgentTeamWithMembers['team'];
export type AgentTeamMember = AgentTeamWithMembers['members'][number];

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

const seg = encodeURIComponent;

export class AgentTeams {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/projects/{id}/teams` — the project's teams (any project member). */
  async list(projectId: string, opts: CallOpts = {}): Promise<AgentTeam[]> {
    const r = await this.http.json<{ teams: AgentTeam[] }>(`/v1/projects/${seg(projectId)}/teams`, {
      ext: opts.ext,
      signal: opts.signal,
    });
    return r.teams;
  }

  /** `POST /v1/projects/{id}/teams` (`201`) — write the decomposition; nothing runs yet. Owner or org admin. */
  create(
    projectId: string,
    body: AgentTeamCreateBody,
    opts: CallOpts = {},
  ): Promise<AgentTeamWithMembers> {
    return this.http.json<AgentTeamWithMembers>(`/v1/projects/${seg(projectId)}/teams`, {
      method: 'POST',
      body: stripUndefined(body),
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/agent-teams/{teamId}` — one team with its members. */
  get(teamId: string, opts: CallOpts = {}): Promise<AgentTeamWithMembers> {
    return this.http.json<AgentTeamWithMembers>(`/v1/agent-teams/${seg(teamId)}`, {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `PATCH /v1/agent-teams/{teamId}/members/{memberId}` — bind a member to its session, task, branch or result.
   * `free_worktree: true` releases the member's worktree so another worker can take the slot.
   */
  async bindMember(
    teamId: string,
    memberId: string,
    body: AgentTeamMemberBindBody,
    opts: CallOpts = {},
  ): Promise<AgentTeamMember> {
    const r = await this.http.json<{ member: AgentTeamMember }>(
      `/v1/agent-teams/${seg(teamId)}/members/${seg(memberId)}`,
      { method: 'PATCH', body: stripUndefined(body), ext: opts.ext, signal: opts.signal },
    );
    return r.member;
  }

  /** `POST /v1/agent-teams/{teamId}/reconcile` — fold the workers' results; `409` while any worker is pending. */
  async reconcile(teamId: string, opts: CallOpts = {}): Promise<AgentTeam> {
    const r = await this.http.json<{ team: AgentTeam }>(
      `/v1/agent-teams/${seg(teamId)}/reconcile`,
      { method: 'POST', ext: opts.ext, signal: opts.signal },
    );
    return r.team;
  }

  /** `POST /v1/agent-teams/{teamId}/cancel` — cancel a planning or running team; `409` once it has settled. */
  async cancel(teamId: string, opts: CallOpts = {}): Promise<AgentTeam> {
    const r = await this.http.json<{ team: AgentTeam }>(`/v1/agent-teams/${seg(teamId)}/cancel`, {
      method: 'POST',
      ext: opts.ext,
      signal: opts.signal,
    });
    return r.team;
  }
}
