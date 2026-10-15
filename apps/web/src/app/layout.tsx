import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Sora } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const display = Sora({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "600", "700"]
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"]
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"]
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
