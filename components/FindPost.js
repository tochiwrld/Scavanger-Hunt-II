"use client";
import { ago, zoom } from "../lib/client.js";

/** Facebook-style find: "Tochi finds “A red umbrella”", time underneath, both photos. Children render below (comments etc.). */
export default function FindPost({ nickname, title, at, now, mine, meta, badge, photoBase, id, children }) {
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
      <div className="photos2">
        <img loading="lazy" src={`${photoBase}/${id}/1`} alt={`${nickname}'s first photo of ${title}`} onClick={(e) => zoom(e.currentTarget.src)} />
        <img loading="lazy" src={`${photoBase}/${id}/2`} alt={`${nickname}'s second photo of ${title}`} onClick={(e) => zoom(e.currentTarget.src)} />
      </div>
      {children}
    </article>
  );
}
