import Link from "next/link";

import { Button } from "@acme/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background text-foreground">
      <div className="max-w-xl px-6 text-center">
        <h1 className="font-display text-3xl tracking-[-0.06em]">
          Train toward the person you said you want to become.
        </h1>
        <p className="mx-auto mt-6 max-w-md text-sm leading-6 text-muted-foreground">
          Diagnosis. Pressure. Debrief. Repeat. Breakpoint builds a surgical
          training path then runs you through it until the gap closes.
        </p>
        <div className="mt-8">
          <Button
            asChild
            className="h-11 rounded-none bg-white px-6 text-black hover:bg-white/90"
          >
            <Link href="/onboarding">Begin</Link>
          </Button>
        </div>
      </div>
      <div className="fixed bottom-6 left-0 right-0 text-center font-mono text-xs text-white/20">
        This is not self-help. This is training.
      </div>
    </main>
  );
}
