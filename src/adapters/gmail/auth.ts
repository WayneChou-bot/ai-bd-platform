/**
 * Gmail credentials (Spec v0.2 S3/S4, multi-tenant ready).
 *
 * A TokenProvider yields a short-lived access token for ONE mailbox. Today:
 * OAuth refresh token for a single (possibly shared) mailbox. Later, without
 * touching the adapters: a service account with domain-wide delegation that
 * impersonates any user in the Workspace, or one refresh token per user.
 */
export interface TokenProvider {
  /** The mailbox this provider acts as (also the From: address). */
  readonly mailbox: string;
  accessToken(): Promise<string>;
}

export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"];

export class RefreshTokenProvider implements TokenProvider {
  private cached?: { token: string; exp: number };
  constructor(readonly mailbox: string, private readonly clientId: string, private readonly clientSecret: string, private readonly refreshToken: string) {}

  async accessToken(): Promise<string> {
    if (this.cached && this.cached.exp > Date.now() + 30_000) return this.cached.token;
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, refresh_token: this.refreshToken, grant_type: "refresh_token" }),
      signal: AbortSignal.timeout(15_000), // a hung refresh must not wedge the poller (review v6)
    });
    if (!res.ok) throw new Error(`Gmail token refresh failed: ${res.status} ${await res.text()}`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    this.cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
    return this.cached.token;
  }
}

/**
 * Placeholder for Google Workspace: service account + domain-wide delegation.
 * Signs a JWT with `sub = user` and exchanges it for an access token, so the
 * platform can act as any mailbox in the domain without per-user consent.
 * Not wired yet (P2 multi-user); kept here so the shape is visible.
 */
export class DomainWideDelegationProvider implements TokenProvider {
  constructor(readonly mailbox: string) {}
  async accessToken(): Promise<string> {
    throw new Error("DomainWideDelegationProvider is not implemented yet (P2: Workspace multi-user)");
  }
}

export async function gmailFetch<T>(tp: TokenProvider, path: string, init: RequestInit = {}): Promise<T> {
  const token = await tp.accessToken();
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    // Bounded per request (review v6): the poller's `running` flag is released
    // in a finally block, so one hung Gmail call must not block polling forever.
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Gmail API ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}
