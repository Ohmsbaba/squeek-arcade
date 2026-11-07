import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Shell } from "@/components/ui/Shell";
import "./globals.css";

const display = localFont({
  src: [
    { path: "../../node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-300-normal.woff2", weight: "300" },
    { path: "../../node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2", weight: "600" },
  ],
  variable: "--font-display",
  display: "swap",
});
const data = localFont({
  src: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2",
  variable: "--font-data",
  display: "swap",
});
const voice = localFont({
  src: "../../node_modules/@fontsource/quicksand/files/quicksand-latin-600-normal.woff2",
  variable: "--font-voice",
  display: "swap",
});

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3400";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: "Squeek Arcade", template: "%s · Squeek Arcade" },
  description: "A hamster-powered arcade for the Squeekchain ecosystem. Drop your Squeek through a pegboard, or race the wheel and cash out before it stops. Free daily points, provably fair.",
  openGraph: { siteName: "Squeek Arcade", type: "website" },
  icons: { icon: "/brand/squeekchain-mark.png" },
  // Squeekchain builder programme ownership tag. It's rechecked daily, so don't remove it.
  other: { "squeekchain-project": "d38ccef2-ce3e-4e0a-8953-b866603d7853" },
};

export const viewport: Viewport = { themeColor: "#0b0b0d", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${data.variable} ${voice.variable}`}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
