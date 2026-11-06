"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { isLight, toggleTheme } from "../lib/client.js";
import Icon from "./icons.js";

/** App mark: brand-colour rounded square, bold P, viewfinder corners framing it. */
export function Mark({ size = 34 }) {
  return (
    <svg className="mk" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="var(--primary)" />
      <g fill="none" stroke="var(--primary-fg)" strokeWidth="4" strokeLinecap="round">
        <path d="M11 22V12h10M43 12h10v10M53 42v10H43M21 52H11V42" />
      </g>
      <text x="32" y="44" textAnchor="middle" fontFamily="var(--font-head)" fontWeight="800" fontSize="34" fill="var(--primary-fg)">P</text>
    </svg>
  );
}

/** Wordmark "PrimaHunt": "Prima" in the text colour, "Hunt" in the brand colour; the dot on the i is a target pin. */
export function Wordmark() {
  return (
    <span className="wm" aria-label="PrimaHunt">
      <span aria-hidden="true">Pr<span className="idot">ı<svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="6" cy="6" r="1.7" fill="currentColor" /></svg></span>ma<em>Hunt</em></span>
    </span>
  );
}

export function Brand({ href = "/" }) {
  return (
    <Link className="brand" href={href} aria-label="PrimaHunt home">
      <Mark />
      <Wordmark />
    </Link>
  );
}

export function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => setLight(isLight()), []);
  return (
    <button type="button" className="icon-btn" onClick={() => setLight(toggleTheme())} aria-label={light ? "Switch to dark mode" : "Switch to light mode"}>
      <Icon n={light ? "moon" : "sun"} size={19} />
    </button>
  );
}
