import "./globals.css";
import { Bricolage_Grotesque, Space_Grotesk, JetBrains_Mono } from "next/font/google";

// Fonts are downloaded at build time and served from our own domain: no render-blocking trip to Google,
// and visitors' browsers never contact Google Fonts.
const head = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "800"], variable: "--nf-head", display: "swap" });
const bodyFont = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--nf-body", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "700"], variable: "--nf-mono", display: "swap" });
import Providers from "../components/Providers.js";

export const metadata = {
  title: "PrimaHunt",
  description: "The weekly scavenger hunt for your crew. Hunt it. Snap it. Win the week.",
  icons: { icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='48' fill='%23FFD21F'/%3E%3Ctext x='50' y='68' font-size='52' font-family='Arial Black,Arial' font-weight='900' text-anchor='middle' fill='%2316141f'%3EH%3C/text%3E%3C/svg%3E" },
};
export const viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#16141f" }, { media: "(prefers-color-scheme: light)", color: "#16141f" }],
};

const HERO = "https://iwljafkilkizabmgczjn.supabase.co/storage/v1/object/public/site/hero.jpg";
// Runs before first paint so the saved theme never flashes. Dark is the default.
const THEME = `try{var t=localStorage.getItem('theme');if(t==='light')document.documentElement.classList.add('light')}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${head.variable} ${bodyFont.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
        <link rel="preload" as="image" href={HERO} fetchPriority="high" />
      </head>
      <body>
        <Providers>{children}</Providers>
        <div id="lightbox" hidden />
      </body>
    </html>
  );
}
