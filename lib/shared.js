// Constants shared by the browser and the server. No server-only imports here.

/** Bump this when the privacy notice changes in a way users must re-accept. */
export const PRIVACY_VERSION = "2026-11-06"; // adds the Terms (safety + liability) and the PRIMAHUNT OFFICIAL notice
export const PRIVACY_CONTACT = "augustauston@gmail.com";
export const RETAIN_DAYS = 7;

/** Every box must be ticked to create an account (and by existing users before they can keep playing). Stored with the version and time. */
export const CONSENT_ITEMS = [
  ["age", "I am 18 or older."],
  ["policy", "I have read and agree to the Privacy Policy."],
  ["terms", "I agree to the Terms: I play at my own risk, I'll stay safe and within the law, I won't post or set anything dangerous or illegal, and PrimaHunt isn't responsible for what players or hunt admins do."],
  ["official", "I understand I'll be added to PRIMAHUNT OFFICIAL, PrimaHunt's public hunt, as a player, and I can leave it any time from its Players tab."],
  ["photos", "I understand my photos are seen by my hunt's admin for review and, once approved, by the players in that hunt (and by my opponent in a 1v1). Each photo carries a stamp with my nickname, the item and the time."],
  ["retention", `I understand that photos, submissions, comments and 1v1 lists are deleted automatically ${RETAIN_DAYS} days after each hunt or 1v1 ends. Only score cards (points, ranks, wins and prize records) are kept.`],
  ["transfer", "I agree that my data is stored and processed by PrimaHunt's providers outside Nigeria (servers in France, run by companies based in the USA), as explained in the Privacy Policy."],
];

/** Points are set by difficulty; the admin only picks the difficulty. */
export const DIFFICULTY_POINTS = { easy: 5, medium: 10, hard: 15, extreme: 20 };

/** Reminder emails ("NO FORGET YOUR HUNT O!"). Sent between 10:00 and 19:59 Lagos time, at most once per gap, never after the user opts out. */
export const NUDGE_ACTIVE_DAYS = 3;   // in a live hunt and away this long
export const NUDGE_DORMANT_DAYS = 14; // away this long, live hunt or not
export const NUDGE_DORMANT_MAX = 3;   // stop after this many unanswered "come back" emails

/** The one end-of-week rule, worded the same everywhere it's shown. */
export const WEEK_END_RULE = `Finds must be sent by 11:59 PM on Sunday. Anything sent in time still counts once the admin reviews it. Admins have up to ${RETAIN_DAYS} days to finish reviewing, then the standings are final.`;

/** Daily hunt: the same item for everyone each Lagos day, cycling through this list from DAILY_START. Tomorrow's item is never sent early. */
export const DAILY_START = "2026-11-06";
export const DAILY_ITEMS = [
  "A flyover bridge", "A street sign", "A keke napep", "A danfo", "Any traffic sign", "A cat", "A dog",
  "A laptop", "A water bottle", "A Man United jersey", "A Bokku sign", "A traffic light", "A policeman",
];
/** Today's date in Lagos (UTC+1, no DST) as YYYY-MM-DD. */
export const lagosDay = (t = Date.now()) => new Date(t + 3600e3).toISOString().slice(0, 10);
export const dailyIndex = (day) => Math.max(0, Math.round((Date.parse(day) - Date.parse(DAILY_START)) / 864e5));
