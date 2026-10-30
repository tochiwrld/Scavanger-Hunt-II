"use client";
import { useParams } from "next/navigation";
import ReviewCard from "../../../../../components/ReviewCard.js";
import { Async, Empty, useApi } from "../../../../../components/ui.js";

export default function Page() {
  const { gid } = useParams();
  const st = useApi(`/groups/${gid}/review`);
  return (
    <Async st={st}>{(d) => (
      <div className="stack">
        {d.queue.length ? d.queue.map((s) => <ReviewCard key={s.id} s={s} gid={gid} onChanged={st.reload} />) : <Empty icon="🎉" title="All caught up" text="No submissions are waiting." />}
      </div>
    )}</Async>
  );
}
