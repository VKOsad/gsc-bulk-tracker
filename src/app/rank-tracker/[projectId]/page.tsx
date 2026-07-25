"use client";

// Project position history: KPI blocks + a Topvisor-style history table (sticky
// keyword columns, actual check dates as columns, colored deltas) + per-keyword
// chart (reversed Y, Topvisor + GSC overlay). Data is local; "Снять позиции" runs a
// cost-confirmed paid check as a background job.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, Target, ArrowUp, ArrowDown, Minus, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { PieChart, Pie, Cell, ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

interface KwRow { id: string; keyword: string; group: string; lastUrl: string | null; positions: Record<string, number | null> }
interface Kpi {
  movement: { up: number; down: number; stay: number; total: number };
  avgPosition: number | null; avgDelta: number | null; medianPosition: number | null;
  distribution: { top3: number; top10: number; top30: number; top50: number; top100: number; beyond: number; notFound: number };
  visibility: number | null;
}
interface Data {
  project: { id: string; siteId: string; url: string; status: string; regions: { regionIndex: number; name: string | null; device: number; countryCode: string | null }[]; selectedRegionIndex: number | null };
  dates: string[]; keywords: KwRow[]; kpi: Kpi;
}

const posColor = (p: number | null): { bg: string; fg: string } => {
  if (p == null || p === 0) return { bg: "rgba(245,158,11,0.10)", fg: "var(--color-text-secondary)" };
  if (p <= 3) return { bg: "rgba(16,185,129,0.16)", fg: "#059669" };
  if (p <= 10) return { bg: "rgba(59,130,246,0.12)", fg: "#3b82f6" };
  if (p <= 30) return { bg: "rgba(59,130,246,0.06)", fg: "var(--color-text-primary)" };
  return { bg: "transparent", fg: "var(--color-text-secondary)" };
};

