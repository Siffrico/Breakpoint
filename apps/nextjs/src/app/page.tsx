import Link from "next/link";

import { Button } from "@acme/ui/button";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#06070a] px-5 py-8 text-white sm:px-8 lg:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-7xl flex-col justify-between">
        <div className="flex items-center justify-between border-b border-white/8 pb-5">
          <div className="text-sm tracking-[0.28em] uppercase text-white/40">
            Breakpoint
          </div>
          <div className="text-xs tracking-[0.24em] uppercase text-white/30">
            Becoming Engine
          </div>
        </div>

        <div className="max-w-5xl py-20">
          <p className="text-xs tracking-[0.3em] uppercase text-white/35">
            Identity First
          </p>
          <h1 className="font-display mt-6 text-6xl tracking-[-0.08em] sm:text-8xl">
            Train toward the person you said you want to become.
          </h1>
          <p className="mt-8 max-w-3xl text-lg leading-8 text-white/60">
            Start with a real conversation. Build the path backward from that identity. Then run units, scenarios, and debriefs until the gap gets smaller.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild className="h-12 rounded-none bg-white px-6 text-black hover:bg-white/90">
              <Link href="/onboarding">Start onboarding</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-12 rounded-none border-white/15 bg-transparent px-6 text-white hover:bg-white/5 hover:text-white"
            >
              <Link href="/ui">Preview UI</Link>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
