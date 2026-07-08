import type { Metadata, Viewport } from "next";
import {
  Geist,
  Geist_Mono,
  Inter,
  Playwrite_GB_J_Guides,
  Sora,
  Source_Serif_4,
} from "next/font/google";

import { cn } from "@acme/ui";
import { ThemeProvider, ThemeToggle } from "@acme/ui/theme";
import { Toaster } from "@acme/ui/toast";

import { env } from "~/env";

import "katex/dist/katex.min.css";
import "streamdown/styles.css";
import "~/app/styles.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "http://localhost:3000",
  ),
  title: "Breakpoint",
  description:
    "Leveled simulation environments for deep skill-building with E.S.D.E.",
  openGraph: {
    title: "Breakpoint",
    description:
      "Leveled simulation environments for deep skill-building with E.S.D.E.",
    url: env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "http://localhost:3000",
    siteName: "Breakpoint",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-body",
});
const sora = Sora({
  subsets: ["latin"],
  variable: "--font-display",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-ai",
});
// Editorial body serif for the marketing site — a free transitional face
// (Tiempos/Lyon family) to match Cognition's serif copy.
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
});
// Wordmark face for the marketing site — distinct from the product UI fonts.
// Playwrite GB J Guides ships a single weight (400) with no italic, and is
// only available as a variable font — declare both explicitly.
const playwrite = Playwrite_GB_J_Guides({
  variable: "--font-wordmark",
  weight: "400",
  style: "normal",
  display: "swap",
  // No font-metrics data ships for this face, so Next can't compute fallback
  // override values — opt out to silence the "Failed to find font override
  // values" warning. Safe here: it's a display-only wordmark, not body copy.
  adjustFontFallback: false,
});

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "bg-background text-foreground min-h-screen font-sans antialiased",
          geist.variable,
          sora.variable,
          geistMono.variable,
          inter.variable,
          sourceSerif.variable,
          playwrite.variable,
        )}
      >
        <ThemeProvider>
          {props.children}
          <div className="absolute right-4 bottom-4">
            <ThemeToggle />
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
