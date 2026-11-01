"use client";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ago, api, pad2 } from "../../../../../lib/client.js";
import FindPost from "../../../../../components/FindPost.js";
import { useApp } from "../../../../../components/Providers.js";
import Icon from "../../../../../components/icons.js";
import { Btn, Empty, Skel } from "../../../../../components/ui.js";

export default function Page() {
  const { gid } = useParams();
  const { groups } = useApp();
  const g = groups?.find((x) => String(x.id) === gid);
  const [posts, setPosts] = useState(null);
  const [more, setMore] = useState(false);
  const [next, setNext] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (offset = 0) => {
    setBusy(true); setErr("");
    try {
      const d = await api(`/groups/${gid}/feed?offset=${offset}`);
      setPosts((p) => (offset && p ? [...p, ...d.posts] : d.posts));
      setMore(d.more); setNext(d.next_offset); setNow(d.now);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }, [gid]);
  useEffect(() => { load(0); }, [load]);
  useEffect(() => { const f = () => load(0); window.addEventListener("hunt:refresh", f); return () => window.removeEventListener("hunt:refresh", f); }, [load]);

  const update = (id, fn) => setPosts((ps) => ps.map((p) => (p.id === id ? fn(p) : p)));
  const drop = (id) => setPosts((ps) => ps.filter((p) => p.id !== id));

  return (
    <>
      <div className="page-head"><h1>Feed</h1><p>Approved finds from {g ? g.name : "your group"}. Only members of this group can see them.</p></div>
      {err ? <Empty icon="😵" title="Couldn't load the feed" text={err}><button className="btn" onClick={() => load(0)}>Try again</button></Empty>
        : posts === null ? <Skel />
        : posts.length ? (
          <>
            {posts.map((p) => <Post key={p.id} gid={gid} p={p} now={now} onChange={(fn) => update(p.id, fn)} onRemoved={() => drop(p.id)} />)}
            {more ? <Btn busy={busy} className="block ghost" onClick={() => load(next)}>Load older finds</Btn> : <p className="muted" style={{ textAlign: "center", margin: "4px 0 0" }}>That's everything so far.</p>}
          </>
        ) : <Empty icon="📸" title="No finds yet" text="When the admin approves a submission, its photos show up here for everyone in the group to see and comment on." />}
    </>
  );
}

function Post({ gid, p, now, onChange, onRemoved }) {
  const { toast } = useApp();
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const send = async (e) => {
    e.preventDefault();
    const body = msg.trim();
    if (!body) return;
    setSending(true);
    try {
      const r = await api(`/groups/${gid}/feed/${p.id}/comments`, { method: "POST", json: { body } });
      onChange((x) => ({ ...x, comments: [...x.comments, r.comment] }));
      setMsg("");
    } catch (ex) { toast(ex.message, "bad"); } finally { setSending(false); }
  };
  const del = async (c) => {
    try { await api(`/groups/${gid}/comments/${c.id}`, { method: "DELETE" }); onChange((x) => ({ ...x, comments: x.comments.filter((y) => y.id !== c.id) })); }
    catch (ex) { toast(ex.message, "bad"); }
  };
  const remove = async () => {
    if (!confirm(p.mine ? "Take your find off the feed? Your points stay." : `Take ${p.nickname}'s find off the feed? Their points stay.`)) return;
    try { await api(`/groups/${gid}/feed/${p.id}/remove`, { method: "POST" }); toast("Removed from the feed"); onRemoved(); }
    catch (ex) { toast(ex.message, "bad"); }
  };
  return (
    <FindPost id={p.id} photos={p.photos} photoBase="/api/photo" nickname={p.nickname} title={p.title} at={p.approved_at} now={now} mine={p.mine}
      meta={`${p.week_number ? `Week ${pad2(p.week_number)} · ` : ""}${p.challenge_title}`} badge={<span className="pts">+{p.points}</span>}>
      <div className="post-meta">
        <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}><Icon n="chat" size={15} />{p.comments.length} comment{p.comments.length === 1 ? "" : "s"}</span>
        {p.can_remove ? <button className="text-btn" onClick={remove}><Icon n="hide" size={14} />Remove from feed</button> : null}
      </div>
      {p.comments.length ? (
        <ul className="comments">
          {p.comments.map((c) => (
            <li key={c.id}>
              <div className="grow"><b>{c.nickname}</b> <span className="c-body">{c.body}</span><div className="c-when">{ago(c.created_at, now)}</div></div>
              {c.can_delete ? <button className="icon-btn sm" aria-label="Delete comment" onClick={() => del(c)}><Icon n="trash" size={14} /></button> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <form className="comment-bar" onSubmit={send}>
        <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Add a comment…" maxLength={500} aria-label={`Comment on ${p.nickname}'s find`} enterKeyHint="send" />
        <button className="send" type="submit" disabled={!msg.trim() || sending} aria-label="Post comment"><Icon n="send" size={17} /></button>
      </form>
    </FindPost>
  );
}
