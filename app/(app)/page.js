"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, colorFor, fmtDate, naira } from "../../lib/client.js";
import { useApp } from "../../components/Providers.js";
import { Avatar, Btn, Empty, RoleBadge, Skel } from "../../components/ui.js";
import Icon from "../../components/icons.js";
import GlobalSearch from "../../components/GlobalSearch.js";
import BecomeAdmin from "../../components/BecomeAdmin.js";
import ActiveHunts from "../../components/ActiveHunts.js";

export default function GroupsHome() {
  const { me, groups, setMe, toast } = useApp();
  const router = useRouter();
  const [busy] = useState(false);
  const [ask, setAsk] = useState(false);
  if (!groups) return <Skel />;
  const phase = (c) => (!c ? "No challenge yet" : c.phase === "active" ? "Live now" : c.phase === "upcoming" ? "Starts " + fmtDate(c.start_at) : "Week finished");
  const becomeAdmin = () => setAsk(true);
  return (
    <>
      <ActiveHunts />
      <div className="page-head"><h1>My hunts</h1><p>Each hunt has its own players, weekly challenges and leaderboard.</p></div>
      {groups.length ? groups.map((g) => (
        <Link key={g.id} href={`/g/${g.id}`} className="card gcard" style={{ "--gc": colorFor(g.id) }}>
          <Avatar g={g} />
          <div className="grow">
            <div className="row between"><h3>{g.name}</h3><RoleBadge g={g} /></div>
            <div className="muted">{g.challenge ? `${g.challenge.week_number ? "Week " + String(g.challenge.week_number).padStart(2, "0") + ": " : ""}${g.challenge.title} · ${phase(g.challenge)}` : "No challenge yet"}</div>
            <div className="muted">{g.members} player{g.members === 1 ? "" : "s"}</div>
            {g.role === "player" && g.my_rank ? <div className="rankline">#{g.my_rank} · {g.my_points} pts</div> : null}
            {g.role === "owner" ? (
              <div className="row wrap" style={{ marginTop: 6, gap: 6 }}>
                {g.pending ? <span className="st pending">{g.pending} to review</span> : <span className="st approved">All reviewed</span>}
                {g.leader ? <span className="chip"><Icon n="crown" size={13} />{g.leader}</span> : null}
                {g.prize ? <span className="chip">{naira(g.prize.amount)} {g.prize.status === "paid" ? "paid" : "pending"}</span> : null}
              </div>
            ) : null}
          </div>
        </Link>
      )) : <Empty icon="🎯" title="You're not in a hunt yet" text="Join one with an invitation link, or create your own." />}
      <Link className="btn block" href="/join"><Icon n="key" size={18} />Join {groups.length ? "another" : "a"} hunt</Link>
      {me.can_create_groups ? <Link className="btn block ghost" href="/groups/new"><Icon n="plus" size={18} />Create a hunt</Link> : <Btn busy={busy} className="block ghost" onClick={becomeAdmin}><Icon n="shield" size={18} />Run your own hunt? Become an admin</Btn>}
      <Link href="/duels" className="plate" style={{ textDecoration: "none", color: "inherit", marginTop: 14 }}>
        <div className="stripe" />
        <div className="in row" style={{ gap: 16, alignItems: "flex-start" }}>
          <span style={{ width: 50, height: 50, borderRadius: 14, background: "var(--primary)", color: "var(--primary-fg)", display: "grid", placeItems: "center", flex: "none" }}><Icon n="swords" size={24} /></span>
          <div className="grow">
            <div className="eyebrow">New</div>
            <h2 style={{ margin: "6px 0 8px", fontSize: 26 }}>1v1</h2>
            <p className="muted" style={{ margin: 0 }}>Send a friend a private link. You each write a list for the other to find, and the clock starts when you're both done.</p>
          </div>
          <Icon n="arrow" size={20} className="c-mute" />
        </div>
      </Link>
      <GlobalSearch />
      {ask ? <BecomeAdmin onClose={() => setAsk(false)} onDone={() => router.push("/groups/new")} /> : null}
    </>
  );
}
