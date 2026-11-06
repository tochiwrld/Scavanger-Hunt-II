import Link from "next/link";
import { Brand, ThemeToggle } from "../../../components/Brand.js";
import { PRIVACY_CONTACT, PRIVACY_VERSION, WEEK_END_RULE } from "../../../lib/shared.js";

export const metadata = { title: "Terms and safety · PrimaHunt", description: "The rules for playing and running hunts on PrimaHunt, and who is responsible for what." };

const Mail = () => <a className="link" href={`mailto:${PRIVACY_CONTACT}?subject=PrimaHunt%20report`}>{PRIVACY_CONTACT}</a>;

export default function Page() {
  return (
    <>
      <header className="top"><Brand href="/login" /><div className="acts"><ThemeToggle /></div></header>
      <main className="policy" style={{ paddingTop: 18 }}>
        <h1>Terms and safety</h1>
        <p className="muted">Last updated 6 November 2026 · Version {PRIVACY_VERSION}</p>

        <div className="card mist">
          <b>The short version.</b> PrimaHunt is a game. Play it safely and legally. Never put anything dangerous or illegal on a hunt,
          and never do anything dangerous or illegal to complete one. You take part at your own risk, and hunt admins are responsible for the items they set and the prizes they offer.
        </div>

        <h2>1. Agreeing to these terms</h2>
        <p>By creating an account or using PrimaHunt you agree to these Terms and to the <Link className="link" href="/privacy">Privacy Policy</Link>. You must be 18 or older. If you don't agree, don't use PrimaHunt.</p>

        <h2>2. Play safe and legal</h2>
        <p>No hunt item, photo, comment or 1v1 list may ask for, show or encourage:</p>
        <ul>
          <li>Breaking any law, including trespassing, entering private or restricted property, or photographing government, military or security sites where that is not allowed.</li>
          <li>Anything that risks injury to you or anyone else: climbing, traffic, water, heights, fire, stunts, or using your phone while driving or riding.</li>
          <li>Weapons, drugs, alcohol for under-age people, theft, vandalism or damage to property.</li>
          <li>Violence, threats, harassment, bullying, hate, or embarrassing someone against their will.</li>
          <li>Photos of other people without their permission, any photo of a child, nudity or sexual content.</li>
          <li>Harm or cruelty to animals.</li>
          <li>Personal information about others (addresses, phone numbers, ID, bank details).</li>
        </ul>
        <p>If an item can't be completed safely and legally, skip it. No points are worth it.</p>

        <h2>3. If you run a hunt</h2>
        <ul>
          <li>You are responsible for every item you write. Make sure each one can be done safely and legally by every player.</li>
          <li>Review photos fairly, and give a reason when you reject one. {WEEK_END_RULE}</li>
          <li>Any prize is offered and paid by you personally. PrimaHunt does not hold, pay or guarantee prizes and is not part of any arrangement between you and your players.</li>
          <li>Only invite people who want to play, and keep what you see in your hunt within your hunt.</li>
        </ul>

        <h2>4. Your photos and posts</h2>
        <p>You keep ownership of what you post. You let PrimaHunt store and show it inside your hunt or 1v1, only to run the game, and it is deleted as the Privacy Policy explains. Only post what you have the right to post.</p>

        <h2>5. What we can do</h2>
        <p>We may remove any item, photo, comment or hunt that breaks these Terms, suspend or close accounts that break them, and pass information to the authorities when the law requires it. To report something, email <Mail /> with the hunt's name and what you saw.</p>

        <h2>6. Responsibility and liability</h2>
        <ul>
          <li>You take part in hunts and 1v1s <b>at your own risk</b>, and you are responsible for your own actions and safety while playing.</li>
          <li>PrimaHunt provides the website "as is". It does not set the items in private hunts, supervise players, or check that items are safe.</li>
          <li>As far as Nigerian law allows, PrimaHunt and its operator are <b>not liable</b> for any injury, loss, damage, fine or dispute that comes from taking part in a hunt, from items set by hunt admins, from what other players do, or from prizes offered by admins.</li>
          <li>Nothing in these Terms limits liability that the law does not allow to be limited.</li>
          <li>If you break these Terms and someone makes a claim against PrimaHunt because of it, you are responsible for that.</li>
        </ul>

        <h2>7. Changes and contact</h2>
        <p>We may update these Terms. If a change affects you, we'll ask you to accept it again before you keep playing. These Terms are governed by the laws of Nigeria. Questions or reports: <Mail />.</p>

        <p style={{ marginTop: 28 }}><Link className="btn ghost block" href="/login">Back to PrimaHunt</Link></p>
      </main>
    </>
  );
}
