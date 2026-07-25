"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { TrendingUp, Globe, Shield, Moon, Sun, Lock } from "lucide-react";
import { useTheme } from "@/lib/ThemeContext";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.548 0 9s.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

const content = {
  en: {
    tagline: "Command center",
    highlight: "22group",
    tagline2: "",
    sub: "All your Google accounts, all your sites — one clean dashboard. No limits, no noise, no subscription.",
    features: [
      { title: "All accounts in one place", desc: "Connect multiple Google accounts and see all your GSC properties on a single dashboard." },
      { title: "Traffic at a glance", desc: "Sparkline charts for every site. Instantly spot winners, drops, and trends." },
      { title: "Your data, your server", desc: "Self-hosted. Your Search Console data never leaves your VPS." },
    ],
    getStarted: "Get started",
    signInSub: "Sign in with your Google account. The first account becomes the owner of this dashboard.",
    signIn: "Sign in with Google",
    bullets: ["Google OAuth only — no passwords", "Connect multiple Google accounts", "Self-hosted on your VPS"],
    gatePlaceholder: "Access password",
    gateHint: "Enter the access password to enable sign-in",
    gateOk: "Access granted — you can sign in",
  },
  ru: {
    tagline: "Командный центр",
    highlight: "22group",
    tagline2: "",
    sub: "Все Google аккаунты, все сайты — одна чистая панель. Без лимитов, без шума, без подписки.",
    features: [
      { title: "Все аккаунты в одном месте", desc: "Подключи несколько Google аккаунтов и смотри все GSC-сайты на одном экране." },
      { title: "Трафик с первого взгляда", desc: "Мини-графики для каждого сайта. Сразу видно рост, падения и тренды." },
      { title: "Твои данные, твой сервер", desc: "Self-hosted. Данные Search Console никуда не уходят с твоего VPS." },
    ],
    getStarted: "Войти",
    signInSub: "Войди через Google аккаунт. Первый аккаунт становится владельцем этого дашборда.",
    signIn: "Войти через Google",
    bullets: ["Только Google OAuth — никаких паролей", "Можно подключить несколько аккаунтов", "Self-hosted на вашем VPS"],
    gatePlaceholder: "Пароль доступа",
    gateHint: "Введите пароль доступа, чтобы включить вход",
    gateOk: "Доступ разрешён — можно входить",
  },
};

const featureIcons = [
  <Globe size={18} key="globe" />,
  <TrendingUp size={18} key="trend" />,
  <Shield size={18} key="shield" />,
];

// 22group burgundy accent — scoped to the login page via a CSS-variable override
// on the root element (see below), so the rest of the app is unaffected.
const BURGUNDY = "#A31D45";

// Soft access gate: the Google button only unlocks when this code is typed.
// NOTE: a client-side check is a deterrent, NOT real security — the value ships in
// the JS bundle and the OAuth endpoint could be hit directly. For real protection
// put nginx Basic Auth / Cloudflare Access in front of the whole site.
const ACCESS_CODE = "moneynosleep";

