/**
 * `/v1/platform/projects/*` — the project-health registry: one place that says whether
 * every Codwen project is up, what was measured and what is broken. Read-only, and the
 * only surface that needs a key scoped `projects:read`.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Reply } from './_shared';

type CallOpts = { ext?: CodaiRequestExtensions; signal?: AbortSignal };

/** The gateway reads anything but `resolved`/`all` as `open`, so an odd value cannot widen the query. */
export type IncidentFilter = 'open' | 'resolved' | 'all';

export class PlatformProjects {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/platform/projects` — the public projects plus the ones you own, with their roll-up. */
  list(opts: CallOpts = {}): Promise<Reply<'listPlatformProjects'>> {
    return this.http.json<Reply<'listPlatformProjects'>>('/v1/platform/projects', {
      ext: opts.ext,
      signal: opts.signal,
    });
  }

  /** `GET /v1/platform/projects/{id}` — one project with its components; 404 when it is not yours to see. */
  get(idOrSlug: string, opts: CallOpts = {}): Promise<Reply<'getPlatformProject'>> {
    return this.http.json<Reply<'getPlatformProject'>>(
      `/v1/platform/projects/${encodeURIComponent(idOrSlug)}`,
      { ext: opts.ext, signal: opts.signal },
    );
  }

  /** `GET /v1/platform/projects/{id}/status` — the roll-up a monitor polls, with `checked_at` per component. */
  status(idOrSlug: string, opts: CallOpts = {}): Promise<Reply<'getPlatformProjectStatus'>> {
    return this.http.json<Reply<'getPlatformProjectStatus'>>(
      `/v1/platform/projects/${encodeURIComponent(idOrSlug)}/status`,
      { ext: opts.ext, signal: opts.signal },
    );
  }

  /** `GET /v1/platform/projects/{id}/incidents` — the open incidents unless asked otherwise. */
  incidents(
    idOrSlug: string,
    query: { status?: IncidentFilter } = {},
    opts: CallOpts = {},
  ): Promise<Reply<'listPlatformProjectIncidents'>> {
    return this.http.json<Reply<'listPlatformProjectIncidents'>>(
      `/v1/platform/projects/${encodeURIComponent(idOrSlug)}/incidents`,
      { query: { status: query.status }, ext: opts.ext, signal: opts.signal },
    );
  }
}
