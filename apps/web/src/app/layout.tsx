import type { Metadata } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

// Self-hosted variable fonts. `next/font/google` downloads the Google Fonts
// CSS at build time, which fails in CI where that egress is unavailable
// ("next/font/google queries have exactly one entry" / a null CSS response).
// Local fonts remove the build-time network dependency entirely.
const display = localFont({
  src: "./fonts/sora.woff2",
  variable: "--font-display",
  weight: "100 800",
  display: "swap"
});

const body = localFont({
  src: "./fonts/inter.woff2",
  variable: "--font-body",
  weight: "100 900",
  display: "swap"
});

const mono = localFont({
  src: "./fonts/jetbrains-mono.woff2",
  variable: "--font-mono",
  weight: "100 800",
  display: "swap"
});

export const metadata: Metadata = {
  metadataBase: new URL("https://cogitatome.dev"),
  title: {
    default: "cogitatome — the AI brain, opened up",
    template: "%s · cogitatome"
  },
  description:
    "An interpretability observatory and alignment laboratory. Dissect a deterministic transformer, trace induction circuits, train sparse autoencoders, run alignment sandboxes, and search 600+ real papers, talks and posts about what is happening inside the AI brain.",
  applicationName: "cogitatome",
  keywords: [
    "mechanistic interpretability",
    "AI alignment",
    "AI safety",
    "transformer circuits",
    "sparse autoencoders",
    "induction heads",
    "interpretability",
    "AI ethics"
  ],
  authors: [{ name: "Aniruddha Adak", url: "https://github.com/aniruddhaadak80" }],
  openGraph: {
    type: "website",
    siteName: "cogitatome",
    title: "cogitatome — the AI brain, opened up",
    description:
      "Dissect a deterministic transformer. Trace induction circuits. Train sparse autoencoders. Run alignment sandboxes. Zero API keys."
    ,
    images: [{ url: "/og.svg", width: 1200, height: 630, alt: "cogitatome" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "cogitatome — the AI brain, opened up",
    description: "An interpretability observatory and alignment laboratory. Zero API keys."
  },
  robots: { index: true, follow: true }
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#05070f" },
    { media: "(prefers-color-scheme: light)", color: "#f4f6fb" }
  ]
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh bg-surface text-ink antialiased">
        <ThemeProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-indigo focus:px-3 focus:py-2 focus:text-paper"
          >
            Skip to content
          </a>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
