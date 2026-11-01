"use client";
import { ago } from "../lib/client.js";
import { Photos } from "./ui.js";

/** Facebook-style find: "Tochi finds “A red umbrella”", time underneath, the photos. Children render below (comments etc.). */
export default function FindPost({ nickname, title, at, now, mine, meta, badge, photoBase, id, photos, children }) {
  return (
    <article className="card post" style={{ animation: "rise .3s both" }}>
      <header className="post-head">
        <span className="who-av" aria-hidden="true">{(nickname || "?").charAt(0).toUpperCase()}</span>
        <div className="grow post-line">
          <div><b className="post-who">{nickname}</b>{mine ? <span className="you">YOU</span> : null} finds <b className="post-item">“{title}”</b></div>
          <div className="post-when">{ago(at, now)}{meta ? ` · ${meta}` : ""}</div>
        </div>
        {badge || null}
      </header>
      <Photos base={photoBase} id={id} count={photos} who={nickname} />
      {children}
    </article>
  );
}
