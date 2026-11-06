import { q } from "../../../../lib/db.js";

export async function generateMetadata({ params }) {
  const { token } = await params;
  let d = null;
  try {
    d = (await q(`SELECT u.nickname AS host, d.item_count, d.duration_minutes FROM duels d JOIN users u ON u.id=d.creator_id
                   WHERE d.token=$1 AND d.status='waiting'`, [String(token).slice(0, 100)]))[0];
  } catch {}
  const title = d ? `${d.host} challenged you to a 1v1 on PrimaHunt` : "You've been challenged to a 1v1 on PrimaHunt";
  const description = d
    ? `${d.item_count} items each. You write a list for each other, then race the clock. Tap to accept.`
    : "Write a list for each other, then race the clock. First to find it all wins.";
  return {
    title, description,
    openGraph: { title, description, url: `/vs/${token}`, images: [{ url: "/og.jpg", width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: ["/og.jpg"] },
    robots: { index: false },
  };
}
export default function Layout({ children }) { return children; }
