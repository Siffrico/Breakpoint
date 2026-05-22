import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import { MockupCurriculum } from "~/features/marketing/components/mockup-curriculum";
import { MockupProject } from "~/features/marketing/components/mockup-project";
import { MockupUnit } from "~/features/marketing/components/mockup-unit";
import { MockupWorkspace } from "~/features/marketing/components/mockup-workspace";
import { getSession } from "~/auth/server";

export const metadata: Metadata = {
  title: "Breakpoint — train into the person you said you'd become",
  description:
    "Breakpoint builds you a curriculum around your real gap, makes every unit active, and puts you on projects that prove the skill is yours.",
};

export default async function HomePage() {
  const session = await getSession();
  const isAuthed = Boolean(session?.user);
  const startHref = isAuthed ? "/workspace" : "/auth";
  const startLabel = isAuthed ? "Open workspace" : "Start training";

  return (
    <div className="bp-landing min-h-dvh font-sans">
      <LandingNav isAuthed={isAuthed} />
      <main>
        <Hero startHref={startHref} startLabel={startLabel} />

        <FeatureSection
          kicker="Curriculum"
          title={
            <>
              Turns your goal into a curriculum
              <br />
              that actually fits you
            </>
          }
          body="Breakpoint reads where you are against where you said you wanted to be, then sequences a path — calibrated node by node, and reshaped every time you finish one."
          ctaLabel="Learn how curriculums are built"
          mockup={<MockupCurriculum />}
        />

        <FeatureSection
          kicker="Education units"
          title={
            <>
              Units that make you
              <br />
              do the thinking
            </>
          }
          body="Every unit is active. You read one sharp concept, then immediately apply it — explaining, composing, and getting checked in real time. Nothing to passively nod along to."
          ctaLabel="Learn how a unit works"
          mockup={<MockupUnit />}
        />

        <IntegrationsSection />

        <FeatureSection
          kicker="Projects"
          title={
            <>
              Build projects that prove
              <br />
              the skill is real
            </>
          }
          body="Capstones put the skill to work on something worth showing. Breakpoint guides you while you build and evaluates the artifact when you ship it — straight onto your profile."
          ctaLabel="Learn about capstone projects"
          mockup={<MockupProject />}
        />

        <TrustBand />
        <MethodSection />
        <PictureSection />
        <ChangelogSection />
        <CareersSection />
        <BlogSection />
        <ClosingCta startHref={startHref} startLabel={startLabel} />
      </main>
      <LandingFooter />
    </div>
  );
}

/* ─── primitives ──────────────────────────────────────────────────────── */

