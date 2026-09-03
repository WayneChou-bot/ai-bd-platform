/**
 * External JSON requests with the three things a bare fetch() lacks
 * (field test: discovery died with the four-word message "fetch failed"):
 *  - a timeout, so a hung upstream cannot stall a run forever;
 *  - one retry on transient network errors (reset, DNS hiccup, timeout);
 *  - an error message that names the service and the underlying cause.
 */
export class UpstreamError extends Error {
  constructor(public readonly service: string, message: string, public readonly status?: number) {
    super(`${service}: ${message}`);
    this.name = "UpstreamError";
  }
}

const causeOf = (e: unknown): string => {
  const err = e as Error & { cause?: { code?: string; message?: string } };
  const c = err?.cause;
  if (err?.name === "AbortError" || err?.name === "TimeoutError") return "timed out";
  if (c?.code) return `${c.code}${c.message ? ` — ${c.message}` : ""}`;
  return err?.message ?? String(e);
};

export async function fetchJson<T>(
  service: string,
  url: string,
  init: RequestInit = {},
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const retries = opts.retries ?? 1;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        // 5xx and 429 are worth one retry; anything else is our request's fault.
        if ((res.status >= 500 || res.status === 429) && attempt < retries) { lastErr = new UpstreamError(service, `HTTP ${res.status}`, res.status); continue; }
        throw new UpstreamError(service, `HTTP ${res.status}${body ? ` — ${body}` : ""}`, res.status);
      }
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof UpstreamError && e.status && e.status < 500 && e.status !== 429) throw e;
      lastErr = e;
      if (attempt < retries) continue;
    }
  }
  throw lastErr instanceof UpstreamError ? lastErr : new UpstreamError(service, `request failed (${causeOf(lastErr)})`);
}
