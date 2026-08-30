#!/usr/bin/env node
/**
 * One-time Gmail OAuth for the mailbox the platform will use.
 *   GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... node scripts/gmail-auth.mjs
 * Opens a browser, receives the code on http://127.0.0.1:53682, prints the
 * GMAIL_REFRESH_TOKEN to paste into .env.local. Nothing is stored anywhere else.
 */
import http from "node:http";
import { exec } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

// load .env.local if present (no dependency on dotenv)
if (existsSync(".env.local")) for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const clientId = process.env.GMAIL_CLIENT_ID, clientSecret = process.env.GMAIL_CLIENT_SECRET;
if (!clientId || !clientSecret) { console.error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET (env or .env.local) first."); process.exit(1); }

const PORT = 53682, redirect = `http://127.0.0.1:${PORT}/callback`;
const scopes = ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"].join(" ");
const url = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: "code", scope: scopes, access_type: "offline", prompt: "consent" })}`;

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, redirect);
  if (u.pathname !== "/callback") { res.writeHead(404).end(); return; }
  const code = u.searchParams.get("code");
  if (!code) { res.writeHead(400).end("missing code"); return; }
  const tok = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: "authorization_code" }) });
  const j = await tok.json();
  if (!j.refresh_token) { res.writeHead(500).end("No refresh_token returned — remove the app from https://myaccount.google.com/permissions and retry."); console.error(j); server.close(); return; }
  const me = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${j.access_token}` } }).then((r) => r.json());
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end("<h2>Authorised. You can close this tab and return to the terminal.</h2>");
  console.log("\nAdd these to .env.local:\n");
  console.log(`GMAIL_USER=${me.emailAddress}`);
  console.log(`GMAIL_REFRESH_TOKEN=${j.refresh_token}\n`);
  server.close();
});
server.listen(PORT, () => {
  console.log("Opening browser for Google consent…\nIf it does not open, visit:\n" + url + "\n");
  const cmd = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd);
});
