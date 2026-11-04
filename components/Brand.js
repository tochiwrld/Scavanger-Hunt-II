"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { isLight, toggleTheme } from "../lib/client.js";
import Icon from "./icons.js";

export function Brand({ href = "/" }) {
  return (
    <Link className="brand" href={href} aria-label="PrimaHunt home">
      <span className="mk">P</span>
      <span className="wm">PRIMA<em>HUNT</em></span>
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
