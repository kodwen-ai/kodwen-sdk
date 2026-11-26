/**
 * `/v1/lanes/publish` — the dedicated-capacity SKU. A token-rate lane may be published only on capacity that is the
 * customer's own, so the shared pool — whose exclusive capacity is zero by construction — can never back a sellable
 * lane. This edge asks the codai1 pool's own guard (`deploy/codai1-pool/lane_publish.py`) and returns its verdict:
 *
 *   `POST /v1/lanes/publish` — ask the pool to publish one lane (`publish`), HTTP 200
 *
 * The pool is the authority on the price and on the capacity; the gateway only makes that decision reachable with an
 * ordinary API key.
 *
 * Status contract:
 *   - `200` — the lane is sellable. The body is the pool's quote (`sellable: true`, both prices set).
 *   - `409` `lane_not_sellable` — the pool refused the lane, or its rate is more than the exclusive capacity behind
 *     it can fund. `error.details` carries the pool's own quote (its `reason` plus the shared basis). **This stays a
 *     failure**: a refusal means the lane cannot be sold, so the call rejects — it does not resolve with a quote.
 *   - `400` — malformed request body.
 *   - `502` — the pool answered with an error (upstream failure).
 *   - `503` `lane_service_unavailable` — this gateway has no codai1 pool wired (`CODAI1_POOL_URL` / `CODAI1_POOL_KEY`
 *     unset), so it will not fabricate a quote.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Reply } from './_shared';

/** Request body of `POST /v1/lanes/publish`. */
export type LanePublishInput = Body<'publishLane'>;
/** `200` body of `POST /v1/lanes/publish`: the pool's sellable quote (`sellable: true`). */
export type LanePublishQuote = Reply<'publishLane'>;

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

export class Lanes {
  constructor(private readonly http: HttpClient) {}

  /**
   * `POST /v1/lanes/publish` (`200`) — ask the codai1 pool's guard to publish one lane. Resolves with the pool's
   * quote when the lane is sellable; **rejects** with the pool's reasoning (`409 lane_not_sellable`) when it is not,
   * because a refusal means the lane cannot be sold. `400` for a malformed body, `502` when the pool errored, `503`
   * `lane_service_unavailable` when no pool is wired on this gateway.
   */
  publish(body: LanePublishInput, opts: CallOpts = {}): Promise<LanePublishQuote> {
    return this.http.json<LanePublishQuote>('/v1/lanes/publish', {
      method: 'POST',
      body,
      ext: opts.ext,
      signal: opts.signal,
    });
  }
}
