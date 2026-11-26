/**
 * `/v1/prompt-templates/*` — named, reusable prompt templates: save a prompt once, then expand its `{{var}}`
 * placeholders anywhere with `POST /v1/prompt-templates/{id}/instantiate`. Each template carries a `kind`, an
 * optional `repo`/`branch` hint, free-form `tags` and default `variables`; names are unique per account and every
 * route only ever sees your own templates.
 */
import { type CodaiRequestExtensions, type HttpClient } from '../http';
import { type Body, type Mutable, type QueryOf, type Reply, type Schema } from './_shared';

/** One stored template: name, body, `kind`, optional repo/branch hints, tags and default `variables`. */
export type PromptTemplate = Schema<'PromptTemplate'>;
/** What a template is meant for: `agent_task` (the default), `session` or `generic`. */
export type PromptTemplateKind = PromptTemplate['kind'];
/** Body of `POST /v1/prompt-templates` (`name` + `body` required). */
export type PromptTemplateCreate = Mutable<Body<'createPromptTemplate'>>;
/** Body of `PATCH /v1/prompt-templates/{id}` — any subset of the fields, at least one. */
export type PromptTemplatePatch = Mutable<Body<'updatePromptTemplate'>>;
/** Body of `POST /v1/prompt-templates/{id}/instantiate` — `{{name}}` values that win over the template defaults. */
export type PromptTemplateInstantiate = Mutable<Body<'instantiatePromptTemplate'>>;
/** One page of your templates, newest first (`GET /v1/prompt-templates`). */
export type PromptTemplateList = Reply<'listPromptTemplates'>;
/** Reply of `POST /v1/prompt-templates` (`201`): the stored template. */
export type PromptTemplateCreated = Reply<'createPromptTemplate', 201>;
/** Reply of `DELETE /v1/prompt-templates/{id}`: `{ deleted: 0 | 1 }` — unknown or foreign ids are not an error. */
export type PromptTemplateDeleted = Reply<'deletePromptTemplate'>;
/** Reply of `POST /v1/prompt-templates/{id}/instantiate`: `{ prompt }` with every placeholder that had a value filled in. */
export type PromptTemplateInstantiation = Reply<'instantiatePromptTemplate'>;

/** Filters of `GET /v1/prompt-templates`: `kind` and `tag` combine with AND; `limit` + `cursor` keyset-page. */
export type PromptTemplateListQuery = Mutable<QueryOf<'listPromptTemplates'>>;

/** Per-call options shared by every `promptTemplates` method. */
export interface PromptTemplatesOptions {
  /** Correlation id forwarded as the `x-request-id` header (the gateway echoes it back as `x-codai-trace-id`). */
  requestId?: string;
  /** Extra `x-codai-*` extension headers; `requestId` wins when both set the id. */
  ext?: CodaiRequestExtensions;
  /** Abort signal for this call. */
  signal?: AbortSignal;
}

/** Options of {@link PromptTemplates.list}: the query filters plus the per-call options. */
export type PromptTemplateListOptions = PromptTemplateListQuery & PromptTemplatesOptions;

/** Fold `requestId` into the `x-codai-*` extension bag (`requestId` wins over a same-named `ext` key). */
function extOf(opts: PromptTemplatesOptions): CodaiRequestExtensions | undefined {
  if (!opts.ext && !opts.requestId) return undefined;
  return { ...opts.ext, ...(opts.requestId ? { requestId: opts.requestId } : {}) };
}

const one = (id: string, suffix = ''): string =>
  `/v1/prompt-templates/${encodeURIComponent(id)}${suffix}`;

export class PromptTemplates {
  constructor(private readonly http: HttpClient) {}

  /**
   * `GET /v1/prompt-templates` — your templates, newest first; `kind` and `tag` combine with AND.
   * Example: `await client.promptTemplates.list({ kind: 'agent_task', limit: 20 })`.
   */
  list(options: PromptTemplateListOptions = {}): Promise<PromptTemplateList> {
    return this.http.json<PromptTemplateList>('/v1/prompt-templates', {
      query: {
        kind: options.kind,
        tag: options.tag,
        limit: options.limit,
        cursor: options.cursor,
      },
      ext: extOf(options),
      signal: options.signal,
    });
  }

  /**
   * `POST /v1/prompt-templates` (`201`) — saves a named prompt; reusing a name is `409 prompt_template_name_taken`.
   * Example: `await client.promptTemplates.create({ name: 'Fix CI', body: 'Fix {{job}}' })`.
   */
  create(
    body: PromptTemplateCreate,
    options: PromptTemplatesOptions = {},
  ): Promise<PromptTemplateCreated> {
    return this.http.json<PromptTemplateCreated>('/v1/prompt-templates', {
      method: 'POST',
      body,
      ext: extOf(options),
      signal: options.signal,
    });
  }

  /**
   * `GET /v1/prompt-templates/{id}` — full body and default variables; a foreign or malformed id is `404`.
   * Example: `await client.promptTemplates.get(id)`.
   */
  get(id: string, options: PromptTemplatesOptions = {}): Promise<PromptTemplate> {
    return this.http.json<PromptTemplate>(one(id), {
      ext: extOf(options),
      signal: options.signal,
    });
  }

  /**
   * `PATCH /v1/prompt-templates/{id}` — any subset of the fields (at least one); renaming onto a used name is `409`.
   * Example: `await client.promptTemplates.update(id, { tags: ['ops'] })`.
   */
  update(
    id: string,
    body: PromptTemplatePatch,
    options: PromptTemplatesOptions = {},
  ): Promise<PromptTemplate> {
    return this.http.json<PromptTemplate>(one(id), {
      method: 'PATCH',
      body,
      ext: extOf(options),
      signal: options.signal,
    });
  }

  /**
   * `DELETE /v1/prompt-templates/{id}` — unknown, malformed or foreign ids are not an error: `{ deleted: 0 }`.
   * Example: `await client.promptTemplates.delete(id)`.
   */
  delete(id: string, options: PromptTemplatesOptions = {}): Promise<PromptTemplateDeleted> {
    return this.http.json<PromptTemplateDeleted>(one(id), {
      method: 'DELETE',
      ext: extOf(options),
      signal: options.signal,
    });
  }

  /**
   * `POST /v1/prompt-templates/{id}/instantiate` — fills every `{{name}}` from `vars`, then the template's own
   * defaults; a placeholder with no value is left exactly as written. Never retried.
   * Example: `await client.promptTemplates.instantiate(id, { vars: { job: 'ci' } })`.
   */
  instantiate(
    id: string,
    body: PromptTemplateInstantiate = {},
    options: PromptTemplatesOptions = {},
  ): Promise<PromptTemplateInstantiation> {
    return this.http.json<PromptTemplateInstantiation>(one(id, '/instantiate'), {
      method: 'POST',
      body,
      ext: extOf(options),
      signal: options.signal,
      noRetry: true,
    });
  }
}
