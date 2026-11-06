import Link from "next/link";
import { Brand, ThemeToggle } from "../components/Brand.js";

export const metadata = { title: "Page not found · PrimaHunt" };

export default function NotFound() {
  return (
    <>
      <header className="top"><Brand /><div className="acts"><ThemeToggle /></div></header>
      <main style={{ paddingTop: 40 }}>
        <section className="plate"><div className="stripe" /><div className="in" style={{ textAlign: "center", padding: "36px 22px" }}>
          <div style={{ fontSize: 54, lineHeight: 1 }} aria-hidden="true">🔎</div>
          <div className="eyebrow" style={{ marginTop: 14 }}>Error 404</div>
          <h1 style={{ margin: "10px 0 12px" }}>Nothing to find here</h1>
          <p className="muted" style={{ margin: "0 auto 22px", maxWidth: 340 }}>This page doesn't exist, or the link was copied wrong. If someone sent you an invite, ask them for a fresh link.</p>
          <Link className="btn block" href="/">Back to PrimaHunt</Link>
        </div></section>
      </main>
    </>
  );
}
