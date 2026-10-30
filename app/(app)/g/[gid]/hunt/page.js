"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { fmtDate } from "../../../../../lib/client.js";
import { useApp } from "../../../../../components/Providers.js";
import SubmitSheet from "../../../../../components/SubmitSheet.js";
import { Async, ChallengeHead, Empty, ItemCard, useApi } from "../../../../../components/ui.js";

export default function Page() {
  const { gid } = useParams();
  const { toast } = useApp();
  const st = useApi(`/groups/${gid}/challenge`);
  const [item, setItem] = useState(null);
  return (
    <>
      <Async st={st}>{(d) => d.phase !== "active"
        ? <Empty icon="⏳" title={d.phase === "upcoming" ? "The next hunt hasn't started" : "No hunt is live"} text={d.phase === "upcoming" ? `${d.upcoming.title} starts ${fmtDate(d.upcoming.start_at)}. The items stay secret until then.` : "Check back soon."} />
        : <>
          <ChallengeHead c={d.challenge} countdown onDone={st.reload} />
          {d.items.map((i) => <ItemCard key={i.id} it={i} gid={gid} onSubmit={setItem} />)}
        </>}</Async>
      {item ? <SubmitSheet gid={gid} it={item} onClose={() => setItem(null)} onDone={() => { setItem(null); toast("⏳ Submission pending. Keep hunting!", "good"); st.reload(); }} /> : null}
    </>
  );
}
