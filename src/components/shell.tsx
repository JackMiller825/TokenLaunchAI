"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  Brain,
  CalendarRange,
  ChartColumn,
  FileText,
  FolderKanban,
  Images,
  ListChecks,
  Menu,
  MessagesSquare,
  Plug,
  Radar,
  Rocket,
  ScanSearch,
  Send,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, useBootstrap } from "./desk";

const NAV = [
  ["/dashboard", "Dashboard", Rocket],
  ["/projects", "Projects", FolderKanban],
  ["/analyzer", "Website Analyzer", ScanSearch],
  ["/intelligence", "Token Intelligence", Brain],
  ["/strategy", "AI Marketing Strategy", Sparkles],
  ["/discovery", "Advertising Discovery", Radar],
  ["/telegram", "Telegram Growth", Send],
  ["/creative", "Creative Studio", Images],
  ["/campaigns", "Launch Campaigns", ChartColumn],
  ["/calendar", "Launch Calendar", CalendarRange],
  ["/readiness", "Launch Readiness", ListChecks],
  ["/community", "Community Management", MessagesSquare],
  ["/analytics", "Performance Analytics", ChartColumn],
  ["/reports", "Reports", FileText],
  ["/integrations", "Integrations", Plug],
  ["/settings", "Settings", Settings],
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const boot = useBootstrap();
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState("");
  const [answer, setAnswer] = useState<{ answer: string; reasons: string[]; links: { href: string; label: string }[] } | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);

  async function switchProject(projectId: string) {
    await api("/api/active-project", { method: "POST", body: JSON.stringify({ projectId }) });
    router.refresh();
    window.location.reload();
  }

  async function askAssistant() {
    const id = boot.data?.activeProjectId;
    if (!id) return toast.error("Open a project first.");
    const result = await api(`/api/projects/${id}/assistant`, { method: "POST", body: JSON.stringify({ question: ask }) });
    setAnswer(result);
  }

  return (
    <div className="app-grid">
      {open ? <button className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setOpen(false)} aria-label="Close menu" /> : null}
      <aside className={`sidebar ${open ? "open" : ""} flex flex-col border-r border-border bg-[#0b1220]/95 p-4 backdrop-blur`}>
        <div className="mb-4 flex items-center justify-between">
          <Link href="/dashboard" className="font-semibold tracking-tight text-white">
            TokenLaunch AI
          </Link>
          <button className="btn btn-ghost px-2 py-1 md:hidden" onClick={() => setOpen(false)} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
          {NAV.map(([href, label, Icon]) => (
            <Link key={href} href={href} onClick={() => setOpen(false)} className={`nav-link ${path === href ? "active" : ""}`}>
              <Icon size={16} /> {label}
            </Link>
          ))}
        </nav>
        <p className="mt-4 text-xs text-muted">
          Signed in as {boot.data?.user.email || "…"} · {boot.data?.user.role}
        </p>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border bg-[#070b14]/80 px-4 py-3 backdrop-blur">
          <button className="btn btn-ghost px-2 py-2 md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={18} />
          </button>
          <select
            className="field max-w-xs py-2"
            value={boot.data?.activeProjectId || ""}
            onChange={(event) => switchProject(event.target.value)}
            aria-label="Active project"
          >
            <option value="" disabled>
              {boot.data?.projects.length ? "Select a project" : "No projects yet"}
            </option>
            {boot.data?.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
                {project.ticker ? ` (${project.ticker})` : ""}
              </option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-2">
            <button className="btn btn-ghost" onClick={() => setAssistantOpen((value) => !value)}>
              <Sparkles size={16} /> Assistant
            </button>
            <details className="relative">
              <summary className="btn btn-ghost list-none">
                <Bell size={16} /> {boot.data?.notifications.filter((item) => !item.readAt).length || 0}
              </summary>
              <div className="panel absolute right-0 mt-2 w-80 p-3">
                {boot.data?.notifications.length ? (
                  boot.data.notifications.map((item) => (
                    <Link key={item.id} href={item.href || "/dashboard"} className="block border-b border-border py-2 text-sm">
                      <strong>{item.title}</strong>
                      <span className="block text-muted">{item.body}</span>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-muted">No notifications yet.</p>
                )}
              </div>
            </details>
          </div>
        </header>
        <main className="px-4 py-6 md:px-8">{children}</main>
      </div>
      {assistantOpen ? (
        <section className="panel fixed bottom-4 right-4 z-30 w-[min(420px,calc(100%-2rem))] p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Marketing assistant</h2>
            <button onClick={() => setAssistantOpen(false)} aria-label="Close assistant">
              <X size={16} />
            </button>
          </div>
          <textarea
            className="field min-h-20"
            value={ask}
            onChange={(event) => setAsk(event.target.value)}
            placeholder="What should I do next?"
          />
          <button className="btn btn-primary mt-2" onClick={() => askAssistant().catch((error) => toast.error(error.message))}>
            Ask
          </button>
          {answer ? (
            <div className="mt-3 text-sm">
              <p>{answer.answer}</p>
              <ul className="mt-2 list-disc pl-4 text-muted">
                {answer.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap gap-2">
                {answer.links.map((link) => (
                  <Link key={link.href} className="chip" href={link.href}>
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
