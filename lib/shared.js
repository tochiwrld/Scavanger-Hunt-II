// Constants shared by the browser and the server. No server-only imports here.

/** Bump this when the privacy notice changes in a way users must re-accept. */
export const PRIVACY_VERSION = "2026-11-02";
export const PRIVACY_CONTACT = "augustauston@gmail.com";
export const RETAIN_DAYS = 7;

/** Every box must be ticked to create an account (and by existing users before they can keep playing). Stored with the version and time. */
export const CONSENT_ITEMS = [
  ["age", "I am 18 or older."],
  ["policy", "I have read and agree to the Privacy Policy."],
  ["photos", "I understand my photos are seen by my hunt's admin for review and, once approved, by the players in that hunt (and by my opponent in a 1v1). Each photo carries a stamp with my nickname, the item and the time."],
  ["retention", `I understand that photos, submissions, comments and 1v1 lists are deleted automatically ${RETAIN_DAYS} days after each hunt or 1v1 ends. Only score cards (points, ranks, wins and prize records) are kept.`],
  ["transfer", "I agree that my data is stored and processed by Hunt Week's providers outside Nigeria (servers in France, run by companies based in the USA), as explained in the Privacy Policy."],
];

/** Points are set by difficulty; the admin only picks the difficulty. */
export const DIFFICULTY_POINTS = { easy: 10, medium: 25, hard: 50, extreme: 100 };