function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-[1180px] px-6 ${className ?? ""}`}>
      {children}
    </div>
  );
}

function Kicker({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--bp-text-tert)]">
      <span className="size-1.5 rounded-[2px] bg-[var(--bp-accent)]" />
      {children}
    </span>
  );
}

function PrimaryButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--bp-fg)] px-5 text-[13.5px] font-medium text-[var(--bp-bg)] transition-opacity hover:opacity-90"
    >
      {children}
    </Link>
  );
}

function GhostButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-11 items-center justify-center rounded-lg border border-[var(--bp-border-strong)] px-5 text-[13.5px] font-medium text-[var(--bp-fg)] transition-colors hover:bg-[var(--bp-card-02)]"
    >
      {children}
    </Link>
  );
}

function ArrowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[var(--bp-fg)] transition-colors hover:text-[var(--bp-accent)]"
    >
      {children}
      <span
        aria-hidden
        className="transition-transform group-hover:translate-x-0.5"
      >
        →
      </span>
    </Link>
  );
}

/* ─── nav ─────────────────────────────────────────────────────────────── */

function LandingNav({ isAuthed }: { isAuthed: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--bp-border-soft)] bg-[color-mix(in_srgb,var(--bp-bg)_82%,transparent)] backdrop-blur-md">
      <Container className="flex h-14 items-center justify-between">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="font-display text-[15px] font-semibold tracking-[-0.03em] text-[var(--bp-fg)]"
          >
            Breakpoint
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            {["Curriculum", "Units", "Projects", "Pricing"].map((l) => (
              <a
                key={l}
                href="#"
                className="text-[13px] text-[var(--bp-text-sec)] transition-colors hover:text-[var(--bp-fg)]"
              >
                {l}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={isAuthed ? "/workspace" : "/auth"}
            className="hidden text-[13px] text-[var(--bp-text-sec)] transition-colors hover:text-[var(--bp-fg)] sm:inline"
          >
            {isAuthed ? "Workspace" : "Sign in"}
          </Link>
          <Link
            href={isAuthed ? "/workspace" : "/auth"}
            className="inline-flex h-8 items-center rounded-md bg-[var(--bp-fg)] px-3.5 text-[12.5px] font-medium text-[var(--bp-bg)] transition-opacity hover:opacity-90"
          >
            {isAuthed ? "Open workspace" : "Start training"}
          </Link>
        </div>
      </Container>
    </header>
  );
}

/* ─── hero ────────────────────────────────────────────────────────────── */

function Hero({
  startHref,
  startLabel,
}: {
  startHref: string;
  startLabel: string;
}) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[460px]"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, color-mix(in srgb, var(--bp-accent) 14%, transparent), transparent 70%)",
        }}
      />
      <Container className="relative pt-20 pb-12 sm:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <Kicker>A training environment, not a course</Kicker>
          <h1 className="mt-5 font-display text-[44px] leading-[1.04] tracking-[-0.035em] text-[var(--bp-fg)] sm:text-[60px] lg:text-[72px]">
            Built to make you measurably better
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-[var(--bp-text-sec)] sm:text-[17px]">
            Breakpoint builds a curriculum around your real gap, makes every
            unit active, and puts you on projects that prove the skill is
            yours.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryButton href={startHref}>
              {startLabel}
              <span aria-hidden className="ml-1.5">
                →
              </span>
            </PrimaryButton>
            <GhostButton href="#method">See the method</GhostButton>
          </div>
        </div>
        <div className="relative mx-auto mt-14 max-w-[1000px]">
          <MockupWorkspace />
        </div>
      </Container>
    </section>
  );
}

/* ─── feature section (reused for the 3 sub-mockups) ──────────────────── */

function FeatureSection({
  kicker,
  title,
  body,
  ctaLabel,
  mockup,
}: {
  kicker: string;
  title: ReactNode;
  body: string;
  ctaLabel: string;
  mockup: ReactNode;
}) {
  return (
    <section className="border-t border-[var(--bp-border-soft)] py-20 sm:py-28">
      <Container>
        <div className="max-w-2xl">
          <Kicker>{kicker}</Kicker>
          <h2 className="mt-4 font-display text-[32px] leading-[1.1] tracking-[-0.03em] text-[var(--bp-fg)] sm:text-[44px]">
            {title}
          </h2>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--bp-text-sec)]">
            {body}
          </p>
          <div className="mt-5">
            <ArrowLink href="#">{ctaLabel}</ArrowLink>
          </div>
        </div>
        <div className="mt-12 max-w-[960px]">{mockup}</div>
      </Container>
    </section>
  );
}

/* ─── integrations band ───────────────────────────────────────────────── */

function IntegrationsSection() {
  const items = [
    {
      tag: "In your week",
      title: "Reps scheduled where you'll do them",
      body: "Short, consequential sessions land in the calendar you already live in.",
    },
    {
      tag: "In your inbox",
      title: "Debriefs that follow up",
      body: "The cold evaluation arrives where you read it — next unit already queued.",
    },
    {
      tag: "On your profile",
      title: "Proof that compounds",
      body: "Finished units and shipped projects stack into evidence you can point to.",
    },
  ];
  return (
    <section className="border-t border-[var(--bp-border-soft)] py-20 sm:py-28">
      <Container>
        <div className="max-w-2xl">
          <Kicker>Everywhere</Kicker>
          <h2 className="mt-4 font-display text-[32px] leading-[1.1] tracking-[-0.03em] text-[var(--bp-fg)] sm:text-[44px]">
            Fits the shape of your week
          </h2>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--bp-text-sec)]">
            Breakpoint runs in the background of your life — not in a tab you
            forget to open.
          </p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {items.map((it) => (
            <div
              key={it.tag}
              className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-card)] p-6 transition-colors hover:bg-[var(--bp-card-hover)]"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--bp-text-tert)]">
                {it.tag}
              </p>
              <h3 className="mt-3 text-[16px] tracking-[-0.01em] text-[var(--bp-fg)]">
                {it.title}
              </h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--bp-text-sec)]">
                {it.body}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ─── trust band ──────────────────────────────────────────────────────── */

function TrustBand() {
  const stats: [string, string][] = [
    ["3.1×", "faster to competence"],
    ["92%", "of units completed"],
    ["0", "vanity streaks"],
    ["48", "skill domains"],
  ];
  return (
    <section className="border-t border-[var(--bp-border-soft)] py-20 sm:py-28">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <Kicker>For teams</Kicker>
          <h2 className="mt-4 font-display text-[32px] leading-[1.1] tracking-[-0.03em] text-[var(--bp-fg)] sm:text-[44px]">
            Build skill that holds under load
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-[var(--bp-text-sec)]">
            Trusted by operators, founders, and teams who measure growth in reps
            closed — not hours watched.
          </p>
          <div className="mt-6 flex justify-center">
            <ArrowLink href="#">Explore Breakpoint for teams</ArrowLink>
          </div>
        </div>
        <div className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--bp-border)] bg-[var(--bp-border-soft)] sm:grid-cols-4">
          {stats.map(([n, l]) => (
            <div key={l} className="bg-[var(--bp-card)] p-6 text-center">
              <p className="font-display text-[28px] tracking-[-0.02em] text-[var(--bp-fg)]">
                {n}
              </p>
              <p className="mt-1 text-[12px] text-[var(--bp-text-sec)]">{l}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ─── method (node types) ─────────────────────────────────────────────── */

function MethodSection() {
  const methods: [string, string, string][] = [
    ["01", "Foundation", "Frames the mental model"],
    ["02", "Education unit", "Active practice with checks"],
    ["03", "Simulation", "A live, calibrated pressure test"],
    ["04", "Repair drill", "Targets one weakness at a time"],
    ["05", "Capstone", "Proves it on a real project"],
  ];
  return (
    <section
      id="method"
      className="border-t border-[var(--bp-border-soft)] py-20 sm:py-28"
    >
      <Container className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div className="max-w-md">
          <Kicker>The method</Kicker>
          <h2 className="mt-4 font-display text-[32px] leading-[1.1] tracking-[-0.03em] text-[var(--bp-fg)] sm:text-[44px]">
            The right node for every step
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[var(--bp-text-sec)]">
            Breakpoint draws on every mode of deliberate practice — and picks
            the one that matches the gap it found.
          </p>
          <div className="mt-5">
            <ArrowLink href="#">Explore the method</ArrowLink>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-[var(--bp-border)] bg-[var(--bp-card)]">
          {methods.map(([n, name, note], i) => (
            <div
              key={n}
              className={`flex items-center gap-4 px-5 py-4 ${
                i > 0 ? "border-t border-[var(--bp-border-soft)]" : ""
              }`}
            >
              <span className="font-mono text-[11px] text-[var(--bp-text-tert)]">
                {n}
              </span>
              <span className="text-[14.5px] text-[var(--bp-fg)]">{name}</span>
              <span className="ml-auto text-right text-[12.5px] text-[var(--bp-text-sec)]">
                {note}
              </span>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ─── skill map ───────────────────────────────────────────────────────── */

function PictureSection() {
  const rows: [string, number, string][] = [
    ["Negotiation · concession control", 92, "var(--bp-danger)"],
    ["Systems design · tradeoff framing", 74, "var(--bp-read)"],
    ["Executive comms · concision", 61, "var(--bp-grep)"],
    ["Cold outreach · opening line", 48, "var(--bp-edit)"],
  ];
  return (
    <section className="border-t border-[var(--bp-border-soft)] py-20 sm:py-28">
      <Container className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div className="order-2 lg:order-1">
          <div className="overflow-hidden rounded-xl border border-[var(--bp-border)] bg-[var(--bp-card)]">
            <div className="flex items-center gap-2 border-b border-[var(--bp-border-soft)] bg-[var(--bp-card-01)] px-4 py-2.5">
              <span className="text-[var(--bp-text-tert)]">⌕</span>
              <span className="font-mono text-[12px] text-[var(--bp-text-sec)]">
                where do I break under pressure?
              </span>
            </div>
            <div className="space-y-3 p-4">
              {rows.map(([skill, rel, tone]) => (
                <div key={skill}>
                  <div className="mb-1 flex items-center justify-between text-[12.5px]">
                    <span className="text-[var(--bp-fg-soft)]">{skill}</span>
                    <span className="font-mono text-[11px] text-[var(--bp-text-tert)]">
                      {rel}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bp-card-04)]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${rel}%`, background: tone }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="order-1 max-w-md lg:order-2">
          <Kicker>The map</Kicker>
          <h2 className="mt-4 font-display text-[32px] leading-[1.1] tracking-[-0.03em] text-[var(--bp-fg)] sm:text-[44px]">
            A complete picture of your skill
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[var(--bp-text-sec)]">
            Breakpoint learns how you perform across every domain — no matter
            how broad — and keeps the map current as you train.
          </p>
          <div className="mt-5">
            <ArrowLink href="#">Learn about the skill map</ArrowLink>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ─── changelog ───────────────────────────────────────────────────────── */

