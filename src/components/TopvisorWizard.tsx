"use client";

// Add-project wizard: (1) create/link a Topvisor project, (2) Google GEO + device +
// depth, (3) keywords, (4) cost + confirmation. Steps 1–3 are FREE; a paid check runs
// only if the user ticks "run first check" and confirms the quoted price.

import { useEffect, useRef, useState } from "react";
import { X, Loader2, Check, ArrowRight, ArrowLeft, AlertCircle } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { parseKeywords } from "@/lib/topvisor/keywordParser";

interface Props {
  siteId: string;
  siteUrl: string;
  gscProperty: string;
  onClose: () => void;
  onDone: () => void;
}
interface Candidate { externalProjectId: string; name: string; url: string }
interface Region { regionKey: number; regionIndex: number | null; regionName: string; countryCode: string | null; language: string; device: number; depth: number; type: string | null }

const DEPTHS = [1, 2, 3, 4, 5]; // Top-10 … Top-50

export default function TopvisorWizard({ siteId, siteUrl, gscProperty, onClose, onDone }: Props) {
  const { t } = useLanguage();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [mode, setMode] = useState<"create" | "link">("create");
  const [linkId, setLinkId] = useState<string>("");

  // Step 2
  const [country, setCountry] = useState("");
  const [regionQuery, setRegionQuery] = useState("");
  const [regionResults, setRegionResults] = useState<Region[]>([]);
  const [region, setRegion] = useState<Region | null>(null);
  const [devices, setDevices] = useState<{ desktop: boolean; mobile: boolean }>({ desktop: true, mobile: false });
  const [depth, setDepth] = useState(5);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 3
  const [kwText, setKwText] = useState("");
  const [groupName, setGroupName] = useState("Основная");
  const preview = parseKeywords(kwText);

  // Step 4
  const [price, setPrice] = useState<{ price: number; regionCount: number; keywordCount: number } | null>(null);
  const [rankProjectId, setRankProjectId] = useState<string | null>(null);
  const [runCheck, setRunCheck] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/topvisor/projects/${siteId}/candidates`)
      .then((r) => r.json())
      .then((d) => {
        const c: Candidate[] = d.candidates ?? [];
        setCandidates(c);
        if (c.length > 0) { setMode("link"); setLinkId(c[0].externalProjectId); }
      })
      .catch(() => {});
  }, [siteId]);

  useEffect(() => {
    if (regionQuery.trim().length < 2) { setRegionResults([]); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const qs = new URLSearchParams({ search: regionQuery.trim() });
      if (country.trim()) qs.set("country", country.trim());
      try {
        const r = await fetch(`/api/topvisor/regions?${qs}`);
        const d = await r.json();
        setRegionResults(d.regions ?? []);
      } catch { setRegionResults([]); }
    }, 350);
  }, [regionQuery, country]);

  const regionsPayload = () => {
    if (!region) return [];
    const devs: number[] = [];
    if (devices.desktop) devs.push(0);
    if (devices.mobile) devs.push(2);
    return devs.map((device) => ({
      regionKey: region.regionKey,
      regionName: region.regionName,
      countryCode: region.countryCode ?? undefined,
      language: region.language || "en",
      device,
      depth,
    }));
  };

  async function runSetupAndPrice() {
    setBusy(true); setError(null);
    try {
      const setupRes = await fetch(`/api/topvisor/projects/${siteId}/setup`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode, externalProjectId: mode === "link" ? linkId : undefined,
          regions: regionsPayload(), keywords: preview.valid, groupName: groupName.trim() || "Основная",
        }),
      });
      const setup = await setupRes.json();
      if (!setupRes.ok) { setError(t(`tvErr_${setup.error}`) || setup.error || t("tvErrGeneric")); return; }
      setRankProjectId(setup.rankProjectId);
      const priceRes = await fetch(`/api/topvisor/projects/${siteId}/price`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const p = await priceRes.json();
      if (priceRes.ok) setPrice({ price: p.price, regionCount: p.regionCount, keywordCount: p.keywordCount });
      setStep(4);
    } catch { setError(t("tvErrGeneric")); }
    finally { setBusy(false); }
  }

  async function finish() {
    setBusy(true); setError(null);
    try {
      if (runCheck && price) {
        if (!window.confirm(t("rtConfirmCheck").replace("{price}", String(price.price)))) { setBusy(false); return; }
        const r = await fetch(`/api/topvisor/projects/${siteId}/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true, confirmedCost: price.price }) });
        if (!r.ok) { const d = await r.json(); setError(t(`tvErr_${d.error}`) || d.error || t("tvErrGeneric")); setBusy(false); return; }
      }
      setDone(true);
      setTimeout(onDone, 700);
    } catch { setError(t("tvErrGeneric")); }
    finally { setBusy(false); }
  }

  const canNext =
    (step === 1 && (mode === "create" || (mode === "link" && !!linkId))) ||
    (step === 2 && !!region && (devices.desktop || devices.mobile)) ||
    (step === 3 && preview.valid.length > 0);

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>{t("rtWizardTitle")}</h2>
          <button onClick={onClose} style={iconBtn}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 16 }}>{siteUrl}</div>

        {/* Steps indicator */}
        <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
          {[1, 2, 3, 4].map((s) => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: s <= step ? "var(--color-accent-blue)" : "var(--color-border)" }} />
          ))}
        </div>

        {done ? (
          <div style={{ padding: "30px 0", textAlign: "center" }}>
            <Check size={40} style={{ color: "#10b981" }} />
            <div style={{ marginTop: 10, fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)" }}>{t("rtSetupDone")}</div>
          </div>
        ) : (
          <>
            {step === 1 && (
              <div>
                <p style={sub}>{t("rtStep1Desc")}</p>
                {candidates.length > 0 && (
                  <label style={optRow}>
                    <input type="radio" checked={mode === "link"} onChange={() => setMode("link")} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{t("rtLinkExisting")}</div>
                      <select value={linkId} onChange={(e) => setLinkId(e.target.value)} style={{ ...input, marginTop: 6 }} disabled={mode !== "link"}>
                        {candidates.map((c) => <option key={c.externalProjectId} value={c.externalProjectId}>{c.name} (#{c.externalProjectId})</option>)}
                      </select>
                    </div>
                  </label>
                )}
                <label style={optRow}>
                  <input type="radio" checked={mode === "create"} onChange={() => setMode("create")} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{t("rtCreateNew")}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{gscProperty}</div>
                  </div>
                </label>
              </div>
            )}

            {step === 2 && (
              <div>
                <p style={sub}>{t("rtStep2Desc")}</p>
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={lbl}>{t("rtCountry")}</label>
                    <input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} placeholder="US" maxLength={2} style={input} />
                  </div>
                  <div>
                    <label style={lbl}>{t("rtRegion")}</label>
                    <input value={region ? region.regionName : regionQuery} onChange={(e) => { setRegion(null); setRegionQuery(e.target.value); }} placeholder={t("rtRegionSearch")} style={input} />
                  </div>
                </div>
                {!region && regionResults.length > 0 && (
                  <div style={{ ...card, maxHeight: 160, overflowY: "auto", padding: 4, marginBottom: 10 }}>
                    {regionResults.map((r) => (
                      <button key={`${r.regionKey}-${r.language}`} onClick={() => { setRegion(r); setRegionResults([]); }} style={regionItem}>
                        {r.regionName} <span style={{ color: "var(--color-text-secondary)" }}>· {r.countryCode ?? ""} {r.type ? `· ${r.type}` : ""}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 20, marginBottom: 12, marginTop: 4 }}>
                  <label style={chk}><input type="checkbox" checked={devices.desktop} onChange={(e) => setDevices((d) => ({ ...d, desktop: e.target.checked }))} /> Desktop</label>
                  <label style={chk}><input type="checkbox" checked={devices.mobile} onChange={(e) => setDevices((d) => ({ ...d, mobile: e.target.checked }))} /> Mobile</label>
                </div>
                <div>
                  <label style={lbl}>{t("rtDepth")}</label>
                  <select value={depth} onChange={(e) => setDepth(Number(e.target.value))} style={input}>
                    {DEPTHS.map((d) => <option key={d} value={d}>Top-{d * 10}</option>)}
                  </select>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <p style={sub}>{t("rtStep3Desc")}</p>
                <label style={lbl}>{t("rtGroup")}</label>
                <input value={groupName} onChange={(e) => setGroupName(e.target.value)} style={{ ...input, marginBottom: 10 }} />
                <label style={lbl}>{t("rtKeywords")}</label>
                <textarea value={kwText} onChange={(e) => setKwText(e.target.value)} rows={7} placeholder={t("rtKeywordsPlaceholder")} style={{ ...input, resize: "vertical", fontFamily: "inherit" }} />
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 6 }}>
                  {t("rtKwValid").replace("{n}", String(preview.valid.length))}
                  {preview.duplicates > 0 && ` · ${t("rtKwDupes").replace("{n}", String(preview.duplicates))}`}
                  {preview.rejected.length > 0 && ` · ${t("rtKwRejected").replace("{n}", String(preview.rejected.length))}`}
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <p style={sub}>{t("rtStep4Desc")}</p>
                <div style={{ ...card, marginBottom: 12 }}>
                  <Line label={t("rtColKeywords")} value={String(price?.keywordCount ?? preview.valid.length)} />
                  <Line label={t("rtColRegion")} value={`${price?.regionCount ?? regionsPayload().length}`} />
                  <Line label={t("rtDepth")} value={`Top-${depth * 10}`} />
                  <div style={{ borderTop: "1px solid var(--color-border)", margin: "8px 0" }} />
                  <Line label={t("rtCost")} value={price ? `${price.price}` : "—"} strong />
                </div>
                <label style={chk}><input type="checkbox" checked={runCheck} onChange={(e) => setRunCheck(e.target.checked)} /> {t("rtRunFirstCheck")}</label>
                {!runCheck && <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 6 }}>{t("rtNoCheckHint")}</div>}
              </div>
            )}

            {error && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, fontSize: 12, color: "#ef4444" }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}

            {/* Nav */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
              <button onClick={() => (step > 1 ? setStep(step - 1) : onClose())} style={navBtn(false)} disabled={busy}>
                <ArrowLeft size={14} /> {step > 1 ? t("rtBack") : t("rtCancel")}
              </button>
              {step < 3 && <button onClick={() => setStep(step + 1)} style={navBtn(true)} disabled={!canNext || busy}>{t("rtNext")} <ArrowRight size={14} /></button>}
              {step === 3 && <button onClick={runSetupAndPrice} style={navBtn(true)} disabled={!canNext || busy}>{busy ? <Loader2 size={14} className="spin" /> : null} {t("rtCreateProject")}</button>}
              {step === 4 && <button onClick={finish} style={navBtn(true)} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : null} {runCheck ? t("rtCreateAndCheck") : t("rtFinish")}</button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: strong ? 15 : 13 }}>
      <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      <span style={{ fontWeight: strong ? 800 : 600, color: "var(--color-text-primary)" }}>{value}</span>
    </div>
  );
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 };
const modal: React.CSSProperties = { background: "var(--color-card)", borderRadius: 14, border: "1px solid var(--color-border)", padding: 22, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto" };
const card: React.CSSProperties = { background: "var(--color-bg)", borderRadius: 8, padding: 12, border: "1px solid var(--color-border)" };
const input: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 8, background: "var(--color-bg)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)", fontSize: 13, outline: "none", boxSizing: "border-box" };
const sub: React.CSSProperties = { fontSize: 13, color: "var(--color-text-secondary)", marginTop: 0, marginBottom: 14 };
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 5 };
const optRow: React.CSSProperties = { display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 8, marginBottom: 8, cursor: "pointer" };
const chk: React.CSSProperties = { display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--color-text-primary)", cursor: "pointer" };
const regionItem: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", padding: "8px 10px", background: "transparent", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, color: "var(--color-text-primary)" };
const iconBtn: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", display: "flex" };
function navBtn(primary: boolean): React.CSSProperties {
  return { display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid var(--color-border)", background: primary ? "var(--color-accent-blue)" : "transparent", color: primary ? "#fff" : "var(--color-text-secondary)" };
}
