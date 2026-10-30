"use client";
import { useRouter } from "next/navigation";
import { api, shrink } from "../../../../lib/client.js";
import { useApp } from "../../../../components/Providers.js";
import { Btn, Empty, ErrBox, useForm } from "../../../../components/ui.js";

export default function Page() {
  const { me, refreshGroups, toast } = useApp();
  const router = useRouter();
  const form = useForm(async (v, f) => {
    const r = await api("/groups", { method: "POST", json: { name: v.name, description: v.description } });
    const file = new FormData(f).get("image");
    if (file && file.size) {
      try { const fd = new FormData(); fd.append("image", await shrink(file, 512), "g.jpg"); await api(`/groups/${r.id}/image`, { method: "POST", form: fd }); } catch {}
    }
    await refreshGroups();
    toast("Group created 🎉", "good");
    router.push("/g/" + r.id);
  });
  if (!me.can_create_groups) return <Empty icon="🛡️" title="Admin account needed" text="Choose “Create an admin account” first." />;
  return (
    <>
      <div><h1>Create your group</h1></div>
      <form className="card" onSubmit={form.onSubmit} noValidate>
        <ErrBox error={form.error} />
        <div className="field"><label>Group name</label><input name="name" maxLength={60} placeholder="Saturday Scavengers" required /></div>
        <div className="field"><label>Description (optional)</label><textarea name="description" maxLength={300} placeholder="Weekly scavenger hunt for the boys." /></div>
        <div className="field"><label>Group image (optional)</label><input name="image" type="file" accept="image/*" /></div>
        <Btn busy={form.busy} className="block" type="submit">Create group</Btn>
      </form>
    </>
  );
}
