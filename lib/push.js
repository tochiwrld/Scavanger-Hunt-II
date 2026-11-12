// Web Push without any package: RFC 8291 (aes128gcm) encryption + RFC 8292 VAPID, using Node's crypto.
// The VAPID key pair is derived from SESSION_SECRET, so there is no extra secret to manage.
// (Rotating SESSION_SECRET changes the key: phones then need to switch alerts on again.)
import crypto from "node:crypto";
import { q } from "./db.js";
import { PRIVACY_CONTACT } from "./shared.js";

const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");

let keys = null;
/** { publicKey (base64url, 65-byte uncompressed point), privateKey (KeyObject) } */
export function vapidKeys() {
  if (keys) return keys;
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET missing");
  const d = crypto.createHash("sha256").update(secret + "|primahunt-vapid-v1").digest();
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.setPrivateKey(d);
  const pub = ecdh.getPublicKey(); // 0x04 || x || y
  const privateKey = crypto.createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: b64u(d), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: "jwk",
  });
  keys = { publicKey: b64u(pub), privateKey };
  return keys;
}

function vapidHeader(endpoint) {
  const { publicKey, privateKey } = vapidKeys();
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:" + PRIVACY_CONTACT }));
  const sig = crypto.sign("sha256", Buffer.from(head + "." + body), { key: privateKey, dsaEncoding: "ieee-p1363" });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${publicKey}`;
}

const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

/** Encrypt one payload for one subscription (RFC 8291, single record). */
export function encrypt(payload, p256dh, auth) {
  const uaPublic = unb64u(p256dh), authSecret = unb64u(auth);
  const ecdh = crypto.createECDH("prime256v1");
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const prkKey = hmac(authSecret, shared);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])])).subarray(0, 32);
  const salt = crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const data = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, data]);
}

/** Send one push. Returns "ok", "gone" (subscription expired: delete it) or "error". */
export async function sendPush(sub, message) {
  try {
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: vapidHeader(sub.endpoint),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(message.ttl ?? 6 * 3600),
        Urgency: message.urgency || "normal",
      },
      body: encrypt(JSON.stringify({ title: message.title, body: message.body, url: message.url || "/", tag: message.tag }), sub.p256dh, sub.auth),
    });
    if (res.status === 404 || res.status === 410) return "gone";
    if (!res.ok) { console.error("push failed", res.status, (await res.text()).slice(0, 200)); return "error"; }
    return "ok";
  } catch (e) {
    console.error("push error", e?.message || e);
    return "error";
  }
}

/** Push to users (all their phones). `userIds` null = everyone with alerts switched on. Returns how many phones got it. */
export async function pushTo(userIds, message) {
  const subs = userIds
    ? await q(`SELECT ps.* FROM push_subscriptions ps JOIN users u ON u.id=ps.user_id WHERE ps.user_id = ANY($1::int[]) AND u.status='active'`, [userIds])
    : await q(`SELECT ps.* FROM push_subscriptions ps JOIN users u ON u.id=ps.user_id WHERE u.status='active'`);
  let ok = 0;
  for (let i = 0; i < subs.length; i += 10) {
    const part = subs.slice(i, i + 10);
    const results = await Promise.all(part.map((s) => sendPush(s, message)));
    const gone = part.filter((s, k) => results[k] === "gone").map((s) => s.id);
    const good = part.filter((s, k) => results[k] === "ok").map((s) => s.id);
    if (gone.length) await q(`DELETE FROM push_subscriptions WHERE id = ANY($1::int[])`, [gone]);
    if (good.length) await q(`UPDATE push_subscriptions SET last_ok_at=now() WHERE id = ANY($1::int[])`, [good]);
    ok += good.length;
  }
  return ok;
}
