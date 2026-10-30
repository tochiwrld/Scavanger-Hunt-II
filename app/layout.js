import "./globals.css";
import Providers from "../components/Providers.js";

export const metadata = {
  title: "Hunt Week",
  description: "The weekly scavenger hunt for your crew. Find it, snap it twice, win the week.",
  icons: { icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='48' fill='%23FFD21F'/%3E%3Ctext x='50' y='68' font-size='52' font-family='Arial Black,Arial' font-weight='900' text-anchor='middle' fill='%2316141f'%3EH%3C/text%3E%3C/svg%3E" },
};
export const viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#16141f" }, { media: "(prefers-color-scheme: light)", color: "#16141f" }],
};

// Runs before first paint so the saved theme never flashes. Dark is the default.
const THEME = `try{var t=localStorage.getItem('theme');if(t==='light')document.documentElement.classList.add('light')}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=JetBrains+Mono:wght@500;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers>{children}</Providers>
        <div id="lightbox" hidden />
      </body>
    </html>
  );
}