function ChangelogSection() {
  const entries: [string, string][] = [
    ["May 18, 2026", "Curriculum v2"],
    ["May 11, 2026", "Breakpoint for teams"],
    ["Apr 30, 2026", "Capstone projects"],
    ["Apr 22, 2026", "Compact debriefs"],
  ];
  return (
    <section className="border-t border-[var(--bp-border-soft)] py-20 sm:py-28">
      <Container>
        <div className="flex items-end justify-between gap-6">
          <div>
            <Kicker>Changelog</Kicker>
            <h2 className="mt-4 font-display text-[28px] leading-[1.1] tracking-[-0.03em] text-[var(--bp-fg)] sm:text-[36px]">
              Shipping every week
            </h2>
          </div>
          <ArrowLink href="#">See what's new</ArrowLink>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {entries.map(([date, title]) => (
            <a
              key={title}
              href="#"
              className="group rounded-xl border border-[var(--bp-border)] bg-[var(--bp-card)] p-5 transition-colors hover:bg-[var(--bp-card-hover)]"
            >
              <div className="bp-mock-grid mb-4 aspect-[16/10] rounded-lg border border-[var(--bp-border-soft)] bg-[var(--bp-card-02)]" />
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--bp-text-tert)]">
                {date}
              </p>
              <h3 className="mt-1.5 text-[14px] text-[var(--bp-fg)] transition-colors group-hover:text-[var(--bp-accent)]">
                {title}
              </h3>
            </a>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ─── careers ─────────────────────────────────────────────────────────── */

