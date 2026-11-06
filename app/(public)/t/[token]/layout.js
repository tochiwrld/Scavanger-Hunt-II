import { q } from "../../../../lib/db.js";

// Link previews (WhatsApp etc.) for team links: rival challenge or "join my team".
export async function generateMetadata({ params }) {
  const { token } = await params;
  let m = null;
  try {
    m = (await q(
      `SELECT m.team_size, m.item_count, m.rival_token=$1 AS rival, u.nickname AS captain
         FROM team_matches m JOIN team_members tm ON tm.match_id=m.id AND tm.is_captain
           AND tm.side = CASE WHEN m.b_token=$1 THEN 'b' ELSE 'a' END
         JOIN users u ON u.id=tm.user_id
        WHERE (m.rival_token=$1 OR m.a_token=$1 OR m.b_token=$1) AND m.status IN ('waiting','setup')`, [String(token).slice(0, 64)]))[0];
  } catch {}
  const vs = m ? `${m.team_size}v${m.team_size}` : "team";
  const title = !m ? "Join a team match on PrimaHunt" : m.rival ? `${m.captain} challenged your team to a ${vs} on PrimaHunt` : `Join ${m.captain}'s team for a ${vs} on PrimaHunt`;
  const description = m ? `${m.item_count} item${m.item_count === 1 ? "" : "s"} per team. Each team writes a list for the other, then race the clock. Tap to join.` : "Team up, write a list for the other team, then race the clock.";
  return {
    title, description,
    openGraph: { title, description, url: `/t/${token}`, images: [{ url: "/og.jpg", width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: ["/og.jpg"] },
    robots: { index: false },
  };
}
export default function Layout({ children }) { return children; }
