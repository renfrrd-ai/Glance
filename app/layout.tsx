import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Caveat, Geist_Mono, Instrument_Sans } from "next/font/google";

import "./globals.css";

const saans = localFont({
  variable: "--font-saans",
  display: "swap",
  src: [
    { path: "../public/fonts/saans-regular.otf", weight: "400", style: "normal" },
    { path: "../public/fonts/saans-medium.otf", weight: "500", style: "normal" },
    { path: "../public/fonts/saans-semibold.otf", weight: "600", style: "normal" },
  ],
});

const ppNeueMontreal = localFont({
  variable: "--font-pp-neue-montreal",
  display: "swap",
  src: [{ path: "../public/fonts/pp-neue-montreal-medium.otf", weight: "500", style: "normal" }],
});

const caveat = Caveat({ variable: "--font-caveat", subsets: ["latin"], display: "swap" });
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  display: "swap",
});
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "chalk",
  description:
    "Ask about anything — chalk draws you a board and walks you through it, out loud. Courses from any topic or your own files, on the web and on the Mac.",
  metadataBase: new URL("https://www.trychalk.tech"),
  openGraph: {
    title: "chalk — learn anything, anywhere",
    description:
      "Ask about anything — chalk draws you a board and walks you through it, out loud. Courses from any topic or your own files, on the web and on the Mac.",
    url: "https://www.trychalk.tech",
    siteName: "chalk",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/*
 * Two things have to run before React hydrates, so they stay inline:
 *  - a stale-build guard: a chunk that 404s after a deploy reloads the page once
 *    a minute at most, instead of leaving a half-loaded app on screen;
 *  - the country/pricing flags, so naira prices never flash dollars first.
 */
const BOOT_SCRIPT = `
try {
  if (window.self !== window.top && window.top.location.pathname.indexOf('/control') === 0)
    document.documentElement.setAttribute('data-in-frame', '');
} catch (e) {}

(function () {
  var K = 'chalk-stale-reload',
    R = /ChunkLoadError|Loading chunk|Failed to load chunk|dynamically imported module|Importing a module script failed|error loading dynamically/i;
  function go(m) {
    try {
      if (!R.test(String(m || ''))) return;
      var t = Number(sessionStorage.getItem(K) || 0);
      if (Date.now() - t < 60000) return;
      sessionStorage.setItem(K, String(Date.now()));
      location.reload();
    } catch (e) {}
  }
  window.addEventListener('error', function (e) {
    go((e && e.message) || (e && e.error && e.error.message));
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    go((r && (r.message || r.name)) || r);
  });
})();

(function () {
  try {
    var d = document.documentElement,
      c = (new RegExp('(?:^|; )chalk-country=([^;]*)').exec(document.cookie) || [])[1];
    if (c !== 'NG' && c !== '*') return;
    d.setAttribute('data-naija', '');
    var p = c === 'NG' ? 'ngn' : 'usd',
      q = null;
    try {
      q = new URLSearchParams(location.search).get('prices');
    } catch (e) {}
    if (q === 'usd' || q === 'ngn') {
      p = q;
      try {
        localStorage.setItem('chalk.prices', q);
      } catch (e) {}
    } else {
      try {
        p = localStorage.getItem('chalk.prices') || p;
      } catch (e) {}
    }
    if (p === 'ngn') d.setAttribute('data-prices', 'ngn');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${ppNeueMontreal.variable} ${saans.variable} ${caveat.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body className={`${instrumentSans.variable} ${geistMono.variable} flex min-h-full flex-col`}>
        {children}
      </body>
    </html>
  );
}
