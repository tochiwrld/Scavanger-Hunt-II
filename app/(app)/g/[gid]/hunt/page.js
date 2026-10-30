"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { fmtDate } from "../../../../../lib/client.js";
import { useApp } from "../../../../../components/Providers.js";
import SubmitSheet from "../../../../../components/SubmitSheet.js";
import { Async, ChallengeHead, Empty, ItemCard, useApi } from "../../../../../components/ui.js";

const FILTERS = [["all", "All"], ["not_submitted", "To find"], ["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"]];

export default function Page() {
  const { gid } = useParams();
  const { toast } = useApp();
  const st = useApi(`/groups/${gid}/challenge`);
  const [item, setItem] = useState(null);
  const [f, setF] = useState("all");
  return (
    <>
      <Async st={st}>{(d) => {
        if (d.phase !== "active") return <Empty icon="⏳" title={d.phase === "upcoming" ? "The next hunt hasn't started" : "No hunt is live"} text={d.phase === "upcoming" ? `${d.upcoming.title} starts ${fmtDate(d.upcoming.start_at)}. The items stay secret until then.` : "Check back soon."} />;
        const n = (k) => (k === "all" ? d.items.length : d.items.filter((i) => i.status === k).length);
        const shown = f === "all" ? d.items : d.items.filter((i) => i.status === f);
        return (
          <>
            <ChallengeHead c={d.challenge} count={d.items.length} countdown onDone={st.reload} />
            <div className="tabs" role="tablist" aria-label="Filter items">
              {FILTERS.map(([k, l]) => <button key={k} role="tab" aria-selected={f === k} className={"tab" + (f === k ? " on" : "")} onClick={() => setF(k)}>{l}<span className="n">{n(k)}</span></button>)}
            </div>
            {shown.length ? shown.map((i) => <ItemCard key={i.id} it={i} gid={gid} onSubmit={setItem} />)
              : <Empty icon={f === "approved" ? "🎯" : "✨"} title={f === "not_submitted" ? "Nothing left to find" : "Nothing here yet"} text={f === "not_submitted" ? "Every item has photos in. Nice hunting." : null} />}
          </>
        );
      }}</Async>
      {item ? <SubmitSheet gid={gid} it={item} onClose={() => setItem(null)} onDone={() => { setItem(null); toast("Photos sent. Pending review — keep hunting!", "good"); st.reload(); }} /> : null}
    </>
  );
}
