"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useApp } from "./Providers.js";
import { Brand, ThemeToggle } from "./Brand.js";
import Icon from "./icons.js";
import { Avatar, Empty, RoleBadge, Skel } from "./ui.js";
import { colorFor, pad2 } from "../lib/client.js";
import ConsentGate from "./Consent.js";

const OWNER_TABS = [["", "Overview"], ["feed", "Feed"], ["review", "Review"], ["challenges", "Challenges"], ["subs", "Submissions"], ["players", "Players"], ["invite", "Invite"], ["ranks", "Leaderboard"], ["weeks", "Past weeks"], ["prize", "Prize"], ["audit", "Log"], ["settings", "Settings"]];
const PLAYER_TABS = [["", "Home"], ["hunt", "Hunt"], ["feed", "Feed"], ["ranks", "Leaderboard"], ["mine", "My submissions"], ["weeks", "Past weeks"], ["people", "Players"]];

export default function AppShell({ children }) {
  const { me, ready, groups, refreshGroups, unread } = useApp();
  const router = useRouter();
  const path = usePathname();
  const m = path.match(/^\/g\/(\d+)(?:\/([^/]*))?/);
  const gid = m ? m[1] : null;
  const sub = m ? m[2] || "" : "";
  const g = gid && groups ? groups.find((x) => String(x.id) === gid) : null;

  useEffect(() => { if (ready && !me) router.replace("/login?next=" + encodeURIComponent(path)); }, [ready, me, path, router]);
  useEffect(() => { if (me?.privacy_ok && (path === "/" || gid || groups === null)) refreshGroups(); }, [me, path]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready || !me) return <main style={{ paddingTop: 80 }}><Skel /></main>;
  if (!me.privacy_ok) return <ConsentGate />;

  const owner = g?.role === "owner";
  const tabs = owner ? OWNER_TABS : PLAYER_TABS;
  const dot = (n) => (n ? <span className="dot">{n > 9 ? "9+" : n}</span> : null);
  const A = ({ href, icon, label, on, badge }) => <Link href={href} className={on ? "on" : ""} aria-current={on ? "page" : undefined}><Icon n={icon} size={21} />{label}{badge}</Link>;

  return (
    <>
      <header className="top">
        <div className="row" style={{ gap: 10 }}>
          <Brand />
          {owner ? <span className="admin-tag">Admin</span> : null}
        </div>
        <div className="acts">
          <Link href="/alerts" className="icon-btn" aria-label={unread ? `Alerts, ${unread} unread` : "Alerts"}><Icon n="bell" size={19} />{dot(unread)}</Link>
          <ThemeToggle />
          <Link href="/profile" className="icon-btn" aria-label={`Profile: ${me.nickname}`}><Icon n="user" size={19} /></Link>
        </div>
      </header>
      <main id="view">
        {gid && g ? (
          <>
            <section className="ghead" style={{ "--gc": colorFor(g.id) }}>
              <Avatar g={g} />
              <div className="grow">
                <div className="gname">{g.name}</div>
                <div className="gmeta"><RoleBadge g={g} />{g.challenge?.week_number ? <span>Week {pad2(g.challenge.week_number)}</span> : null}<span>· {g.members} player{g.members === 1 ? "" : "s"}</span></div>
              </div>
              <select aria-label="Switch hunt" value={g.id} onChange={(e) => router.push(e.target.value ? "/g/" + e.target.value : "/")}>
                {groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                <option value="">All hunts…</option>
              </select>
            </section>
            <nav className="tabs" aria-label="Hunt sections">
              {tabs.map(([k, l]) => (
                <Link key={k} className={"tab" + (sub === k || (k === "challenges" && (sub === "challenge" || sub === "preview")) || (k === "weeks" && sub === "week") ? " on" : "")} href={`/g/${g.id}${k ? "/" + k : ""}`}>
                  {l}{k === "review" && g.pending ? <span className="n hot">{g.pending}</span> : null}
                </Link>
              ))}
            </nav>
          </>
        ) : null}
        {gid && groups && !g ? <Empty icon="🔒" title="You don't have access to this hunt" text="Ask the hunt admin for an invite link."><Link className="btn" href="/">My hunts</Link></Empty>
          : gid && !groups ? <Skel /> : children}
      </main>
      <nav className="nav" aria-label="Main">
        {g ? (
          <>
            <A href={`/g/${g.id}`} icon={owner ? "grid" : "home"} label={owner ? "Overview" : "Home"} on={sub === ""} />
            {owner ? <A href={`/g/${g.id}/review`} icon="inbox" label="Review" on={sub === "review"} badge={dot(g.pending)} /> : <A href={`/g/${g.id}/hunt`} icon="hunt" label="Hunt" on={sub === "hunt"} />}
            <A href={`/g/${g.id}/feed`} icon="chat" label="Feed" on={sub === "feed"} />
            <A href={`/g/${g.id}/ranks`} icon="trophy" label="Ranks" on={sub === "ranks"} />
            <A href="/" icon="users" label="Hunts" on={false} />
          </>
        ) : (
          <>
            <A href="/" icon="users" label="Hunts" on={path === "/"} />
            <A href="/duels" icon="swords" label="1v1" on={path.startsWith("/duel")} />
            <A href="/join" icon="key" label="Join" on={path === "/join"} />
            <A href="/profile" icon="user" label="Profile" on={path === "/profile"} />
          </>
        )}
      </nav>
    </>
  );
}