export default function LoginPage() {
  const { dark, setDark } = useTheme();
  const { language, setLanguage } = useLanguage();
  const c = content[language];
  const [gate, setGate] = useState("");
  const unlocked = gate === ACCESS_CODE;

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      background: "var(--color-bg)",
      overflow: "hidden",
      position: "relative",
      // Burgundy accent, login page only — overrides the global purple var here.
      ["--color-accent-purple" as never]: BURGUNDY,
    }}>
      {/* ── Top-right controls ── */}
      <div style={{
        position: "fixed", top: "16px", right: "20px",
        display: "flex", alignItems: "center", gap: "8px",
        zIndex: 10,
      }}>
        {/* Language toggle */}
        <div style={{
          display: "flex", alignItems: "center",
          background: "var(--color-card)",
          border: "1px solid var(--color-border)",
          borderRadius: "8px", overflow: "hidden",
        }}>
          {(["en", "ru"] as const).map(lang => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              style={{
                padding: "6px 12px",
                fontSize: "12px", fontWeight: 600,
                border: "none", cursor: "pointer",
                background: language === lang ? "var(--color-accent-purple)" : "transparent",
                color: language === lang ? "#fff" : "var(--color-text-secondary)",
                transition: "all 0.15s",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {lang}
            </button>
          ))}
        </div>

        {/* Theme toggle */}
        <button
          onClick={() => setDark(!dark)}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "6px 12px",
            background: "var(--color-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "8px",
            fontSize: "12px", fontWeight: 600,
            color: "var(--color-text-secondary)",
            cursor: "pointer", transition: "all 0.15s",
          }}
          onMouseOver={e => e.currentTarget.style.borderColor = "var(--color-accent-purple)"}
          onMouseOut={e => e.currentTarget.style.borderColor = "var(--color-border)"}
        >
          {dark
            ? <><Sun size={13} /> Light</>
            : <><Moon size={13} /> Dark</>}
        </button>
      </div>

      {/* ── Left panel ── */}
      <div style={{
        flex: "1 1 55%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "60px 64px",
        position: "relative",
      }}>
        {/* Background glow */}
        <div style={{
          position: "absolute", top: "10%", left: "-10%",
          width: "500px", height: "500px", borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(163,29,69,0.22) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* Logo */}
        <div style={{ marginBottom: "56px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="OpenGSC" height={36} style={{ display: "block" }} />
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: "48px", fontWeight: 800, lineHeight: 1.1,
          letterSpacing: "-0.04em", color: "var(--color-text-primary)",
          marginBottom: "20px", maxWidth: "480px",
        }}>
          {c.tagline}<br />
          <span style={{ color: "var(--color-accent-purple)" }}>{c.highlight}</span>
          {c.tagline2 ? <><br />{c.tagline2}</> : null}
        </h1>
        <p style={{
          fontSize: "16px", color: "var(--color-text-secondary)",
          lineHeight: 1.7, marginBottom: "48px", maxWidth: "400px",
        }}>
          {c.sub}
        </p>

        {/* Features */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "420px" }}>
          {c.features.map((f, i) => (
            <div key={f.title} style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
              <div style={{
                flexShrink: 0, width: "36px", height: "36px", borderRadius: "9px",
                background: "rgba(163,29,69,0.14)",
                border: "1px solid rgba(163,29,69,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--color-accent-purple)",
              }}>
                {featureIcons[i]}
              </div>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "2px" }}>
                  {f.title}
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
                  {f.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{
        flex: "0 0 420px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 48px",
        borderLeft: "1px solid var(--color-border)",
        background: "var(--color-card)",
        position: "relative",
      }}>
        <div style={{ width: "100%", maxWidth: "320px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "8px" }}>
            {c.getStarted}
          </h2>
          <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "32px", lineHeight: 1.6 }}>
            {c.signInSub}
          </p>

          <button
            onClick={() => { if (unlocked) signIn("google", { callbackUrl: "/" }); }}
            disabled={!unlocked}
            title={unlocked ? "" : c.gateHint}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "12px",
              width: "100%", padding: "14px 20px",
              borderRadius: "10px",
              background: unlocked ? "#fff" : "var(--color-card)",
              color: unlocked ? "#1f2937" : "var(--color-text-secondary)",
              fontSize: "15px", fontWeight: 600,
              border: unlocked ? "none" : "1px solid var(--color-border)",
              cursor: unlocked ? "pointer" : "not-allowed",
              opacity: unlocked ? 1 : 0.55,
              boxShadow: unlocked ? "0 2px 8px rgba(0,0,0,0.2)" : "none",
              transition: "box-shadow 0.2s, transform 0.15s, opacity 0.15s",
            }}
            onMouseOver={e => {
              if (!unlocked) return;
              e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.3)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseOut={e => {
              if (!unlocked) return;
              e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <GoogleIcon />
            {c.signIn}
          </button>

          {/* Access gate — Google sign-in stays disabled until the password matches */}
          <div style={{ marginTop: "14px", position: "relative" }}>
            <Lock size={14} style={{ position: "absolute", left: "12px", top: "20px", transform: "translateY(-50%)", color: "var(--color-text-secondary)", pointerEvents: "none" }} />
            <input
              type="password"
              value={gate}
              onChange={e => setGate(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && unlocked) signIn("google", { callbackUrl: "/" }); }}
              placeholder={c.gatePlaceholder}
              autoComplete="off"
              style={{
                width: "100%", padding: "11px 14px 11px 36px",
                borderRadius: "10px",
                background: "var(--color-bg)",
                color: "var(--color-text-primary)",
                fontSize: "14px",
                border: `1px solid ${gate.length === 0 ? "var(--color-border)" : unlocked ? "var(--color-accent-purple)" : "rgba(239,68,68,0.55)"}`,
                outline: "none",
                transition: "border-color 0.15s",
                boxSizing: "border-box",
              }}
            />
            <div style={{ fontSize: "11px", color: unlocked ? "var(--color-accent-green)" : "var(--color-text-secondary)", marginTop: "6px" }}>
              {unlocked ? c.gateOk : c.gateHint}
            </div>
          </div>

          <div style={{ margin: "28px 0", height: "1px", background: "var(--color-border)" }} />

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {c.bullets.map(item => (
              <div key={item} style={{ fontSize: "12px", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: "var(--color-accent-green)", fontSize: "14px" }}>✓</span>
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
