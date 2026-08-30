/** Minimal RFC 5322 builder + parser helpers for the Gmail adapter. */

export function base64url(s: string | Buffer): string {
  return Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function fromBase64url(s: string): string {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

/** RFC 2047 encode a header value when it contains non-ASCII (e.g. Chinese subject). */
export function encodeHeader(v: string): string {
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

export function buildMessage(opts: { from: string; to: string; subject: string; text: string; replyTo?: string; headers?: Record<string, string> }): string {
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    opts.replyTo ? `Reply-To: ${opts.replyTo}` : null,
    `Subject: ${encodeHeader(opts.subject)}`,
    ...Object.entries(opts.headers ?? {}).map(([k, v]) => `${k}: ${v}`),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(opts.text, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n"),
  ].filter((l): l is string => l !== null);
  return lines.join("\r\n");
}

export interface GmailPart { mimeType?: string; body?: { data?: string; size?: number }; parts?: GmailPart[] }
export interface GmailMessage {
  id: string; threadId: string; snippet?: string; internalDate?: string;
  payload?: { headers?: Array<{ name: string; value: string }>; mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };
}

export function header(m: GmailMessage, name: string): string {
  return m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** Prefer text/plain; fall back to stripped text/html; then snippet. */
export function bodyText(m: GmailMessage): string {
  const walk = (p: GmailPart | undefined, want: string): string | undefined => {
    if (!p) return undefined;
    if (p.mimeType === want && p.body?.data) return fromBase64url(p.body.data);
    for (const c of p.parts ?? []) { const r = walk(c, want); if (r) return r; }
    return undefined;
  };
  const plain = walk(m.payload, "text/plain");
  if (plain) return stripQuoted(plain);
  const html = walk(m.payload, "text/html");
  if (html) return stripQuoted(html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim());
  return m.snippet ?? "";
}

/** Drop the quoted original ("On … wrote:", "> …") so the Reply Agent sees only the new text. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const l of lines) {
    if (/^On .{5,120} wrote:$/.test(l.trim()) || /^-{2,}\s*Original Message\s*-{2,}$/i.test(l.trim()) || /^(From|寄件者|於).{0,80}(寫道|wrote)[:：]?$/.test(l.trim())) break;
    if (l.trim().startsWith(">")) continue;
    out.push(l);
  }
  return out.join("\n").trim();
}

export function addressOnly(v: string): string {
  const m = v.match(/<([^>]+)>/);
  return (m ? m[1] : v).trim().toLowerCase();
}
