// Search engines may read the public pages; signed-in pages, links and the API stay out of results.
export default function robots() {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/login", "/register", "/terms", "/privacy"], disallow: ["/api/", "/g/", "/join/", "/vs/", "/t/", "/reset/", "/duel/", "/team/", "/alerts", "/profile", "/daily/", "/start"] }],
    sitemap: "https://primahunt.com/sitemap.xml",
    host: "https://primahunt.com",
  };
}
