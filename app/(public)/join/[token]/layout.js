import { q } from "../../../../lib/db.js";

// Server-side so link previews (WhatsApp etc.) show the hunt's name. Only what the invite page itself shows.
export async function generateMetadata({ params }) {
  const { token } = await params;
  let g = null;
  try {
    g = (await q(
      `SELECT g.name, g.description, u.nickname AS host FROM groups g JOIN users u ON u.id=g.owner_user_id
        WHERE g.invite_token=$1 AND g.status='active' AND g.invite_active AND g.admin_left_at IS NULL
          AND (g.invite_expires_at IS NULL OR g.invite_expires_at > now())`, [String(token).slice(0, 100)]))[0];
  } catch {}
  const title = g ? `Join ${g.name} on PrimaHunt` : "You're invited to a hunt on PrimaHunt";
  const description = g
    ? `${g.host} invited you to ${g.name}${g.description ? `: ${g.description}` : ""}. A fresh list drops every week. Hunt it, snap it, win the week.`.slice(0, 200)
    : "A weekly scavenger hunt with your crew. Hunt it, snap it, win the week.";
  return {
    title, description,
    openGraph: { title, description, url: `/join/${token}`, images: [{ url: "/og.jpg", width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: ["/og.jpg"] },
    robots: { index: false },
  };
}
export default function Layout({ children }) { return children; }
