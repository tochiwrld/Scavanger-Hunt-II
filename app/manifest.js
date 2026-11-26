// Lets phones add PrimaHunt to the home screen (needed for push alerts on iPhone).
export default function manifest() {
  return {
    name: "PrimaHunt",
    short_name: "PrimaHunt",
    description: "Weekly scavenger hunts, 1v1s, team battles and star hunts around Lagos.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#14131b",
    theme_color: "#14131b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the home screen icon (Android, computers) for these.
    shortcuts: [
      { name: "Today's daily find", short_name: "Daily find", url: "/daily?from=shortcut", icons: [{ src: "/sc-daily.png", sizes: "96x96", type: "image/png" }] },
      { name: "Star hunt", short_name: "Star hunt", url: "/stars?from=shortcut", icons: [{ src: "/sc-star.png", sizes: "96x96", type: "image/png" }] },
      { name: "My hunts", short_name: "My hunts", url: "/?from=shortcut", icons: [{ src: "/sc-hunts.png", sizes: "96x96", type: "image/png" }] },
      { name: "Alerts", short_name: "Alerts", url: "/alerts?from=shortcut", icons: [{ src: "/sc-alerts.png", sizes: "96x96", type: "image/png" }] },
    ],
  };
}
