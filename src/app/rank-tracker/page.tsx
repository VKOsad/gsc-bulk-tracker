"use client";

// Rank Tracker portfolio. Lists every GSC site with its Topvisor status, built from
// the local portfolio feed (no per-site Topvisor calls). Unconfigured sites show a
// "Add project" CTA; a banner surfaces newly-synced GSC sites.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Target, Search, Plus, ArrowRight, RefreshCw, Star } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import TopvisorWizard from "@/components/TopvisorWizard";

interface Row {
  siteId: string;
  url: string;
  gscProperty: string;
  tags: string;
  configured: boolean;
  status: string;
  rankProjectId: string | null;
  externalProjectId: string | null;
  autoCheckEnabled: boolean;
  favorite: boolean;
  lastCheckCompletedAt: string | null;
  region: { name: string | null; country: string | null; device: number } | null;
  keywordCount: number;
  top3: number;
  top10: number;
  avgPosition: number | null;
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  active: { bg: "rgba(16,185,129,0.12)", fg: "#10b981" },
  draft: { bg: "rgba(142,142,147,0.14)", fg: "var(--color-text-secondary)" },
  partial: { bg: "rgba(245,158,11,0.14)", fg: "#f59e0b" },
  checking: { bg: "rgba(59,130,246,0.14)", fg: "#3b82f6" },
  syncing: { bg: "rgba(59,130,246,0.14)", fg: "#3b82f6" },
  error: { bg: "rgba(239,68,68,0.12)", fg: "#ef4444" },
  disconnected: { bg: "rgba(142,142,147,0.14)", fg: "var(--color-text-secondary)" },
  unconfigured: { bg: "rgba(142,142,147,0.1)", fg: "var(--color-text-secondary)" },
};

const PER_PAGE = 25;

