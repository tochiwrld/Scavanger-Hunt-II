import { handle } from "../../../lib/router.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // the cron sends emails one at a time (up to 40 per run)

const run = (req) => handle(req);
export { run as GET, run as POST, run as PUT, run as DELETE };
