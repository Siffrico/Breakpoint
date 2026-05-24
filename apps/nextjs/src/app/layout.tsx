import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter, Sora, Space_Grotesk } from "next/font/google";

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
// Wordmark face for the marketing site — distinct from the product UI fonts.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-wordmark",
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
          spaceGrotesk.variable,
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
