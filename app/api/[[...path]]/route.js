import { handle } from "../../../lib/router.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const run = (req) => handle(req);
export { run as GET, run as POST, run as PUT, run as DELETE };
