import Link from "next/link";
import { Brand, ThemeToggle } from "../../../components/Brand.js";
import { PRIVACY_CONTACT, PRIVACY_VERSION, RETAIN_DAYS, WEEK_END_RULE } from "../../../lib/shared.js";

export const metadata = { title: "Privacy Policy · PrimaHunt", description: "How PrimaHunt collects, uses, stores and deletes your data." };

const UPDATED = "9 November 2026";
const Mail = () => <a className="link" href={`mailto:${PRIVACY_CONTACT}?subject=Hunt%20Week%20privacy`}>{PRIVACY_CONTACT}</a>;

export default function Page() {
  return (
    <>
      <header className="top"><Brand href="/login" /><div className="acts"><ThemeToggle /></div></header>
      <main className="policy" style={{ paddingTop: 18 }}>
        <h1>Privacy Policy</h1>
        <p className="muted">Last updated {UPDATED} · Version {PRIVACY_VERSION}</p>

        <div className="card mist">
          <b>The short version.</b> We collect only a nickname, an email, a password and the photos you choose to send. Your email is never shown to anyone.
          Photos are private to you and your hunt admin until approved, then visible only inside your hunt. Location data is stripped from every photo.
          Photos, submissions, comments and 1v1 lists are <b>deleted {RETAIN_DAYS} days after each hunt ends</b>; only score cards are kept.
          You can download or delete your data at any time from your profile. PrimaHunt is for people aged 18 and over.
        </div>

        <nav className="card toc" aria-label="Contents">
          {["Who we are", "What we collect", "Why we use it", "Who can see what", "How long we keep it", "Photo deletion policy", "Where your data is stored", "How we protect it", "Data breaches", "Your rights", "Age limit", "Changes", "Contact"].map((t, i) => <a key={t} className="link" href={`#s${i + 1}`}>{i + 1}. {t}</a>)}
        </nav>

        <h2 id="s1">1. Who we are</h2>
        <p>PrimaHunt (weekly-hunt.vercel.app) is a free social scavenger-hunt game run from Lagos, Nigeria. The operator of PrimaHunt is the <b>data controller</b> for the platform under the Nigeria Data Protection Act 2023 (NDPA). Contact: <Mail />.</p>
        <p>Each hunt is created and run by a <b>hunt admin</b> (a player who sets up a hunt). Hunt admins decide who joins their hunt, review the photos sent to it, and pay any prize personally. If you share anything with an admin outside the app (for example bank details for a prize), that is between you and them and is not covered by this policy.</p>

        <h2 id="s2">2. What we collect</h2>
        <div className="tbl"><table>
          <thead><tr><th>Data</th><th>Where it comes from</th></tr></thead>
          <tbody>
            <tr><td><b>Account:</b> nickname, email address, password (stored only as a salted scrypt hash)</td><td>You, when you register</td></tr>
            <tr><td><b>Game data:</b> hunts you create or join, your role, submissions, approval/rejection decisions and reasons, pips (points), ranks, prizes, 1v1 and team match lists and results, daily hunt finds and streaks, feed comments</td><td>You and other players while you play</td></tr>
            <tr><td><b>Photos:</b> pictures you take in the app's camera, stamped with your nickname, the item and the time. Optional hunt and item reference images uploaded by admins.</td><td>You (or the admin)</td></tr>
            <tr><td><b>Consent record:</b> which version of this notice you accepted, every statement you ticked, and when</td><td>You, at sign-up or when the notice changes</td></tr>
            <tr><td><b>Security data:</b> a signed login cookie, short-lived rate-limit counters keyed to your network address, password-reset tokens (stored only as a hash), an admin action log per hunt</td><td>Generated automatically</td></tr>
            <tr><td><b>Notifications:</b> in-app alerts, and game emails from Pip (see below)</td><td>Generated automatically</td></tr>
            <tr><td><b>Activity:</b> when you last opened the app, and when we last sent you a game email</td><td>Generated automatically</td></tr>
          </tbody>
        </table></div>
        <p>We do <b>not</b> collect your real name, phone number, GPS location, contacts, payment details or ID documents. We remove EXIF and other hidden metadata (including any location) from every image on our server before it is stored. We do not use advertising or tracking cookies, and we do not sell or rent your data.</p>

        <h2 id="s3">3. Why we use it (lawful basis)</h2>
        <ul>
          <li><b>To run the game you signed up for</b> (performance of a contract, NDPA s.25(1)(b)(i)): your account, hunts, photo review, scoring, leaderboards, 1v1s and notifications.</li>
          <li><b>Account emails</b> (contract, NDPA s.25(1)(b)(i)): a welcome email when you sign up, and password-reset links when you ask for one. These always arrive.</li>
          <li><b>Game emails from Pip</b> (legitimate interests, NDPA s.25(1)(b)(v)): for each hunt you play in, when a new week drops, a midweek progress note (or a streak note), a last call on the final day if you still have finds open, and the results when the board is final. If you're in a live hunt and haven't opened the app for 3 days, a reminder ("NO FORGET YOUR HUNT O!"). If you've been away 30 days, one "we miss you" email, and one last one at 60 days, then we stop. They use only your nickname, your scores and the hunt's public details, and go out between 10 AM and 8 PM Lagos time. A hunt's admin can switch them off for their hunt, and you can switch them all off any time in your profile ("Game emails") or with the unsubscribe link in every email.</li>
          <li><b>Email invites</b>: if a hunt admin invites someone by typing their email address, we use that address only to send that one invite. We don't keep it.</li>
          <li><b>Your consent</b> (NDPA s.25(1)(a)): sharing approved photos in your hunt's feed, and storing your data with providers outside Nigeria (section 7). You can withdraw consent at any time by taking a post off the feed or deleting your account; this doesn't affect anything done before.</li>
          <li><b>Legitimate interests</b> (NDPA s.25(1)(b)(v)): keeping the service secure (rate limits, login protection, the admin action log) and preventing cheating.</li>
          <li><b>Legal obligations</b> (NDPA s.25(1)(b)(ii)): responding to lawful requests and reporting breaches to the Nigeria Data Protection Commission (NDPC).</li>
        </ul>
        <p>We never use your data for automated decisions about you. Every photo is judged by a person.</p>

        <h2 id="s4">4. Who can see what</h2>
        <ul>
          <li><b>Your email</b>: only you and the operator. Never other players or hunt admins.</li>
          <li><b>Your nickname</b>: everyone in the hunts and 1v1s you play in, and on the global ranking if you play in a hunt its admin has made public.</li>
          <li><b>Pending or rejected photos</b>: only you and that hunt's admins (its admin and, if it has one, its co-admin).</li>
          <li><b>Approved photos</b>: the active players of that hunt, in its feed. You or the admin can take a post off the feed at any time.</li>
          <li><b>1v1 photos</b>: only you and your opponent.</li>
          <li><b>Team vs photos</b>: only the players in that match (both teams).</li>
          <li><b>Daily hunt photos</b>: you, and the PrimaHunt admin (the account that runs PRIMAHUNT OFFICIAL) while it reviews the find. Your streak shows on your own profile.</li>
          <li><b>PRIMAHUNT OFFICIAL</b>: every account is a player in the site's official public hunt, so your nickname can appear on its leaderboard and the global ranking once you score there. It has no cash prize and runs as one long hunt, so its photos are deleted as soon as an admin reviews them (the feed only shows who found what), comments on its finds are deleted 7 days later, and it sends Pip's game emails like any other hunt. You can leave it any time from its Players tab.</li>
          <li><b>Admins</b> can only see and act on their own hunt. The server checks every request against your membership in that hunt; there is no way for an admin to reach another hunt's players, photos or data.</li>
          <li><b>Our providers</b> (section 7) process data only to run the service, under their own security and confidentiality terms.</li>
          <li>We disclose data to authorities only when the law requires it.</li>
        </ul>

        <h2 id="s5">5. How long we keep it</h2>
        <div className="tbl"><table>
          <thead><tr><th>Data</th><th>Kept for</th></tr></thead>
          <tbody>
            <tr><td>Submission photos, submissions, rejection reasons, feed comments, item reference images</td><td><b>{RETAIN_DAYS} days after that week's hunt ends</b>, then deleted automatically</td></tr>
            <tr><td>1v1 and Team vs photos and lists</td><td><b>{RETAIN_DAYS} days after the match ends</b>, then deleted automatically</td></tr>
            <tr><td>Daily hunt photos</td><td><b>As soon as the PrimaHunt admin approves or rejects the find</b> (and never later than {RETAIN_DAYS} days after you take them). The record of that day's find and the decision stay, because they are your streak.</td></tr>
            <tr><td><b>Score cards</b>: pips, ranks, weekly results and stat recaps (for example who led and for how long), wins, prize records, "Hunter of the week" awards, 1v1 final scores, and item names</td><td>Kept while the hunt exists, so other players' results stay correct. If you delete your account, your entries stay but show as "Deleted player" and can no longer be linked to you.</td></tr>
            <tr><td>Account (nickname, email, password hash) and consent records</td><td>Until you delete your account</td></tr>
            <tr><td>Notifications</td><td>30 days</td></tr>
            <tr><td>Password-reset tokens and rate-limit counters</td><td>1 to 2 days</td></tr>
            <tr><td>Admin action log for a hunt</td><td>Until the hunt is deleted</td></tr>
          </tbody>
        </table></div>
        <p>An automatic job runs every 15 minutes and carries out these deletions. This matches the game's end-of-week rule: {WEEK_END_RULE} Anything an admin never reviewed is deleted at that point without scoring.</p>

        <h2 id="s6">6. Photo deletion policy</h2>
        <ul>
          <li><b>Automatic:</b> every photo is permanently deleted from storage {RETAIN_DAYS} days after its hunt or 1v1 ends. We delete the file from storage first and the record second, so a failed deletion is retried rather than forgotten.</li>
          <li><b>Account deletion:</b> deleting your account immediately deletes every photo you took, in hunts and 1v1s. Other players' photos are not affected.</li>
          <li><b>Hunt deletion:</b> when an admin deletes a hunt, all of its photos are deleted immediately.</li>
          <li><b>Feed removal:</b> you can take your approved photo off your hunt's feed at any time. It then stays visible only to you and the admin until it is deleted on schedule.</li>
          <li><b>Early removal on request:</b> email <Mail /> to have a specific photo deleted sooner.</li>
          <li>Sent photos can't be edited, so a submission can't be swapped after review. Photos are never used for anything other than the game, and never for training AI or advertising.</li>
        </ul>

        <h2 id="s7">7. Where your data is stored (international transfers)</h2>
        <p>PrimaHunt has no servers in Nigeria. Your data is processed by these providers:</p>
        <div className="tbl"><table>
          <thead><tr><th>Provider</th><th>What it does</th><th>Location</th></tr></thead>
          <tbody>
            <tr><td>Supabase Inc. (USA), on Amazon Web Services</td><td>Database and private photo storage</td><td>Paris, France (eu-west-3)</td></tr>
            <tr><td>Vercel Inc. (USA)</td><td>Runs the website and app server</td><td>Paris, France (cdg1); pages pass through Vercel's global network</td></tr>
            <tr><td>Google LLC (USA)</td><td>Sends emails (Gmail)</td><td>USA and Google's global network</td></tr>
          </tbody>
        </table></div>
        <p>Your data is therefore transferred out of Nigeria, mainly to France, which is governed by the EU General Data Protection Regulation and an independent data protection authority. Each provider is also bound by its own data processing terms and security programme. Because the NDPC has not yet published adequacy decisions or approved transfer instruments, we also rely on <b>your informed consent</b> (NDPA s.43), which you give when you register. The risk is that foreign authorities could, in rare cases, request access to data held by these companies under their own laws. If you don't accept this, please don't create an account.</p>

        <h2 id="s8">8. How we protect it</h2>
        <ul>
          <li>Encrypted connections (HTTPS) everywhere; passwords hashed with scrypt; HttpOnly, signed login cookies; checks that every write request comes from our own site.</li>
          <li>Photos sit in a private storage bucket. They are never public links: every view goes through a permission check and is sent with no-cache headers.</li>
          <li>Uploads are checked by their real content (JPEG, PNG or WebP only, max 2 MB, size limits on dimensions), and stripped of hidden metadata before storage.</li>
          <li>The database rejects all public access; only the app server can read it. Secrets are kept out of the code.</li>
          <li>Rate limits on sign-up, login, password resets, uploads and comments.</li>
        </ul>

        <h2 id="s9">9. Data breaches</h2>
        <p>If a personal data breach happens, we will contain it immediately, assess the risk, and where it is likely to put your rights at risk, notify the NDPC within 72 hours of becoming aware of it. If the risk to you is high, we will also tell you directly, by email and in the app, without delay, with steps you can take to protect yourself. Every breach is recorded.</p>

        <h2 id="s10">10. Your rights</h2>
        <p>Under the NDPA you can:</p>
        <ul>
          <li><b>Access and port</b> your data: Profile → <i>Download my data</i> gives you everything we hold, as a file.</li>
          <li><b>Correct</b> it: change your nickname or password in your profile, or email us.</li>
          <li><b>Delete</b> it: Profile → <i>Delete my account</i> immediately erases your email, password, nickname, photos, submissions, comments, notifications and consent records. To keep other players' results fair, past scores and 1v1 results stay on their leaderboards as "Deleted player", with nothing that identifies you. Hunts you founded pass to your co-admin, or close to new finds if there isn't one.</li>
          <li><b>Withdraw consent</b>, <b>object</b> to or <b>restrict</b> processing: email us.</li>
          <li><b>Complain</b> to the Nigeria Data Protection Commission at <a className="link" href="https://ndpc.gov.ng" target="_blank" rel="noreferrer">ndpc.gov.ng</a>.</li>
        </ul>
        <p>We aim to reply to requests within 7 days, and always within the time the law allows. We may ask you to confirm the request from your account email.</p>

        <h2 id="s11">11. Age limit</h2>
        <p>PrimaHunt is only for people aged <b>18 or older</b>. You confirm your age when you register. If we learn an account belongs to someone under 18, we delete it.</p>

        <h2 id="s12">12. Changes</h2>
        <p>If we change this policy in a way that affects you, we'll update the version number above and ask you to read and accept it again before you can keep playing.</p>

        <h2 id="s13">13. Contact</h2>
        <p>Questions, requests or complaints: <Mail />.</p>

        <p>See also the <Link className="link" href="/terms">Terms and safety rules</Link>.</p>
        <p style={{ marginTop: 28 }}><Link className="btn ghost block" href="/login">Back to PrimaHunt</Link></p>
      </main>
    </>
  );
}