function CareersSection() {
  return (
    <section className="border-t border-[var(--bp-border-soft)] py-20 sm:py-28">
      <Container>
        <div className="overflow-hidden rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-card)]">
          <div className="grid gap-8 p-8 sm:p-12 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div className="max-w-lg">
              <Kicker>Careers</Kicker>
              <h2 className="mt-4 font-display text-[28px] leading-[1.15] tracking-[-0.03em] text-[var(--bp-fg)] sm:text-[38px]">
                Breakpoint is an applied research team building the future of
                deliberate practice.
              </h2>
              <div className="mt-6">
                <PrimaryButton href="#">
                  Join us
                  <span aria-hidden className="ml-1.5">
                    →
                  </span>
                </PrimaryButton>
              </div>
            </div>
            <div
              aria-hidden
              className="bp-mock-grid h-48 rounded-xl border border-[var(--bp-border-soft)] lg:h-64"
              style={{
                background:
                  "radial-gradient(120% 80% at 80% 0%, color-mix(in srgb, var(--bp-accent) 18%, transparent), transparent 60%), var(--bp-card-02)",
              }}
            />
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ─── blog ────────────────────────────────────────────────────────────── */

function BlogSection() {
  const posts: [string, string, string][] = [
    ["Research", "May 2026", "A technical report on adaptive curriculums"],
    ["Product", "Apr 2026", "Introducing capstone projects"],
    ["Company", "Apr 2026", "Meet the new Breakpoint"],
    ["Essay", "Mar 2026", "Why streaks don't build skill"],
  ];
  return (
    <section className="border-t border-[var(--bp-border-soft)] py-20 sm:py-28">
      <Container>
        <div className="flex items-end justify-between gap-6">
          <div>
            <Kicker>Blog</Kicker>
            <h2 className="mt-4 font-display text-[28px] leading-[1.1] tracking-[-0.03em] text-[var(--bp-fg)] sm:text-[36px]">
              From the team
            </h2>
          </div>
          <ArrowLink href="#">View all posts</ArrowLink>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {posts.map(([tag, date, title]) => (
            <a
              key={title}
              href="#"
              className="group flex flex-col rounded-xl border border-[var(--bp-border)] bg-[var(--bp-card)] p-5 transition-colors hover:bg-[var(--bp-card-hover)]"
            >
              <div className="bp-mock-grid mb-4 aspect-[16/10] rounded-lg border border-[var(--bp-border-soft)] bg-[var(--bp-card-02)]" />
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--bp-text-tert)]">
                {tag} · {date}
              </p>
              <h3 className="mt-1.5 text-[14px] leading-snug text-[var(--bp-fg)] transition-colors group-hover:text-[var(--bp-accent)]">
                {title}
              </h3>
            </a>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ─── closing cta ─────────────────────────────────────────────────────── */

function ClosingCta({
  startHref,
  startLabel,
}: {
  startHref: string;
  startLabel: string;
}) {
  return (
    <section className="relative overflow-hidden border-t border-[var(--bp-border-soft)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 120% at 50% 100%, color-mix(in srgb, var(--bp-accent) 16%, transparent), transparent 70%)",
        }}
      />
      <Container className="relative py-28 text-center sm:py-36">
        <h2 className="mx-auto max-w-2xl font-display text-[36px] leading-[1.05] tracking-[-0.035em] text-[var(--bp-fg)] sm:text-[56px]">
          Stop reading about who you said you'd become
        </h2>
        <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-[var(--bp-text-sec)]">
          Train into them. The loop only releases you when the gap no longer
          reproduces under pressure.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PrimaryButton href={startHref}>
            {startLabel}
            <span aria-hidden className="ml-1.5">
              →
            </span>
          </PrimaryButton>
          <GhostButton href="#method">See the method</GhostButton>
        </div>
        <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--bp-text-tert)]">
          This is not self-help. This is training.
        </p>
      </Container>
    </section>
  );
}

/* ─── footer ──────────────────────────────────────────────────────────── */

function LandingFooter() {
  const cols: { h: string; links: string[] }[] = [
    {
      h: "Product",
      links: [
        "Curriculum",
        "Education units",
        "Projects",
        "Pricing",
        "Workspace",
      ],
    },
    {
      h: "Resources",
      links: ["Method", "Changelog", "Docs", "Learn", "Help", "Status"],
    },
    { h: "Company", links: ["Careers", "Blog", "Community", "Research"] },
    { h: "Legal", links: ["Terms", "Privacy", "Data use", "Security"] },
  ];
  return (
    <footer className="border-t border-[var(--bp-border-soft)]">
      <Container className="py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Link
              href="/"
              className="font-display text-[15px] font-semibold tracking-[-0.03em] text-[var(--bp-fg)]"
            >
              Breakpoint
            </Link>
            <p className="mt-3 max-w-[210px] text-[12.5px] leading-relaxed text-[var(--bp-text-sec)]">
              A training environment for the person you said you'd become.
            </p>
          </div>
          {cols.map((c) => (
            <div key={c.h}>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--bp-text-tert)]">
                {c.h}
              </p>
              <ul className="mt-3 space-y-2">
                {c.links.map((l) => (
                  <li key={l}>
                    <a
                      href="#"
                      className="text-[13px] text-[var(--bp-text-sec)] transition-colors hover:text-[var(--bp-fg)]"
                    >
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-[var(--bp-border-soft)] pt-6 sm:flex-row sm:items-center">
          <p className="font-mono text-[11px] tracking-[0.04em] text-[var(--bp-text-tert)]">
            © 2026 Breakpoint · Diagnose · Pressure · Debrief · Repeat
          </p>
          <div className="flex items-center gap-4 text-[12px] text-[var(--bp-text-sec)]">
            {["X", "LinkedIn", "YouTube"].map((s) => (
              <a
                key={s}
                href="#"
                className="transition-colors hover:text-[var(--bp-fg)]"
              >
                {s}
              </a>
            ))}
          </div>
        </div>
      </Container>
    </footer>
  );
}
