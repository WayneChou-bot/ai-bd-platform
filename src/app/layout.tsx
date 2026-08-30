import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Sidebar } from "@/components/dashboard/sidebar";
import { getConfig } from "@/lib/config";
import { agentStatus } from "@/lib/data";
import { getLocale } from "@/lib/i18n.server";


export const metadata: Metadata = {
  title: "AI Business Development Platform",
  description: "Discover → Research → Qualify → Engage → Learn — with evidence behind every recommendation.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cfg = getConfig();
  const [agents, locale] = await Promise.all([agentStatus(), getLocale()]);
  const available = agents.filter((a) => a.status === "RUNNING" || a.status === "READY").length;
  const running = agents.filter((a) => a.status === "RUNNING").length;
  return (
    <html lang={locale} className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-0 p-4 lg:flex-row lg:gap-4">
          <Sidebar mode={cfg.mode} agentsAvailable={available} agentsTotal={agents.length} agentsRunning={running} locale={locale} />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
