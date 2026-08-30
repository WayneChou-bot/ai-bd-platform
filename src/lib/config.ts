/**
 * Runtime configuration (Spec v0.2 S2).
 *
 * APP_MODE is the only switch. Business logic must never branch on it;
 * only adapter factories may.
 */
import { AppMode } from "@/core/schemas";

export interface AppConfig {
  mode: AppMode;
  llmProvider: "mock" | "openai" | "anthropic" | "google";
  llmModel: string;
  /** Which mail stack LIVE uses. gmail = one authorised mailbox (shared mailbox ready); resend = transactional service + webhook. */
  mailProvider: "gmail" | "resend";
  resendApiKey?: string;
  resendWebhookSecret?: string;
  gmail?: { user: string; clientId: string; clientSecret: string; refreshToken: string; replyTo?: string; fromName?: string; pollSeconds: number };
  senderAddress: string;
  /** In LIVE mode, every send goes here regardless of the lead (S3.1). */
  demoRecipientOverride?: string;
  /** Explicit opt-in to email real prospects when no override is set. */
  allowRealOutreach: boolean;
  supabaseUrl?: string;
  supabaseServiceKey?: string;
  /** Tavily search (live discovery). Optional: without it discovery uses GitHub + manual/CSV only. */
  searchApiKey?: string;
  githubToken?: string;
  /** Max leads processed per pipeline run (keeps live runs bounded). */
  pipelineBatch: number;
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export function loadConfig(): AppConfig {
  const mode = AppMode.parse(env("APP_MODE") ?? "demo");
  const cfg: AppConfig = {
    mode,
    llmProvider: mode === "demo" ? "mock" : ((env("LLM_PROVIDER") as AppConfig["llmProvider"]) ?? "openai"),
    llmModel: env("LLM_MODEL") ?? "gpt-4o-mini",
    mailProvider: (env("MAIL_PROVIDER") as "gmail" | "resend") ?? "gmail",
    gmail: env("GMAIL_USER") ? {
      user: env("GMAIL_USER")!, clientId: env("GMAIL_CLIENT_ID") ?? "", clientSecret: env("GMAIL_CLIENT_SECRET") ?? "", refreshToken: env("GMAIL_REFRESH_TOKEN") ?? "",
      replyTo: env("MAIL_REPLY_TO"), fromName: env("MAIL_FROM_NAME"), pollSeconds: Number(env("GMAIL_POLL_SECONDS") ?? 10),
    } : undefined,
    resendApiKey: env("RESEND_API_KEY"),
    resendWebhookSecret: env("RESEND_WEBHOOK_SECRET"),
    senderAddress: env("SENDER_ADDRESS") ?? env("GMAIL_USER") ?? "bd@example.com",
    demoRecipientOverride: env("DEMO_RECIPIENT_OVERRIDE"),
    allowRealOutreach: env("ALLOW_REAL_OUTREACH") === "true",
    supabaseUrl: env("SUPABASE_URL"),
    supabaseServiceKey: env("SUPABASE_SERVICE_ROLE_KEY"),
    searchApiKey: env("SEARCH_API_KEY"),
    githubToken: env("GITHUB_TOKEN"),
    pipelineBatch: Number(env("PIPELINE_BATCH") ?? (mode === "demo" ? 25 : 8)),
  };

  if (mode === "live") {
    const missing: string[] = [];
    if (cfg.llmProvider === "openai" && !env("OPENAI_API_KEY")) missing.push("OPENAI_API_KEY");
    if (cfg.llmProvider === "anthropic" && !env("ANTHROPIC_API_KEY")) missing.push("ANTHROPIC_API_KEY");
    if (cfg.llmProvider === "google" && !env("GOOGLE_GENERATIVE_AI_API_KEY")) missing.push("GOOGLE_GENERATIVE_AI_API_KEY");
    if (cfg.mailProvider === "resend" && !cfg.resendApiKey) missing.push("RESEND_API_KEY");
    if (cfg.mailProvider === "gmail") for (const k of ["GMAIL_USER", "GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"]) if (!env(k)) missing.push(k);
    if (missing.length) {
      throw new Error(`APP_MODE=live requires: ${missing.join(", ")}`);
    }
    // Sending to real prospects must be an explicit decision, never a default
    // (external review P0): without the override, LIVE refuses to start unless
    // ALLOW_REAL_OUTREACH=true is set knowingly.
    if (!cfg.supabaseUrl) {
      console.warn("[config] LIVE with in-memory storage — data resets when the process restarts. Configure Supabase for persistence.");
    }
    if (!cfg.demoRecipientOverride && !cfg.allowRealOutreach) {
      throw new Error(
        "APP_MODE=live without DEMO_RECIPIENT_OVERRIDE would email real prospects. " +
        "Set DEMO_RECIPIENT_OVERRIDE=you@example.com to route every send to yourself, " +
        "or set ALLOW_REAL_OUTREACH=true only when you truly intend to contact leads.",
      );
    }
  }
  return cfg;
}

let cached: AppConfig | undefined;
export function getConfig(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}
