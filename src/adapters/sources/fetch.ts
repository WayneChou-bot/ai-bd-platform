/**
 * Safe fetching of public pages for the Research Agent (§43 URL validation).
 * Only http(s), no private/loopback hosts, bounded size and time, HTML → text.
 */
import { isIP } from "node:net";

const PRIVATE_RE = /^(localhost|.*\.local|.*\.internal)$/i;

export function validatePublicUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error(`Invalid URL: ${raw}`); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`Unsupported protocol: ${u.protocol}`);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (PRIVATE_RE.test(host)) throw new Error(`Blocked host: ${host}`);
  const ipv = isIP(host);
  if (ipv === 4) {
    const [a, b] = host.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) throw new Error(`Blocked private address: ${host}`);
  }
  if (ipv === 6 && (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80"))) throw new Error(`Blocked private address: ${host}`);
  return u;
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

export async function fetchPublicPage(raw: string, type = "company_page", timeoutMs = 8000): Promise<FetchedPage> {
  const u = validatePublicUrl(raw);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(u, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": "ai-bd-platform-research/0.2 (+public page research)", Accept: "text/html,text/plain" } });
    const ct = res.headers.get("content-type") ?? "";
    const body = ct.includes("json") ? await res.text() : htmlToText(await res.text());
    return { url: u.toString(), type, content: body, status: res.status };
  } finally {
    clearTimeout(t);
  }
}