export default function RankTrackerPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [newSites, setNewSites] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "configured" | "unconfigured">("all");
  const [page, setPage] = useState(0);
  const [wizardSite, setWizardSite] = useState<Row | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/topvisor/projects");
      const d = await r.json();
      setRows(d.sites ?? []);
      setNewSites(d.newSites ?? 0);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === "configured" && !r.configured) return false;
      if (statusFilter === "unconfigured" && r.configured) return false;
      if (q && !r.url.toLowerCase().includes(q) && !r.gscProperty.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, statusFilter]);

  const pageRows = filtered.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  const pageCount = Math.ceil(filtered.length / PER_PAGE);

  const statusLabel = (s: string) => t(`rtStatus_${s}`) || s;

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 20px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Target size={22} style={{ color: "#c0345a" }} />
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--color-text-primary)", margin: 0 }}>{t("navTopvisor")}</h1>
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>({filtered.length})</span>
        </div>
        <button onClick={load} style={btn("ghost")} disabled={loading}>
          <RefreshCw size={14} className={loading ? "spin" : ""} /> {t("rtSyncProjects")}
        </button>
      </div>

      {/* New-sites banner */}
      {newSites > 0 && (
        <div style={{ ...card, marginBottom: 16, borderColor: "rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, color: "var(--color-text-primary)" }}>
            {t("rtNewSitesBanner").replace("{n}", String(newSites))}
          </div>
          <button onClick={() => { setStatusFilter("unconfigured"); setPage(0); }} style={btn("secondary")}>
            {t("rtShowUnconfigured")}
          </button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-secondary)" }} />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder={t("rtSearchSites")} style={{ ...input, paddingLeft: 34 }} />
        </div>
        {(["all", "configured", "unconfigured"] as const).map((f) => (
          <button key={f} onClick={() => { setStatusFilter(f); setPage(0); }} style={btn(statusFilter === f ? "active" : "ghost")}>
            {t(`rtFilter_${f}`)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-secondary)", textAlign: "left" }}>
                <Th>{t("rtColSite")}</Th>
                <Th>{t("rtColStatus")}</Th>
                <Th>{t("rtColRegion")}</Th>
                <Th right>{t("rtColKeywords")}</Th>
                <Th right>Top 3</Th>
                <Th right>Top 10</Th>
                <Th right>{t("rtColAvg")}</Th>
                <Th>{t("rtColLastCheck")}</Th>
                <Th right>{t("rtColAction")}</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ padding: 24, textAlign: "center", color: "var(--color-text-secondary)" }}>{t("tvLoading")}</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 24, textAlign: "center", color: "var(--color-text-secondary)" }}>{t("rtEmpty")}</td></tr>
              ) : (
                pageRows.map((r) => {
                  const c = STATUS_COLORS[r.status] ?? STATUS_COLORS.unconfigured;
                  return (
                    <tr key={r.siteId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <Td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {r.favorite && <Star size={12} style={{ color: "#f59e0b" }} />}
                          <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{r.url}</span>
                        </div>
                      </Td>
                      <Td><span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: c.bg, color: c.fg }}>{statusLabel(r.status)}</span></Td>
                      <Td>{r.region ? `${r.region.name ?? r.region.country ?? "—"} · ${r.region.device === 2 ? "Mobile" : "Desktop"}` : "—"}</Td>
                      <Td right>{r.keywordCount || "—"}</Td>
                      <Td right>{r.configured ? r.top3 : "—"}</Td>
                      <Td right>{r.configured ? r.top10 : "—"}</Td>
                      <Td right>{r.avgPosition ?? "—"}</Td>
                      <Td>{r.lastCheckCompletedAt ? new Date(r.lastCheckCompletedAt).toLocaleDateString() : "—"}</Td>
                      <Td right>
                        {!r.configured ? (
                          <button onClick={() => setWizardSite(r)} style={btn("primary")}><Plus size={13} /> {t("rtAddProject")}</button>
                        ) : r.status === "partial" || r.status === "draft" ? (
                          <button onClick={() => setWizardSite(r)} style={btn("secondary")}>{t("rtContinueSetup")}</button>
                        ) : (
                          <button onClick={() => router.push(`/rank-tracker/${r.rankProjectId}`)} style={btn("secondary")}>{t("rtOpenPositions")} <ArrowRight size={13} /></button>
                        )}
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: 12, borderTop: "1px solid var(--color-border)" }}>
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} style={btn("ghost")}>←</button>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)", alignSelf: "center" }}>{page + 1} / {pageCount}</span>
            <button disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)} style={btn("ghost")}>→</button>
          </div>
        )}
      </div>

      {wizardSite && (
        <TopvisorWizard
          siteId={wizardSite.siteId}
          siteUrl={wizardSite.url}
          gscProperty={wizardSite.gscProperty}
          onClose={() => setWizardSite(null)}
          onDone={() => { setWizardSite(null); load(); }}
        />
      )}
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--color-card)", borderRadius: 12, padding: 16, border: "1px solid var(--color-border)" };
const input: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 8, background: "var(--color-bg)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)", fontSize: 13, outline: "none", boxSizing: "border-box" };

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th style={{ padding: "10px 14px", fontWeight: 600, textAlign: right ? "right" : "left", whiteSpace: "nowrap" }}>{children}</th>;
}
function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td style={{ padding: "10px 14px", textAlign: right ? "right" : "left", color: "var(--color-text-primary)", whiteSpace: "nowrap" }}>{children}</td>;
}
function btn(kind: "primary" | "secondary" | "ghost" | "active"): React.CSSProperties {
  const base: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid transparent", whiteSpace: "nowrap" };
  if (kind === "primary") return { ...base, background: "var(--color-accent-blue)", color: "#fff" };
  if (kind === "active") return { ...base, background: "rgba(59,130,246,0.15)", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.3)" };
  if (kind === "secondary") return { ...base, background: "var(--color-bg)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" };
  return { ...base, background: "transparent", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" };
}
