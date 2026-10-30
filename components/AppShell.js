"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useApp } from "./Providers.js";
import { Avatar, Empty, RoleBadge, Skel } from "./ui.js";
import { colorFor } from "../lib/client.js";

const OWNER_TABS = [["", "Overview"], ["review", "Review"], ["challenges", "Challenges"], ["subs", "Submissions"], ["players", "Players"], ["invite", "Invite"], ["ranks", "Leaderboard"], ["weeks", "Past weeks"], ["prize", "Prize"], ["audit", "Log"], ["settings", "Settings"]];
const PLAYER_TABS = [["", "Home"], ["hunt", "Hunt"], ["ranks", "Leaderboard"], ["mine", "My submissions"], ["weeks", "Past weeks"], ["people", "Players"]];

export default function AppShell({ children }) {
  const { me, ready, groups, refreshGroups, unread } = useApp();
  const router = useRouter();
  const path = usePathname();
  const m = path.match(/^\/g\/(\d+)(?:\/([^/]*))?/);
  const gid = m ? m[1] : null;
  const sub = m ? m[2] || "" : "";
  const g = gid && groups ? groups.find((x) => String(x.id) === gid) : null;

  useEffect(() => { if (ready && !me) router.replace("/login?next=" + encodeURIComponent(path)); }, [ready, me, path, router]);
  useEffect(() => { if (me && (path === "/" || gid || groups === null)) refreshGroups(); }, [me, path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const c = g ? colorFor(g.id) : "";
    if (c) document.documentElement.style.setProperty("--gc", c); else document.documentElement.style.removeProperty("--gc");
    return () => document.documentElement.style.removeProperty("--gc");
  }, [g]);

  if (!ready || !me) return <div className="auth"><Skel /></div>;

  const owner = g?.role === "owner";
  const tabs = owner ? OWNER_TABS : PLAYER_TABS;
  const dot = (n) => (n ? <span className="dot">{n > 9 ? "9+" : n}</span> : null);
  const A = ({ href, icon, label, on, badge }) => <Link href={href} className={on ? "on" : ""}><span className="ic">{icon}</span>{label}{badge}</Link>;

  return (
    <>
      <header className="top">
        <Link className="logo" href="/" style={{ textDecoration: "none", color: "inherit" }}>🎯 WEEKLY HUNT</Link>
        <div className="who"><Link href="/profile" style={{ textDecoration: "none" }}><span>{me.nickname}</span></Link></div>
      </header>
      <main id="view">
        {gid && g ? (
          <>
            <section className="ghead" style={{ "--gc": colorFor(g.id) }}>
              <Avatar g={g} />
              <div className="grow">
                <div className="gname">{g.name}</div>
                <div className="gmeta"><RoleBadge g={g} /> {g.challenge?.week_number ? `· Week ${String(g.challenge.week_number).padStart(2, "0")}` : ""} · {g.members} player{g.members === 1 ? "" : "s"}</div>
              </div>
              <select aria-label="Switch group" value={g.id} onChange={(e) => router.push(e.target.value ? "/g/" + e.target.value : "/")}>
                {groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                <option value="">All groups…</option>
              </select>
            </section>
            <div className="tabs">
              {tabs.map(([k, l]) => (
                <Link key={k} className={"tab" + (sub === k || (k === "challenges" && (sub === "challenge" || sub === "preview")) || (k === "weeks" && sub === "week") ? " on" : "")} href={`/g/${g.id}${k ? "/" + k : ""}`}>
                  {l}{k === "review" && g.pending ? <span className="n">{g.pending}</span> : null}
                </Link>
              ))}
            </div>
          </>
        ) : null}
        <div className="stack" style={{ gap: 16, marginTop: gid ? 16 : 0 }}>
          {gid && groups && !g ? <Empty icon="🔒" title="You don't have access to this group" text="Ask the group admin for an invite link."><Link className="btn" href="/">My groups</Link></Empty>
            : gid && !groups ? <Skel /> : children}
        </div>
      </main>
      <nav className="nav">
        {g ? (
          <>
            <A href={`/g/${g.id}`} icon="🏠" label={owner ? "Overview" : "Home"} on={sub === ""} />
            {owner ? <A href={`/g/${g.id}/review`} icon="📥" label="Review" on={sub === "review"} badge={dot(g.pending)} /> : <A href={`/g/${g.id}/hunt`} icon="📷" label="Hunt" on={sub === "hunt"} />}
            <A href={`/g/${g.id}/ranks`} icon="🏆" label="Ranks" on={sub === "ranks"} />
            <A href="/alerts" icon="🔔" label="Alerts" on={false} badge={dot(unread)} />
            <A href="/" icon="👥" label="Groups" on={false} />
          </>
        ) : (
          <>
            <A href="/" icon="👥" label="My groups" on={path === "/"} />
            <A href="/alerts" icon="🔔" label="Alerts" on={path === "/alerts"} badge={dot(unread)} />
            <A href="/profile" icon="🙂" label="Profile" on={path === "/profile"} />
          </>
        )}
      </nav>
    </>
  );
}
