import { NextResponse } from "next/server";
import { festiveOn } from "./lib/season.js";

// In the Christmas season the app icons (favicon, home screen icons) are swapped for the festive set in /public/festive.
// Same file names, so phones and browsers pick the new picture up the next time they fetch the icon.
// The ph-festive cookie (set by ?festive=1 or ?festive=0) previews or hides it outside the season.
const MAP = { "/icon-192.png": "/festive/icon-192.png", "/icon-512.png": "/festive/icon-512.png", "/apple-icon.png": "/festive/apple-icon.png", "/icon.svg": "/festive/icon.svg" };

export function middleware(req) {
  const to = MAP[req.nextUrl.pathname];
  if (!to) return NextResponse.next();
  const force = req.cookies.get("ph-festive")?.value;
  const on = force === "1" ? true : force === "0" ? false : festiveOn();
  if (!on) return NextResponse.next();
  const res = NextResponse.rewrite(new URL(to, req.url));
  res.headers.set("Cache-Control", "public, max-age=3600");
  return res;
}
export const config = { matcher: ["/icon-192.png", "/icon-512.png", "/apple-icon.png", "/icon.svg"] };
