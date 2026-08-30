/** Next.js server start hook: boots background workers for LIVE mode. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startGmailPoller } = await import("@/lib/gmail-poller");
  startGmailPoller();
}
