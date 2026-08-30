"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, Bot, FolderKanban, LayoutDashboard, Mail, Megaphone, Menu, Radar, Settings, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { tr, type Locale } from "@/lib/i18n";
import { LocaleToggle } from "./locale-toggle";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/discover", label: "Discover", icon: Radar },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/campaigns", label: "Engagement", icon: Megaphone },
  { href: "/messages", label: "Messages", icon: Mail },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ mode, agentsAvailable, agentsTotal, agentsRunning, locale }: { mode: "demo" | "live"; agentsAvailable: number; agentsTotal: number; agentsRunning: number; locale: Locale }) {
  const path = usePathname();
  const t = tr(locale);
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  const modeBadge = (
    <span className={cn("rounded-md border px-1.5 py-0.5 text-xs font-semibold", mode === "demo" ? "border-learn/30 bg-learn/15 text-learn" : "border-engage/30 bg-engage/15 text-engage")}>
      {mode.toUpperCase()}
    </span>
  );
  const agentsLine = agentsRunning > 0 ? (
    <><span className="pulse inline-block h-2 w-2 rounded-full bg-accent" /> {agentsRunning} {t("agents running")}</>
  ) : (
    <><span className="inline-block h-2 w-2 rounded-full bg-engage" /> {agentsAvailable} / {agentsTotal} {t("agents available")}</>
  );

  return (
    <>
      {/* ── Mobile top bar (<lg): logo + mode + menu toggle ─────────────── */}
      <header className="glass sticky top-0 z-40 -mx-4 -mt-4 mb-1 flex items-center justify-between rounded-none px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20 text-accent"><Activity size={16} /></div>
          <span className="text-sm font-semibold">AI BD Platform</span>
          {modeBadge}
        </div>
        <button onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open} className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-fg">
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>
      {open && (
        <nav className="glass sticky top-[52px] z-40 -mx-4 mb-3 rounded-none px-2 pb-3 lg:hidden">
          <div className="grid grid-cols-2 gap-0.5 sm:grid-cols-3">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} onClick={() => setOpen(false)} className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-muted hover:bg-white/5 hover:text-fg", isActive(href) && "bg-accent/15 text-fg")}>
                <Icon size={16} /> {t(label)}
              </Link>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-white/10 px-3 pt-3 text-xs">
            <span className="flex items-center gap-2 text-muted">{agentsLine}</span>
            <LocaleToggle locale={locale} />
          </div>
        </nav>
      )}

      {/* ── Desktop sidebar (lg+) ───────────────────────────────────────── */}
      <aside className="glass sticky top-4 hidden h-[calc(100vh-2rem)] w-56 shrink-0 flex-col rounded-2xl p-3 lg:flex">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/20 text-accent"><Activity size={18} /></div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">AI BD Platform</div>
            <div className="text-[10px] text-muted">{t("Discover → Research → Qualify → Engage → Learn")}</div>
          </div>
        </div>
        <nav className="mt-3 flex flex-col gap-0.5">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-fg", isActive(href) && "bg-accent/15 text-fg")}>
              <Icon size={16} /> {t(label)}
            </Link>
          ))}
        </nav>
        <div className="mt-auto glass rounded-xl p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted">{t("Mode")}</span>
            {modeBadge}
          </div>
          {mode === "demo" && <div className="mt-1 text-[10px] text-muted">{t("Simulated delivery · no external APIs")}</div>}
          <div className="mt-2 flex items-center gap-2 text-muted">{agentsLine}</div>
          <div className="mt-2 flex items-center justify-between"><span className="text-muted">{t("Language")}</span><LocaleToggle locale={locale} /></div>
        </div>
      </aside>
    </>
  );
}
