/**
 * Project-scoped coordination queue (agentq) — the server-authoritative counterpart of the local `agentq`
 * coordinator on an operator machine. A ticket names one contended resource (`build:codai`, `deploy:gateway`, …)
 * inside a project, and a caller claims the head of that queue when a slot is free.
 *
 *   `POST /v1/agentq/queue` — enqueue one ticket (`enqueue`), HTTP 201
 *   `POST /v1/agentq/claim` — admit a holder to the head (`claim`), HTTP 200 (also when nothing can be claimed)
 *
 * Ordering is `priority` descending, then `enqueued_at` ascending, then ticket id. Both routes are scoped to a
 * single project: a project the caller cannot see is answered `404` (never `403`), so an id you do not own is
 * indistinguishable from one that does not exist.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type Reply, stripUndefined } from './_shared';

/**
 * `{ project_id, resource, lane?, priority?, capacity?, purpose?, cmd?, session?, holder? }` — `project_id` and a
 * non-empty `resource` are required; `lane` defaults to `gate`, `priority` to `0`, `capacity` to `1`.
 */
export type AgentqEnqueueBody = Mutable<Body<'enqueueAgentqTicket'>>;
/** `{ project_id, resource, holder, session? }` — `holder` names whoever is claiming, so a stale claim is attributable. */
export type AgentqClaimBody = Mutable<Body<'claimAgentqTicket'>>;
/** One stored ticket (`state` is `queued` until it is claimed). */
export type AgentqTicket = Reply<'enqueueAgentqTicket', 201>['ticket'];
/** `{ ok: true, ticket, admitted, holders, capacity, waiting }` (HTTP 201). */
export type AgentqEnqueueResult = Reply<'enqueueAgentqTicket', 201>;
/**
 * `{ ok: true, claimed, ticket, holders, capacity, waiting }` (HTTP 200). `claimed: false` with `ticket: null` is the
 * polling answer (queue empty or every slot taken), not an error.
 */
export type AgentqClaimResult = Reply<'claimAgentqTicket', 200>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export class Coordination {
  constructor(private readonly http: HttpClient) {}

  /**
   * `POST /v1/agentq/queue` (`201`) — add one ticket for `resource` to the project's queue and answer with the stored
   * ticket plus the current depth. `admitted: true` means the ticket is the queue head and a slot is free, so the work
   * can start immediately; otherwise poll {@link claim}. `capacity` is how many holders the resource admits at once and
   * the effective value is the maximum over its live tickets. A project the caller cannot see is `404`.
   */
  enqueue(body: AgentqEnqueueBody, opts: CallOpts = {}): Promise<AgentqEnqueueResult> {
    return this.http.json<AgentqEnqueueResult>('/v1/agentq/queue', {
      method: 'POST',
      body: stripUndefined(body),
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /**
   * `POST /v1/agentq/claim` (`200`) — admit `holder` to `resource` when fewer than its capacity of tickets are already
   * held. Only the head of the queue can be taken, so a low priority ticket never overtakes a higher one, and the whole
   * read-decide-write runs inside one transaction locked to `(project, resource)`, so two concurrent callers never
   * receive the same slot. `claimed: false` with `ticket: null` means there was nothing to claim — poll again rather
   * than treat it as an error. A project the caller cannot see is `404`.
   */
  claim(body: AgentqClaimBody, opts: CallOpts = {}): Promise<AgentqClaimResult> {
    return this.http.json<AgentqClaimResult>('/v1/agentq/claim', {
      method: 'POST',
      body: stripUndefined(body),
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}
