import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { LocaleToggle } from "@/components/dashboard/locale-toggle";
import { getConfig } from "@/lib/config";
import { getT } from "@/lib/i18n.server";
import { repo } from "@/lib/data";
import { maskEmail } from "@/lib/utils";

export default async function Settings() {
  const { locale, t } = await getT();
  const cfg = getConfig();
  const r = await repo();
  const [leads, evidence, projects] = await Promise.all([r.leads(), r.allEvidence(), r.projects()]);
  const has = (v: unknown) => !!v;
  const state = (ok: boolean, need: "required" | "optional"): { tone: Tone; label: string } =>
    ok ? { tone: "engage", label: t("configured") } : need === "required" ? { tone: cfg.mode === "live" ? "danger" : "learn", label: `${t("not set")} · ${t("required in LIVE")}` } : { tone: "neutral", label: `${t("not set")} · ${t("optional")}` };
  const rows: Array<{ k: string; v: string; s?: { tone: Tone; label: string } }> = [
    { k: t("Application mode"), v: cfg.mode.toUpperCase(), s: { tone: cfg.mode === "demo" ? "learn" : "engage", label: cfg.mode === "demo" ? t("Simulated delivery · no external APIs") : "LIVE" } },
    { k: t("LLM provider"), v: cfg.mode === "demo" ? "MockLLMProvider" : `${cfg.llmProvider} · ${cfg.llmModel}`, s: cfg.mode === "demo" ? undefined : state(true, "required") },
    { k: t("Delivery"), v: cfg.mode === "demo" ? "MockDeliveryAdapter" : cfg.mailProvider === "gmail" ? `GmailDeliveryAdapter · ${cfg.gmail?.user ? maskEmail(cfg.gmail.user) : "GMAIL_USER?"}` : `ResendDeliveryAdapter · ${t("experimental")}`, s: cfg.mode === "demo" ? undefined : state(cfg.mailProvider === "gmail" ? has(cfg.gmail?.refreshToken) : has(cfg.resendApiKey), "required") },
    { k: t("Sender"), v: maskEmail(cfg.senderAddress) + (cfg.gmail?.replyTo ? ` · Reply-To ${maskEmail(cfg.gmail.replyTo)}` : "") },
    // Three explicit LIVE states (review v2 #9): sandbox / real outreach / blocked.
    { k: t("Recipient override"), v: cfg.demoRecipientOverride ? cfg.demoRecipientOverride.split(",").map((e) => maskEmail(e.trim())).join(", ") : "—",
      s: cfg.mode === "demo" ? undefined
        : cfg.demoRecipientOverride ? { tone: "engage" as Tone, label: t("safe sandbox — every send is rerouted here") }
        : cfg.allowRealOutreach ? { tone: "danger" as Tone, label: t("REAL OUTREACH ENABLED — sends go to leads") }
        : state(false, "required") },
    { k: t("Inbound"), v: cfg.mode === "demo" ? "SimulatedInboundSource" : cfg.mailProvider === "gmail" ? `GmailPollingSource · every ${cfg.gmail?.pollSeconds ?? 10}s` : `Resend webhook → /api/inbound · ${t("experimental")}`, s: cfg.mode === "demo" ? undefined : state(cfg.mailProvider === "gmail" ? has(cfg.gmail?.refreshToken) : has(cfg.resendWebhookSecret), "required") },
    { k: t("Database"), v: cfg.supabaseUrl ? "Supabase" : t("in-memory (resets on restart)"),
      s: cfg.mode === "demo" ? undefined
        : cfg.supabaseUrl && cfg.supabaseServiceKey ? state(true, "optional")
        : { tone: "learn" as Tone, label: t("LIVE data resets on restart — configure Supabase for persistence") } },
    { k: t("Prospect sources"), v: cfg.mode === "demo" ? "FixturePoolAdapter" : `${[cfg.searchApiKey && "Tavily", "GitHub"].filter(Boolean).join(" + ")} · ${t("manual + CSV always on")}`, s: cfg.mode === "demo" ? undefined : state(has(cfg.searchApiKey), "optional") },
    { k: t("Mention sources"), v: cfg.mode === "demo" ? "FixtureMentionAdapter" : cfg.searchApiKey ? "TavilyMentionAdapter" : t("needs SEARCH_API_KEY"), s: cfg.mode === "demo" ? undefined : state(has(cfg.searchApiKey), "optional") },
    { k: t("Pipeline batch"), v: String(cfg.pipelineBatch) },
  ];
  return (
    <>
      <PageHeader title={t("Settings")} subtitle={t("Runtime status — read-only. Values come from environment variables (§43: keys never reach the browser).")} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t("Application mode")}</CardTitle><Badge tone={cfg.mode === "demo" ? "learn" : "engage"}>{cfg.mode.toUpperCase()}</Badge></CardHeader>
          <CardContent>
            <dl className="divide-y divide-white/5 text-sm">
              {rows.map((row) => (
                <div key={row.k} className="grid grid-cols-[180px_1fr_auto] items-center gap-3 py-2.5">
                  <dt className="text-muted">{row.k}</dt>
                  <dd className="truncate font-mono text-xs text-fg/90">{row.v}</dd>
                  <dd>{row.s && <Badge tone={row.s.tone}>{row.s.label}</Badge>}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-muted"><span className="font-medium text-fg/80">{t("How to switch to LIVE")}</span> — {t("Set APP_MODE=live in .env.local plus the keys marked required, restart the dev server. Every Approve & Send then goes to DEMO_RECIPIENT_OVERRIDE.")}</p>
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>{t("Interface language")}</CardTitle></CardHeader>
            <CardContent><LocaleToggle locale={locale} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t("Fixture dataset")}</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <div className="tabular flex justify-between py-1"><span className="text-muted">{t("Projects")}</span><span>{projects.length}</span></div>
              <div className="tabular flex justify-between py-1"><span className="text-muted">{t("Leads")}</span><span>{leads.length}</span></div>
              <div className="tabular flex justify-between py-1"><span className="text-muted">{t("Evidence")}</span><span>{evidence.length}</span></div>
              <p className="mt-2 text-xs text-muted">{t("Regenerate with")} <code className="rounded bg-white/5 px-1">npm run fixtures</code></p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
