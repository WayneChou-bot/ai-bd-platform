/**
 * Safe fetching of public pages for the Research Agent (§43 URL validation).
 * Only http(s), no private/loopback hosts, bounded size and time, HTML → text.
 */
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

const PRIVATE_RE = /^(localhost|.*\.local|.*\.internal)$/i;

/** Private/loopback/link-local check for a resolved or literal IP —
 *  IPv4-mapped IPv6 (::ffff:127.0.0.1) is unwrapped first (review v6 F09). */
export function ipIsPrivate(addr: string): boolean {
  let host = addr.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) host = mapped[1];
  // URL() normalizes the dotted mapped form to hex (::ffff:7f00:1) — unwrap that too.
  const hexMapped = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16), lo = parseInt(hexMapped[2], 16);
    host = `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  const ipv = isIP(host);
  if (ipv === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (ipv === 6) return host === "::1" || host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80");
  return false;
}

export function validatePublicUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error(`Invalid URL: ${raw}`); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`Unsupported protocol: ${u.protocol}`);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (PRIVATE_RE.test(host)) throw new Error(`Blocked host: ${host}`);
  if (isIP(host) || host.startsWith("::")) {
    if (ipIsPrivate(host)) throw new Error(`Blocked private address: ${host}`);
  }
  return u;
}

/** Resolve a hostname and reject if ANY address is private (review v6 F09).
 *  Literal IPs were already checked by validatePublicUrl. */
export async function assertResolvesPublic(u: URL, doLookup: typeof lookup = lookup): Promise<void> {
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return;
  let addrs;
  try { addrs = await doLookup(host, { all: true }); }
  catch (e) { throw new Error(`DNS lookup failed for ${host}: ${(e as Error).message}`); }
  for (const a of addrs) {
    if (ipIsPrivate(a.address)) throw new Error(`Blocked: ${host} resolves to private address ${a.address}`);
  }
}

export function htmlToText(html: string, max = 12_000): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n+/g, "\n")
    .trim();
  return text.length > max ? text.slice(0, max) + "\n…[truncated]" : text;
}

export interface FetchedPage { url: string; type: string; content: string; status: number }

const MAX_BYTES = 512_000;
const MAX_REDIRECTS = 3;

/** Read at most MAX_BYTES from a response, aborting the transfer beyond that
 *  (review v6 F09: response.text() downloaded everything before truncating). */
async function readCapped(res: Response, ctrl: AbortController): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      chunks.push(value.slice(0, value.byteLength - (total - MAX_BYTES)));
      ctrl.abort(); // stop the transfer, keep what we have
      break;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let off = 0; for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

export async function fetchPublicPage(
  raw: string, type = "company_page", timeoutMs = 8000,
  deps: { doLookup?: typeof lookup } = {},
): Promise<FetchedPage> {
  // Redirects are followed MANUALLY so every hop is re-validated — an allowed
  // start URL redirecting into a private network is the classic SSRF bypass
  // (review v6 F09 / OWASP SSRF guidance).
  let u = validatePublicUrl(raw);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    for (let hop = 0; ; hop++) {
      await assertResolvesPublic(u, deps.doLookup);
      const res = await fetch(u, { signal: ctrl.signal, redirect: "manual", headers: { "User-Agent": "ai-bd-platform-research/0.2 (+public page research)", Accept: "text/html,text/plain" } });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { url: u.toString(), type, content: "", status: res.status };
        if (hop >= MAX_REDIRECTS) throw new Error(`Too many redirects fetching ${raw}`);
        u = validatePublicUrl(new URL(loc, u).toString());
        continue;
      }
      const ct = res.headers.get("content-type") ?? "";
      if (ct && !/text\/|json|xml|xhtml/.test(ct)) return { url: u.toString(), type, content: `[unsupported content-type: ${ct.split(";")[0]}]`, status: res.status };
      const text = await readCapped(res, ctrl);
      const body = ct.includes("json") ? (text.length > 12_000 ? text.slice(0, 12_000) + "\n…[truncated]" : text) : htmlToText(text);
      return { url: u.toString(), type, content: body, status: res.status };
    }
  } finally {
    clearTimeout(t);
  }
}
