import Image from "next/image";
import Link from "next/link";

import { Button } from "@acme/ui/button";

import { AuthShowcase } from "./_components/auth-showcase";
import { getSession } from "~/auth/server";

export default async function HomePage() {
  const session = await getSession();
  const isAuthed = Boolean(session?.user);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <SiteNav isAuthed={isAuthed} />
      <Hero isAuthed={isAuthed} />
      <Premise />
      <TheLoop />
      <BuiltForTheGap />
      <ClosingCta isAuthed={isAuthed} />
      <SiteFooter />
    </main>
  );
}

function SiteNav({ isAuthed }: { isAuthed: boolean }) {
  return (
    <header className="absolute inset-x-0 top-0 z-30">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <Link
          href="/"
          className="font-display text-sm tracking-[-0.04em] text-white"
        >
          BREAKPOINT
        </Link>
        <nav className="flex items-center gap-6 text-xs font-medium text-white/70">
          <a
            href="#loop"
            className="hidden transition-colors hover:text-white sm:inline"
          >
            The Loop
          </a>
          <a
            href="#built"
            className="hidden transition-colors hover:text-white sm:inline"
          >
            Built for the gap
          </a>
          {isAuthed ? (
            <Link
              href="/workspace"
              className="border border-white/40 bg-white/10 px-3 py-1.5 text-white backdrop-blur transition-colors hover:bg-white/20"
            >
              Open workspace
            </Link>
          ) : (
            <Link
              href="/"
              className="border border-white/40 bg-white/10 px-3 py-1.5 text-white backdrop-blur transition-colors hover:bg-white/20"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

function Hero({ isAuthed }: { isAuthed: boolean }) {
  return (
    <section className="relative isolate overflow-hidden">
      <div className="relative h-[100dvh] min-h-[640px] w-full">
        <Image
          src="/hero-vista.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        {/* atmospheric darken at top for nav legibility */}
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/55 to-transparent" />
        {/* main fade to background, deep enough to seat the hero copy */}
        <div className="absolute inset-x-0 bottom-0 h-[78%] bg-gradient-to-b from-transparent via-black/55 to-background" />

        <div className="absolute inset-x-0 bottom-0 z-10">
          <div className="mx-auto max-w-7xl px-6 pb-20 sm:pb-28">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/70">
              <span className="mr-2 inline-block h-1.5 w-1.5 translate-y-[-2px] bg-[oklch(0.72_0.18_245)]" />
              A training environment, not a course
            </p>
            <h1 className="mt-5 max-w-4xl font-display text-[40px] leading-[1.02] tracking-[-0.045em] text-white sm:text-[64px] md:text-[80px]">
              The person you said
              <br />
              you wanted to become
              <br />
              <span className="text-white/80">is on the other side.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-[1.55] text-white/75 sm:text-lg">
              Breakpoint diagnoses the exact gap between who you are and who you
              said you wanted to be. Then it puts you under pressure until that
              gap closes.
            </p>
            <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
              {isAuthed ? (
                <Button
                  asChild
                  size="lg"
                  className="h-12 rounded-none bg-white px-7 text-sm font-medium tracking-tight text-black shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] hover:bg-white/90"
                >
                  <Link href="/workspace">
                    Open workspace
                    <span aria-hidden className="ml-2 inline-block">
                      →
                    </span>
                  </Link>
                </Button>
              ) : (
                <div className="[&_button]:h-12 [&_button]:rounded-none [&_button]:bg-white [&_button]:px-7 [&_button]:text-sm [&_button]:font-medium [&_button]:tracking-tight [&_button]:text-black [&_button]:shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] [&_button]:hover:bg-white/90">
                  <AuthShowcase />
                </div>
              )}
              <a
                href="#loop"
                className="group inline-flex h-12 items-center gap-2 border border-white/30 bg-white/5 px-5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/10"
              >
                See how it works
                <span
                  aria-hidden
                  className="transition-transform group-hover:translate-y-[2px]"
                >
                  ↓
                </span>
              </a>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">
              <span>Diagnose</span>
              <span aria-hidden>·</span>
              <span>Pressure</span>
              <span aria-hidden>·</span>
              <span>Debrief</span>
              <span aria-hidden>·</span>
              <span>Repeat</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Premise() {
  return (
    <section className="relative border-t border-white/5">
      <div className="mx-auto max-w-5xl px-6 py-28 sm:py-36">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          Premise
        </p>
        <h2 className="mt-5 font-display text-3xl leading-[1.15] tracking-[-0.035em] text-foreground sm:text-5xl">
          Skill is not learned in lectures.
          <br />
          <span className="text-muted-foreground">
            It is forged under repeated, surgical pressure —
          </span>
          <br />
          <span className="text-foreground">
            with feedback you cannot argue with.
          </span>
        </h2>
        <p className="mt-10 max-w-2xl text-[15px] leading-[1.7] text-muted-foreground">
          Most products coddle. Breakpoint stages live scenarios calibrated to
          the precise weakness in your stack, runs you through them, then
          returns a diagnosis cold enough to act on. No hype. No streak
          confetti. No therapy-speak. Just the next rep, sharper than the last.
        </p>
      </div>
    </section>
  );
}

function TheLoop() {
  const stages = [
    {
      n: "01",
      label: "Diagnose",
      title: "Find the exact fracture.",
      body: "A surgical assessment maps where you actually break — not where you say you do. The gap is named, scored, and located inside a domain.",
    },
    {
      n: "02",
      label: "Pressure",
      title: "Live scenarios at the edge of your range.",
      body: "Stakes-real simulations target the weakness directly. Difficulty is calibrated upward until your performance starts to shake — that is the breakpoint.",
    },
    {
      n: "03",
      label: "Debrief",
      title: "Cold, specific, undeniable.",
      body: "Evaluation tells you what failed, why it failed, and which root cause to attack next. Praise only when it is earned and exact.",
    },
    {
      n: "04",
      label: "Repeat",
      title: "Until the gap closes.",
      body: "Repair mode runs targeted reps on the single weakness. The loop only releases you when the failure no longer reproduces under pressure.",
    },
  ];

  return (
    <section
      id="loop"
      className="relative border-t border-white/5 bg-[oklch(0.17_0_0)]"
    >
      <div className="mx-auto max-w-7xl px-6 py-28 sm:py-36">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
              The Loop
            </p>
            <h2 className="mt-5 font-display text-3xl leading-[1.1] tracking-[-0.035em] text-foreground sm:text-5xl">
              Four stages.
              <br />
              <span className="text-muted-foreground">
                One closing margin of error.
              </span>
            </h2>
          </div>
          <p className="max-w-md text-sm leading-[1.7] text-muted-foreground">
            Each cycle through the loop is short, specific, and consequential.
            Every rep moves you measurably closer to the version of yourself you
            already named.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-px overflow-hidden border border-white/8 bg-white/5 md:grid-cols-2 lg:grid-cols-4">
          {stages.map((s) => (
            <div
              key={s.n}
              className="group relative flex h-full flex-col bg-[oklch(0.19_0_0)] p-7 transition-colors hover:bg-[oklch(0.21_0_0)]"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] tracking-[0.18em] text-[oklch(0.72_0.18_245)]">
                  {s.n}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  {s.label}
                </span>
              </div>
              <h3 className="mt-12 font-display text-xl leading-[1.2] tracking-[-0.025em] text-foreground">
                {s.title}
              </h3>
              <p className="mt-3 text-[13.5px] leading-[1.65] text-muted-foreground">
                {s.body}
              </p>
              <div className="mt-10 h-px w-12 bg-[oklch(0.72_0.18_245)]/40 transition-all group-hover:w-20 group-hover:bg-[oklch(0.72_0.18_245)]" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BuiltForTheGap() {
  const features = [
    {
      kicker: "Diagnosis",
      title: "Maps your real weakness, not the obvious one.",
      body: "Multi-axis evaluation isolates root cause from symptom. You don't get told to 'practice more' — you get told exactly which sub-skill is failing under load.",
    },
    {
      kicker: "Scenarios",
      title: "High-stakes simulations, calibrated to you.",
      body: "Domain-specific arenas pressure-test the skill in context. Difficulty climbs until you reach the edge of your range — the only place real growth happens.",
    },
    {
      kicker: "Repair",
      title: "Targeted reps, not generic drills.",
      body: "Repair mode is narrow on purpose. One weakness at a time, attacked until it stops reproducing.",
    },
    {
      kicker: "Proof",
      title: "Evidence you can stand on.",
      body: "Your profile is artifact-first: benchmarks, feats, and closed gaps. No vanity stats. No streaks. Just what you've actually demonstrated.",
    },
  ];

  return (
    <section id="built" className="relative border-t border-white/5">
      <div className="mx-auto max-w-7xl px-6 py-28 sm:py-36">
        <div className="max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
            Built for the gap
          </p>
          <h2 className="mt-5 font-display text-3xl leading-[1.1] tracking-[-0.035em] text-foreground sm:text-5xl">
            A surgical training stack —
            <br />
            <span className="text-muted-foreground">not another course.</span>
          </h2>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.kicker}
              className="group relative border border-white/8 bg-[oklch(0.19_0_0)] p-8 transition-colors hover:border-white/20"
            >
              <div className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 bg-[oklch(0.72_0.18_245)]" />
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  {f.kicker}
                </span>
              </div>
              <h3 className="mt-5 max-w-md font-display text-2xl leading-[1.2] tracking-[-0.03em] text-foreground">
                {f.title}
              </h3>
              <p className="mt-4 max-w-lg text-[14px] leading-[1.7] text-muted-foreground">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClosingCta({ isAuthed }: { isAuthed: boolean }) {
  return (
    <section className="relative border-t border-white/5">
      <div className="bp-page-bg">
        <div className="mx-auto max-w-5xl px-6 py-32 text-center sm:py-44">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
            Cross the breakpoint
          </p>
          <h2 className="mx-auto mt-6 max-w-3xl font-display text-4xl leading-[1.05] tracking-[-0.04em] text-foreground sm:text-6xl">
            Stop reading about the person
            <br />
            you said you'd become.
            <br />
            <span className="text-[oklch(0.72_0.18_245)]">Train into them.</span>
          </h2>
          <div className="mt-10 flex justify-center">
            {isAuthed ? (
              <Button
                asChild
                size="lg"
                className="h-12 rounded-none bg-white px-8 text-sm font-medium tracking-tight text-black hover:bg-white/90"
              >
                <Link href="/workspace">
                  Open workspace
                  <span aria-hidden className="ml-2">
                    →
                  </span>
                </Link>
              </Button>
            ) : (
              <div className="[&_button]:h-12 [&_button]:rounded-none [&_button]:bg-white [&_button]:px-8 [&_button]:text-sm [&_button]:font-medium [&_button]:tracking-tight [&_button]:text-black [&_button]:hover:bg-white/90">
                <AuthShowcase />
              </div>
            )}
          </div>
          <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground/70">
            This is not self-help. This is training.
          </p>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-white/5">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-6 py-10 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="font-display text-sm tracking-[-0.04em] text-foreground">
            BREAKPOINT
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            v0.1
          </span>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          Diagnose · Pressure · Debrief · Repeat
        </p>
      </div>
    </footer>
  );
}
