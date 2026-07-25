"use client";

// Settings → Integrations → Topvisor. Connects the user's Topvisor account:
// stores the API key server-side (AES-256-GCM), tests the connection, disconnects.
// The API key is write-only from the browser's perspective — it is sent on Save and
// never read back (the server returns only masked status).

import { useEffect, useState } from "react";
import { Target, CheckCircle, AlertCircle, Loader2, Trash2, Eye, EyeOff } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

interface ConnState {
  enabled?: boolean;
  encryptionReady?: boolean;
  connected: boolean;
  apiUserId: string | null;
  keyMasked: string | null;
  status: string;
  lastVerifiedAt: string | null;
  lastError: string | null;
}

const card: React.CSSProperties = {
  background: "var(--color-card)",
  borderRadius: "12px",
  padding: "20px",
  border: "1px solid var(--color-border)",
};
const label: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--color-text-secondary)",
  marginBottom: "6px",
  display: "block",
};
const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  background: "var(--color-bg)",
  color: "var(--color-text-primary)",
  border: "1px solid var(--color-border)",
  fontSize: "14px",
  outline: "none",
  boxSizing: "border-box",
};

export default function TopvisorSettings() {
  const { t } = useLanguage();
  const [state, setState] = useState<ConnState | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "test" | "delete">(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const err = (code: string | null | undefined): string => {
    if (!code) return "";
    const map: Record<string, string> = {
      TOPVISOR_AUTH_FAILED: t("tvErrAuth"),
      TOPVISOR_INSUFFICIENT_BALANCE: t("tvErrBalance"),
      TOPVISOR_RATE_LIMITED: t("tvErrRate"),
      TOPVISOR_UNAVAILABLE: t("tvErrUnavailable"),
      TOPVISOR_TIMEOUT: t("tvErrUnavailable"),
    };
    return map[code] || t("tvErrGeneric");
  };

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/topvisor/connection");
      const d: ConnState = await r.json();
      setState(d);
      if (d.apiUserId) setUserId(d.apiUserId);
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    setMsg(null);
    if (!/^\d+$/.test(userId.trim())) return setMsg({ ok: false, text: t("tvErrUserId") });
    if (apiKey.trim().length < 8) return setMsg({ ok: false, text: t("tvErrKeyReq") });
    setBusy("save");
    try {
      const r = await fetch("/api/topvisor/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiUserId: userId.trim(), apiKey: apiKey.trim() }),
      });
      const d = await r.json();
      if (!r.ok) {
        setMsg({ ok: false, text: d?.error === "TOPVISOR_ENCRYPTION_NOT_CONFIGURED" ? t("tvEncNotReady") : t("tvErrGeneric") });
      } else {
        setState(d);
        setApiKey("");
        setMsg(
          d.status === "connected"
            ? { ok: true, text: t("tvSaved") }
            : { ok: false, text: `${t("tvVerifyFailed")} — ${err(d.lastError)}` },
        );
      }
    } catch {
      setMsg({ ok: false, text: t("tvErrGeneric") });
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setMsg(null);
    setBusy("test");
    try {
      const r = await fetch("/api/topvisor/connection/test", { method: "POST" });
      const d = await r.json();
      if (r.ok) {
        setState(d);
        setMsg(d.status === "connected" ? { ok: true, text: t("tvConnected") } : { ok: false, text: err(d.lastError) });
      } else {
        setMsg({ ok: false, text: err(d?.error) });
      }
    } catch {
      setMsg({ ok: false, text: t("tvErrGeneric") });
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!window.confirm(t("tvDeleteConfirm"))) return;
    setBusy("delete");
    setMsg(null);
    try {
      await fetch("/api/topvisor/connection", { method: "DELETE" });
      setApiKey("");
      await load();
      setMsg({ ok: true, text: t("tvDeleted") });
    } catch {
      setMsg({ ok: false, text: t("tvErrGeneric") });
    } finally {
      setBusy(null);
    }
  }

  const connected = state?.connected;
  const hasStored = !!state?.apiUserId;
  const encReady = state?.encryptionReady !== false;

  return (
    <SectionShell>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "7px",
            background: "rgba(163,29,69,0.12)",
            border: "1px solid rgba(163,29,69,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#c0345a",
          }}
        >
          <Target size={17} />
        </div>
        <div>
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
            {t("tvTitle")}
          </h2>
          <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", margin: "2px 0 0" }}>
            {t("tvDesc")}{" "}
            <a href="https://topvisor.com/api/" target="_blank" rel="noreferrer" style={{ color: "var(--color-accent-blue)" }}>
              topvisor.com/api
            </a>
          </p>
        </div>
      </div>

      {!encReady && (
        <div
          style={{
            ...card,
            marginBottom: "14px",
            borderColor: "rgba(245,158,11,0.4)",
            background: "rgba(245,158,11,0.08)",
            display: "flex",
            gap: "10px",
            alignItems: "flex-start",
          }}
        >
          <AlertCircle size={16} style={{ color: "#f59e0b", flexShrink: 0, marginTop: "1px" }} />
          <div style={{ fontSize: "13px", color: "var(--color-text-primary)" }}>{t("tvEncNotReady")}</div>
        </div>
      )}

      {loading ? (
        <div style={{ ...card, display: "flex", alignItems: "center", gap: "8px", color: "var(--color-text-secondary)" }}>
          <Loader2 size={15} className="spin" /> {t("tvLoading")}
        </div>
      ) : (
        <div style={card}>
          {/* Status row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "18px",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {connected ? (
                <CheckCircle size={16} style={{ color: "#10b981" }} />
              ) : (
                <AlertCircle size={16} style={{ color: hasStored ? "#ef4444" : "var(--color-text-secondary)" }} />
              )}
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                {connected ? t("tvConnected") : hasStored ? t("tvStatusError") : t("tvNotConnected")}
              </span>
            </div>
            {state?.lastVerifiedAt && (
              <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                {t("tvLastVerified")}: {new Date(state.lastVerifiedAt).toLocaleString()}
              </span>
            )}
          </div>

          {hasStored && state?.lastError && !connected && (
            <div style={{ fontSize: "12px", color: "#ef4444", marginBottom: "14px" }}>
              {t("tvLastError")}: {err(state.lastError)}
            </div>
          )}

          {/* Fields */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "14px", marginBottom: "16px" }}>
            <div>
              <label style={label}>{t("tvUserId")}</label>
              <input
                style={input}
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="376374"
                inputMode="numeric"
                disabled={!encReady}
              />
            </div>
            <div>
              <label style={label}>{t("tvApiKey")}</label>
              <div style={{ position: "relative" }}>
                <input
                  style={{ ...input, paddingRight: "38px" }}
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={hasStored ? (state?.keyMasked ?? "••••••••") : t("tvApiKeyPlaceholder")}
                  autoComplete="off"
                  disabled={!encReady}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  style={{
                    position: "absolute",
                    right: "8px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--color-text-secondary)",
                    display: "flex",
                  }}
                  aria-label={showKey ? t("tvHideKey") : t("tvShowKey")}
                >
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button onClick={save} disabled={!encReady || busy !== null} style={btn("primary", busy === "save" || !encReady)}>
              {busy === "save" ? <Loader2 size={14} className="spin" /> : null} {t("tvSave")}
            </button>
            <button onClick={test} disabled={!hasStored || busy !== null} style={btn("secondary", busy === "test" || !hasStored)}>
              {busy === "test" ? <Loader2 size={14} className="spin" /> : null} {t("tvTest")}
            </button>
            {hasStored && (
              <button onClick={disconnect} disabled={busy !== null} style={btn("danger", busy === "delete")}>
                {busy === "delete" ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />} {t("tvDelete")}
              </button>
            )}
          </div>

          {msg && (
            <div style={{ marginTop: "12px", fontSize: "13px", color: msg.ok ? "#10b981" : "#ef4444" }}>{msg.text}</div>
          )}
        </div>
      )}
    </SectionShell>
  );
}

function SectionShell({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

function btn(kind: "primary" | "secondary" | "danger", disabled: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "9px 16px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    transition: "opacity 0.15s",
    border: "1px solid transparent",
  };
  if (kind === "primary") return { ...base, background: "var(--color-accent-blue)", color: "#fff" };
  if (kind === "danger")
    return { ...base, background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" };
  return { ...base, background: "var(--color-bg)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" };
}
