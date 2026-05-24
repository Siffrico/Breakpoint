import Link from "next/link";

import { getSession } from "~/auth/server";
import { SiteWordmark } from "~/features/marketing/components/site-wordmark";

/**
 * The Breakpoint site that ships right now — a single, document-style page in
 * the spirit of aside.com: one modest monospace size throughout, hierarchy via
 * colour and spacing, no hero headline and no buttons. The larger marketing
 * site is preserved (un-routed) in `scaled-landing.tsx`.
 */
export async function SiteLanding() {
  const session = await getSession();
  const isAuthed = Boolean(session?.user);

  return (
    <div className="bp-site relative min-h-dvh w-full overflow-x-hidden">
      {/* name — top-left corner of the page, no navbar */}
      <div className="absolute top-7 left-7 z-10 sm:top-9 sm:left-10">
        <SiteWordmark />
      </div>

      <main className="px-7 pt-[clamp(115px,19vh,209px)] pb-28 sm:px-10">
        <Document isAuthed={isAuthed} />
      </main>
    </div>
  );
}

/* ─── document ────────────────────────────────────────────────────────────
   A left-aligned column, centred on the page. Title and body share one type
   size — the title is set apart only by colour (white) and caps.            */

const STEPS: string[] = [
  "You meet a problem before anything is explained. Wrestling with it first is what makes the learning actually hold.",
  "Your attempt reveals what you understand and what you're missing, so the teaching is built around your gaps — not a script everyone gets.",
  "Once a concept clicks, the next problem is harder, keeping you at the edge of your ability — where learning is fastest.",
];

function Document({ isAuthed }: { isAuthed: boolean }) {
  const startHref = isAuthed ? "/workspace" : "/auth";
  const startLabel = isAuthed ? "Open workspace" : "Start training";

  return (
    <div className="mx-auto w-full max-w-[560px] font-mono">
      <h1 className="text-[13.5px] leading-[1.5] font-semibold tracking-[0.13em] text-[var(--site-text-3)] uppercase">
        A better way to learn
      </h1>

      <p className="mt-3 text-[14.5px] leading-[1.66] tracking-[0.02em] text-[var(--site-fg)] uppercase">
        Breakpoint is a learning app built on how people actually understand
        things — not how they memorize them.
      </p>

      <p className="mt-8 text-[14.5px] leading-[1.78] tracking-[0.01em] text-[var(--site-text-2)]">
        Most learning tools optimize for recall. They get you to repeat things
        back — and none of that proves you can use what you learned when it
        counts.
      </p>

      <p className="mt-6 text-[14.5px] leading-[1.78] tracking-[0.01em] text-[var(--site-text-2)]">
        Breakpoint is grounded in cognitive science: research on how knowledge
        is genuinely acquired and retained. You give it a topic, and it builds a
        step-by-step path from first principles up to a real project you finish
        yourself.
      </p>

      <p className="mt-9 text-[14.5px] leading-[1.78] tracking-[0.01em] text-[var(--site-text-2)]">
        Every step runs the same loop.
      </p>

      <ol className="mt-4 flex flex-col gap-4">
        {STEPS.map((step, i) => (
          <li
            key={step}
            className="flex gap-4 text-[14.5px] leading-[1.78] tracking-[0.01em] text-[var(--site-text-2)]"
          >
            <span className="shrink-0 text-[var(--site-text-3)]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <p className="mt-9 text-[14.5px] leading-[1.78] tracking-[0.01em] text-[var(--site-text-2)]">
        You finish having built something real — and the understanding to build
        the next thing on your own.
      </p>

      <div className="mt-12 flex items-center gap-6 text-[14.5px]">
        <Link
          href={startHref}
          className="group inline-flex items-center gap-1.5 text-[var(--site-fg)]"
        >
          <span className="underline-offset-[5px] group-hover:underline">
            {startLabel}
          </span>
          <span
            aria-hidden
            className="transition-transform group-hover:translate-x-0.5"
          >
            →
          </span>
        </Link>
        <Link
          href={isAuthed ? "/workspace" : "/auth"}
          className="text-[var(--site-text-3)] underline-offset-[5px] transition-colors hover:text-[var(--site-fg)] hover:underline"
        >
          {isAuthed ? "Workspace" : "Sign in"}
        </Link>
      </div>

      <p className="mt-16 text-[12.5px] tracking-[0.04em] text-[var(--site-text-3)]">
        © 2026 Breakpoint
      </p>
    </div>
  );
}
