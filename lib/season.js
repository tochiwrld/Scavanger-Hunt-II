// Christmas season: 1 December to 7 January, Lagos time (UTC+1, no DST). Comes back every year by itself.
export function festiveOn(d = new Date()) {
  const lagos = new Date(d.getTime() + 3600e3);
  const m = lagos.getUTCMonth(), day = lagos.getUTCDate();
  return m === 11 || (m === 0 && day <= 7);
}
// Same rule as a string, for the tiny script that runs before first paint (app/layout.js).
export const FESTIVE_JS = `function(){var l=new Date(Date.now()+36e5),m=l.getUTCMonth(),d=l.getUTCDate();return m===11||(m===0&&d<=7)}`;
