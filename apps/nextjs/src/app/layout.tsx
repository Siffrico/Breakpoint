import type { Metadata, Viewport } from "next";
import { Geist_Mono, Manrope, Sora } from "next/font/google";

import { cn } from "@acme/ui";
import { ThemeProvider, ThemeToggle } from "@acme/ui/theme";
import { Toaster } from "@acme/ui/toast";

import { env } from "~/env";
import { TRPCReactProvider } from "~/trpc/react";

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

const manrope = Manrope({
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

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "bg-background text-foreground min-h-screen font-sans antialiased",
          manrope.variable,
          sora.variable,
          geistMono.variable,
        )}
      >
        <ThemeProvider>
          <TRPCReactProvider>{props.children}</TRPCReactProvider>
          <div className="absolute right-4 bottom-4">
            <ThemeToggle />
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
