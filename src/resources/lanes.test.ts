import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai, CodaiError } from '../index';

type Seen = { url: string; method: string; body: unknown };

function capture(payload: unknown, status: number) {
  const seen: Seen[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      seen.push({
        url,
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
      });
      return new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return seen;
}

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', baseUrl: 'https://ai.codai.ro', maxRetries: 0 });

const REQUEST = {
  backing: 'dedicated',
  lane_tokens_s: '42000',
  margin: '0.35',
  node_hourly_usd: '2.48',
  nodes: 8,
} as const;

const QUOTE = {
  backing: 'dedicated',
  exclusive_capacity_tokens_s: '336000',
  lane_tokens_s: '42000',
  nodes: 8,
  price_per_1m_output_eur: '1.20',
  price_per_hour_eur: '8.40',
  reason: 'exclusive_capacity_funded',
  safety_factor: '1.15',
  sellable: true,
  shared_pool_basis_tokens_s: '120000',
};

describe('client.lanes (dedicated-capacity SKU)', () => {
  it('POSTs the body to /v1/lanes/publish and resolves with the sellable quote', async () => {
    const seen = capture(QUOTE, 200);
    const res = await mk().lanes.publish(REQUEST);
    expect(res).toEqual(QUOTE);
    expect(seen).toEqual([
      { url: 'https://ai.codai.ro/v1/lanes/publish', method: 'POST', body: REQUEST },
    ]);
  });

  it('forwards the JSON body unchanged', async () => {
    const seen = capture(QUOTE, 200);
    const body = { ...REQUEST, overhead: '0.10', safety_factor: '1.2', eur_per_usd: '0.92' };
    await mk().lanes.publish(body);
    expect(seen[0]?.body).toEqual(body);
  });

  it('rejects with CodaiError on 409 lane_not_sellable (a refusal must not resolve)', async () => {
    const seen = capture(
      {
        error: {
          message: 'lane_not_sellable',
          type: 'invalid_request_error',
          code: 'lane_not_sellable',
          details: { ...QUOTE, sellable: false, reason: 'insufficient_exclusive_capacity' },
        },
      },
      409,
    );
    await expect(mk().lanes.publish({ ...REQUEST, backing: 'shared' })).rejects.toBeInstanceOf(
      CodaiError,
    );
    expect(seen[0]?.method).toBe('POST');
    expect(seen[0]?.url).toBe('https://ai.codai.ro/v1/lanes/publish');
  });
});
