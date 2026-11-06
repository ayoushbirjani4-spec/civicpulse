/**
 * Finding the server again after the laptop running it gets a new Wi-Fi address.
 *
 * Home routers hand out addresses on one /24 network and usually give a returning machine a nearby
 * number, so the search walks outward from the old address (.6, .4, .7, .3, ...) a batch at a time.
 */

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

const PRIVATE = /^(https?):\/\/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(:\d+)?$/;

/** Other addresses on the same private /24 network, nearest first. Empty for public or named hosts. */
export function candidates(url: string): string[] {
  const m = PRIVATE.exec(url);
  if (!m) return [];
  const [, scheme, a, b, c, d, port = ''] = m;
  const isPrivate = a === '10' || (a === '172' && +b >= 16 && +b <= 31) || (a === '192' && b === '168');
  if (!isPrivate) return [];
  const last = +d;
  const order: number[] = [];
  for (let k = 1; k < 254; k++) {
    for (const n of [last + k, last - k]) {
      if (n >= 1 && n <= 254) order.push(n);
    }
  }
  return order.map((n) => `${scheme}://${a}.${b}.${c}.${n}${port}`);
}

/** True when a CivicPulse server answers /health at this address within the timeout. */
export async function isCivicPulse(url: string, fetchFn: Fetch, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const check = fetchFn(`${url}/health`, { signal: controller.signal }).then(async (r) => {
      if (!r.ok) return false;
      const body = (await r.json()) as { status?: unknown; postgis?: unknown };
      return body?.status === 'ok' && typeof body.postgis === 'string';
    }).catch(() => false);
    // Some fetch implementations ignore the abort signal, so the timeout also wins the race.
    const late = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs + 100));
    return await Promise.race([check, late]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** The nearest address on the same network where a CivicPulse server answers, or null. */
export async function discover(from: string, fetchFn: Fetch, batch = 32, timeoutMs = 1200): Promise<string | null> {
  const all = candidates(from);
  for (let i = 0; i < all.length; i += batch) {
    const group = all.slice(i, i + batch);
    const found = await Promise.all(group.map((url) => isCivicPulse(url, fetchFn, timeoutMs)));
    const hit = group.find((_, k) => found[k]);
    if (hit) return hit;
  }
  return null;
}
