import "./globals.css";
import Providers from "../components/Providers.js";

export const metadata = {
  title: "Weekly Hunt",
  description: "Weekly scavenger hunts for your friend groups",
  icons: { icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%23FFC800'/%3E%3Ctext x='50' y='70' font-size='62' text-anchor='middle'%3E%F0%9F%8E%AF%3C/text%3E%3C/svg%3E" },
};
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#FFC800" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Bowlby+One&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers>{children}</Providers>
        <div id="lightbox" hidden />
      </body>
    </html>
  );
}
