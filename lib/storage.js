// Private photo storage on Supabase Storage (bucket is NOT public; every read goes through the app's auth checks).
const bucket = () => process.env.SUPABASE_BUCKET || "hunt-photos";
function cfg() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for photo storage.");
  const headers = { apikey: key };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  return { url, headers };
}
const enc = (key) => key.split("/").map(encodeURIComponent).join("/");

export async function putObject(key, buf, type) {
  const { url, headers } = cfg();
  const res = await fetch(`${url}/storage/v1/object/${bucket()}/${enc(key)}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": type, "x-upsert": "false" },
    body: buf,
  });
  if (!res.ok) throw new Error(`Photo upload failed (${res.status})`);
}
export async function getObject(key) {
  const { url, headers } = cfg();
  const res = await fetch(`${url}/storage/v1/object/authenticated/${bucket()}/${enc(key)}`, { headers });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`Photo fetch failed (${res.status})`);
  return { data: await res.arrayBuffer(), type: res.headers.get("content-type") || "image/jpeg" };
}
export async function deleteObject(key) {
  const { url, headers } = cfg();
  const res = await fetch(`${url}/storage/v1/object/${bucket()}/${enc(key)}`, { method: "DELETE", headers });
  if (!res.ok && res.status !== 404) throw new Error(`Photo delete failed (${res.status})`);
}

/** Bulk delete (Supabase allows up to 1000 per call). Throws if storage refuses, so callers keep the database rows and retry later. */
export async function deleteObjects(keys) {
  const list = [...new Set(keys.filter(Boolean))];
  if (!list.length) return 0;
  const { url, headers } = cfg();
  for (let i = 0; i < list.length; i += 500) {
    const res = await fetch(`${url}/storage/v1/object/${bucket()}`, {
      method: "DELETE",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: list.slice(i, i + 500) }),
    });
    if (!res.ok) throw new Error(`Photo delete failed (${res.status})`);
  }
  return list.length;
}
