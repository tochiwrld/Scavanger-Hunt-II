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
  };
}
