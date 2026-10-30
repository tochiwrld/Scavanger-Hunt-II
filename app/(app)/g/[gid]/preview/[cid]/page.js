"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Async, ChallengeHead, ItemCard, useApi } from "../../../../../../components/ui.js";

export default function Page() {
  const { gid, cid } = useParams();
  const st = useApi(`/groups/${gid}/challenges/${cid}`);
  return (
    <Async st={st}>{(d) => (
      <>
        <div className="card mist">👀 Preview: this is exactly what players will see once it's live.</div>
        <ChallengeHead c={d.challenge} countdown={false} />
        {d.items.map((i, n) => <ItemCard key={i.id} it={{ ...i, number: n + 1, status: "not_submitted" }} gid={gid} preview />)}
        <Link className="btn ghost block" href={`/g/${gid}/challenge/${cid}`}>Back to challenge</Link>
      </>
    )}</Async>
  );
}