export default function ProjectHistoryPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(90);
  const [regionIndex, setRegionIndex] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [move, setMove] = useState<"all" | "up" | "down">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "sync" | "check">(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ days: String(days) });
      if (regionIndex != null) qs.set("regionIndex", String(regionIndex));
      const r = await fetch(`/api/topvisor/rank-projects/${projectId}/history?${qs}`);
      const d = await r.json();
      if (r.ok) { setData(d); if (regionIndex == null) setRegionIndex(d.project.selectedRegionIndex); }
    } finally { setLoading(false); }
  }, [projectId, days, regionIndex]);
  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    if (!data) return;
    setBusy("sync"); setMsg(null);
    try { await fetch(`/api/topvisor/projects/${data.project.siteId}/sync`, { method: "POST" }); await load(); }
    finally { setBusy(null); }
  };

  const runCheck = async () => {
    if (!data) return;
    setBusy("check"); setMsg(null);
    try {
      const pr = await fetch(`/api/topvisor/projects/${data.project.siteId}/price`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const price = await pr.json();
      if (!pr.ok) { setMsg(t(`tvErr_${price.error}`) || price.error || t("tvErrGeneric")); return; }
      if (!window.confirm(t("rtConfirmCheck").replace("{price}", String(price.price)))) return;
      const cr = await fetch(`/api/topvisor/projects/${data.project.siteId}/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true, confirmedCost: price.price }) });
      const cd = await cr.json();
      if (!cr.ok) { setMsg(t(`tvErr_${cd.error}`) || cd.error || t("tvErrGeneric")); return; }
      setMsg(t("rtCheckStarted"));
    } finally { setBusy(null); }
  };

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const latest = data.dates[0]; const prev = data.dates[1];
    return data.keywords.filter((k) => {
      if (q && !k.keyword.toLowerCase().includes(q)) return false;
      if (move !== "all" && latest && prev) {
        const cur = k.positions[latest]; const pr = k.positions[prev];
        if (cur == null || pr == null) return false;
        if (move === "up" && !(cur < pr)) return false;
        if (move === "down" && !(cur > pr)) return false;
      }
      return true;
    });
  }, [data, search, move]);

  if (loading && !data) return <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-secondary)" }}>{t("tvLoading")}</div>;
  if (!data) return <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-secondary)" }}>{t("rtNoData")}</div>;

  const { kpi, dates } = data;
  const latest = dates[0]; const prev = dates[1];

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "20px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <button onClick={() => router.push("/rank-tracker")} style={ghostBtn}><ArrowLeft size={15} /> {t("rtBack")}</button>
        <Target size={20} style={{ color: "#c0345a" }} />
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--color-text-primary)", margin: 0 }}>{data.project.url}</h1>
        <div style={{ flex: 1 }} />
        {data.project.regions.length > 1 && (
          <select value={regionIndex ?? ""} onChange={(e) => setRegionIndex(Number(e.target.value))} style={sel}>
            {data.project.regions.map((r) => <option key={r.regionIndex} value={r.regionIndex}>{r.name ?? r.countryCode} · {r.device === 2 ? "Mobile" : "Desktop"}</option>)}
          </select>
        )}
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={sel}>
          {[7, 14, 30, 90, 180].map((d) => <option key={d} value={d}>{d} {t("rtDays")}</option>)}
        </select>
        <button onClick={sync} disabled={busy !== null} style={ghostBtn}><RefreshCw size={14} className={busy === "sync" ? "spin" : ""} /> {t("rtSync")}</button>
        <button onClick={runCheck} disabled={busy !== null} style={primaryBtn}>{busy === "check" ? <Loader2 size={14} className="spin" /> : <Target size={14} />} {t("rtSnapPositions")}</button>
      </div>
      {msg && <div style={{ marginBottom: 12, fontSize: 13, color: "var(--color-accent-blue)" }}>{msg}</div>}

      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 18 }}>
        <MovementCard kpi={kpi} t={t} />
        <StatCard label={t("rtKpiAvg")} value={kpi.avgPosition ?? "—"} delta={kpi.avgDelta} goodWhenUp t={t} />
        <StatCard label={t("rtKpiMedian")} value={kpi.medianPosition ?? "—"} t={t} />
        <DistributionCard dist={kpi.distribution} t={t} />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("rtSearchKeywords")} style={{ ...sel, minWidth: 220, flex: 1 }} />
        {(["all", "up", "down"] as const).map((m) => (
          <button key={m} onClick={() => setMove(m)} style={move === m ? activeBtn : ghostBtn}>{t(`rtFilterMove_${m}`)}</button>
        ))}
      </div>

      {/* History table */}
      {dates.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", color: "var(--color-text-secondary)", padding: 32 }}>{t("rtNoChecks")}</div>
      ) : (
        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
                  <th style={{ ...stickyTh, left: 0, minWidth: 260, zIndex: 3 }}>{t("rtColKeyword")}</th>
                  {dates.map((d) => (
                    <th key={d} style={{ padding: "10px 12px", textAlign: "center", fontWeight: 600, whiteSpace: "nowrap" }}>{d.slice(5)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((k) => {
                  const isOpen = expanded === k.id;
                  return (
                    <Fragment key={k.id}>
                      <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ ...stickyTd, left: 0, minWidth: 260, zIndex: 2 }}>
                          <button onClick={() => setExpanded(isOpen ? null : k.id)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: "var(--color-text-primary)", textAlign: "left", padding: 0 }}>
                            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            <span style={{ fontWeight: 600 }}>{k.keyword}</span>
                          </button>
                          {k.group && <span style={{ fontSize: 11, color: "var(--color-text-secondary)", marginLeft: 19 }}>{k.group}</span>}
                        </td>
                        {dates.map((d, i) => {
                          const p = k.positions[d];
                          const nextD = dates[i + 1]; // older column (dates are newest-first)
                          const older = nextD ? k.positions[nextD] : null;
                          const delta = p != null && older != null ? older - p : null; // + = improved
                          const c = posColor(p);
                          return (
                            <td key={d} style={{ padding: "8px 12px", textAlign: "center", background: c.bg }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                                <span style={{ fontWeight: 600, color: c.fg }}>{p == null || p === 0 ? "—" : p}</span>
                                {delta != null && delta !== 0 && (
                                  <span style={{ display: "inline-flex", alignItems: "center", fontSize: 10, color: delta > 0 ? "#059669" : "#ef4444" }}>
                                    {delta > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}{Math.abs(delta)}
                                  </span>
                                )}
                                {delta === 0 && <Minus size={9} style={{ color: "var(--color-text-secondary)" }} />}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={dates.length + 1} style={{ padding: 0, background: "var(--color-bg)" }}>
                            <KeywordChart keywordId={k.id} url={k.lastUrl} t={t} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── KPI cards ──────────────────────────────────────────────────────────────────
function MovementCard({ kpi, t }: { kpi: Kpi; t: (k: string) => string }) {
  const d = kpi.movement;
  const data = [
    { name: t("rtKpiUp"), value: d.up, color: "#10b981" },
    { name: t("rtKpiStay"), value: d.stay, color: "#8e8e93" },
    { name: t("rtKpiDown"), value: d.down, color: "#ef4444" },
  ].filter((x) => x.value > 0);
  return (
    <div style={cardStyle}>
      <div style={kpiLabel}>{t("rtKpiMovement")}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 66, height: 66 }}>
          {d.total > 0 && (
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data.length ? data : [{ name: "-", value: 1, color: "var(--color-border)" }]} dataKey="value" innerRadius={20} outerRadius={32} paddingAngle={2}>
                  {(data.length ? data : [{ color: "var(--color-border)" }]).map((e, i) => <Cell key={i} fill={(e as { color: string }).color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div style={{ fontSize: 12 }}>
          <div style={{ color: "#10b981" }}>▲ {d.up} {t("rtKpiUp")}</div>
          <div style={{ color: "var(--color-text-secondary)" }}>— {d.stay} {t("rtKpiStay")}</div>
          <div style={{ color: "#ef4444" }}>▼ {d.down} {t("rtKpiDown")}</div>
        </div>
      </div>
    </div>
  );
}
function StatCard({ label, value, delta, goodWhenUp, t }: { label: string; value: string | number; delta?: number | null; goodWhenUp?: boolean; t: (k: string) => string }) {
  const good = delta != null && delta > 0;
  return (
    <div style={cardStyle}>
      <div style={kpiLabel}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: "var(--color-text-primary)" }}>{value}</div>
      {delta != null && delta !== 0 && goodWhenUp && (
        <div style={{ fontSize: 12, color: good ? "#059669" : "#ef4444", display: "flex", alignItems: "center", gap: 3 }}>
          {good ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{Math.abs(delta)} {t("rtVsPrev")}
        </div>
      )}
    </div>
  );
}
function DistributionCard({ dist, t }: { dist: Kpi["distribution"]; t: (k: string) => string }) {
  const items = [
    { label: "Top 3", value: dist.top3, color: "#059669" },
    { label: "Top 10", value: dist.top10, color: "#3b82f6" },
    { label: "Top 30", value: dist.top30, color: "#6366f1" },
    { label: "Top 100", value: dist.top100, color: "#8e8e93" },
    { label: t("rtNotFound"), value: dist.notFound, color: "#f59e0b" },
  ];
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div style={cardStyle}>
      <div style={kpiLabel}>{t("rtKpiDistribution")}</div>
      {items.map((i) => (
        <div key={i.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 11, color: "var(--color-text-secondary)", width: 52 }}>{i.label}</span>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--color-border)", overflow: "hidden" }}>
            <div style={{ width: `${(i.value / max) * 100}%`, height: "100%", background: i.color }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)", width: 24, textAlign: "right" }}>{i.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Keyword detail chart (reuses the existing SERP+GSC history endpoint) ─────────
function KeywordChart({ keywordId, url, t }: { keywordId: string; url: string | null; t: (k: string) => string }) {
  const [series, setSeries] = useState<{ date: string; serp: number | null; gsc: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`/api/rank/history?keywordId=${keywordId}&days=180`)
      .then((r) => r.json())
      .then((d) => setSeries(d.series ?? []))
      .catch(() => setSeries([]))
      .finally(() => setLoading(false));
  }, [keywordId]);
  return (
    <div style={{ padding: 16 }}>
      {url && <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8 }}>{t("rtColUrl")}: <a href={url} target="_blank" rel="noreferrer" style={{ color: "var(--color-accent-blue)" }}>{url}</a></div>}
      <div style={{ height: 200 }}>
        {loading ? (
          <div style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>{t("tvLoading")}</div>
        ) : (
          <ResponsiveContainer>
            <ComposedChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis reversed domain={[1, "dataMax"]} tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="serp" name="Topvisor" stroke="#3b82f6" dot={false} connectNulls />
              <Line type="monotone" dataKey="gsc" name="GSC" stroke="#f59e0b" strokeDasharray="4 3" dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: "var(--color-card)", borderRadius: 12, padding: 14, border: "1px solid var(--color-border)" };
const kpiLabel: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 8 };
const sel: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, background: "var(--color-bg)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)", fontSize: 13, outline: "none" };
const stickyTh: React.CSSProperties = { position: "sticky", background: "var(--color-card)", padding: "10px 14px", fontWeight: 600, textAlign: "left" };
const stickyTd: React.CSSProperties = { position: "sticky", background: "var(--color-card)", padding: "8px 14px", textAlign: "left" };
const ghostBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", background: "transparent", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" };
const activeBtn: React.CSSProperties = { ...ghostBtn, background: "rgba(59,130,246,0.15)", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.3)" };
const primaryBtn: React.CSSProperties = { ...ghostBtn, background: "var(--color-accent-blue)", color: "#fff", border: "1px solid transparent" };
