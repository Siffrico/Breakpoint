"use client";

import {
  ArrowRight,
  Brain,
  Code,
  Cube,
  GameController,
  Graph,
  Lock,
  Rocket,
  ShieldCheck,
  Target,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";

interface Course {
  id: string;
  title: string;
  outcome: string;
  description: string;
  icon: React.ElementType;
  units: number;
  estimatedHours: number;
  difficulty: "foundational" | "intermediate" | "advanced";
  tags: string[];
  available: boolean;
}

const COURSES: Course[] = [
  {
    id: "production-swe",
    title: "Ship production code daily",
    outcome: "You write code that passes review, survives prod, and ships on Monday.",
    description:
      "Build the instincts of a senior engineer. Read codebases fast, write code that other people can maintain, debug under pressure, and make architectural calls that hold up six months later.",
    icon: Code,
    units: 24,
    estimatedHours: 40,
    difficulty: "intermediate",
    tags: ["systems thinking", "code review", "debugging", "architecture"],
    available: true,
  },
  {
    id: "system-design",
    title: "Design systems that don't fall over",
    outcome: "You can whiteboard a system under pressure and defend every tradeoff.",
    description:
      "Go beyond memorizing patterns. Learn to reason about load, failure modes, consistency tradeoffs, and cost. Walk into any system design round and drive the conversation.",
    icon: Graph,
    units: 18,
    estimatedHours: 30,
    difficulty: "advanced",
    tags: ["distributed systems", "scalability", "tradeoffs", "interviews"],
    available: true,
  },
  {
    id: "build-games",
    title: "Make games people actually play",
    outcome: "You ship a game that someone who isn't your friend plays twice.",
    description:
      "Game feel, juice, scope control, and the discipline to finish. Start with a mechanic, build a loop, playtest ruthlessly, and ship something real.",
    icon: GameController,
    units: 20,
    estimatedHours: 50,
    difficulty: "intermediate",
    tags: ["game design", "game feel", "scope control", "shipping"],
    available: true,
  },
  {
    id: "ml-pipeline",
    title: "Deploy ML that works outside a notebook",
    outcome: "You own a model from data to production endpoint.",
    description:
      "Notebooks are not products. Learn to build pipelines that retrain, monitor drift, handle bad data, and serve predictions at latency your users won't notice.",
    icon: Brain,
    units: 22,
    estimatedHours: 45,
    difficulty: "advanced",
    tags: ["MLOps", "pipelines", "monitoring", "deployment"],
    available: false,
  },
  {
    id: "security-engineering",
    title: "Break things so they can't be broken",
    outcome: "You find the bug before the attacker does.",
    description:
      "Think like an adversary. Threat model real systems, find injection points, understand auth flows deeply enough to spot when they're wrong, and write code that defends itself.",
    icon: ShieldCheck,
    units: 16,
    estimatedHours: 35,
    difficulty: "advanced",
    tags: ["threat modeling", "AppSec", "auth", "adversarial thinking"],
    available: false,
  },
  {
    id: "frontend-craft",
    title: "Build interfaces that feel inevitable",
    outcome: "Your UI feels fast, obvious, and right — users don't think about it.",
    description:
      "Performance, accessibility, layout precision, animation timing. Move past 'it works' into 'it feels right'. Ship frontends that load fast, respond instantly, and never confuse.",
    icon: Cube,
    units: 20,
    estimatedHours: 38,
    difficulty: "intermediate",
    tags: ["performance", "a11y", "animation", "layout"],
    available: false,
  },
  {
    id: "startup-eng",
    title: "Be the engineer a startup bets on",
    outcome: "You can own a product surface end-to-end, alone, under ambiguity.",
    description:
      "Speed without recklessness. Build auth, payments, infra, and features in the same week. Make architectural bets that are cheap to reverse. Know when to ship ugly and when to get it right.",
    icon: Rocket,
    units: 26,
    estimatedHours: 55,
    difficulty: "intermediate",
    tags: ["full-stack", "speed", "product sense", "ownership"],
    available: false,
  },
  {
    id: "dsa-mastery",
    title: "Solve hard problems under a timer",
    outcome: "You see the pattern in 90 seconds and code the solution in 15 minutes.",
    description:
      "Not rote memorization. Build the pattern recognition and reduction instincts that let you decompose unfamiliar problems into familiar shapes, fast, under interview pressure.",
    icon: Target,
    units: 30,
    estimatedHours: 60,
    difficulty: "foundational",
    tags: ["algorithms", "data structures", "pattern recognition", "interviews"],
    available: true,
  },
];

type Filter = "all" | "available" | Course["difficulty"];

export function CoursesPage({ sessionId }: { sessionId?: string }) {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = COURSES.filter((c) => {
    if (filter === "all") return true;
    if (filter === "available") return c.available;
    return c.difficulty === filter;
  });

  const homeHref = sessionId ? `/home?session=${sessionId}` : "/home";

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-foreground/[0.06] px-6 sm:px-10">
        <div className="mx-auto flex h-12 max-w-[1600px] items-center justify-between">
          <div className="flex items-center gap-2 text-[14px] tracking-[-0.02em]">
            <Link
              href={homeHref}
              className="text-foreground/40 transition-colors hover:text-foreground/70"
            >
              Breakpoint
            </Link>
            <span className="text-foreground/20">/</span>
            <span className="font-medium text-foreground/80">Courses</span>
          </div>
          <Link
            href={homeHref}
            className="text-[13px] tracking-[-0.02em] text-foreground/40 transition-colors hover:text-foreground/70"
          >
            Back
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1600px] flex-1 px-6 pt-5 pb-16 sm:px-10">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["all", "All"],
              ["available", "Available now"],
              ["foundational", "Foundational"],
              ["intermediate", "Intermediate"],
              ["advanced", "Advanced"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={[
                "border px-3 py-1.5 text-[12px] font-medium tracking-[-0.02em] transition-colors",
                filter === value
                  ? "border-foreground/20 bg-foreground/[0.06] text-foreground/90"
                  : "border-foreground/[0.08] text-foreground/40 hover:text-foreground/65",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="mt-16 text-center text-[14px] text-foreground/30">
            No courses match this filter.
          </div>
        )}
      </div>
    </div>
  );
}

function CourseCard({ course }: { course: Course }) {
  const Icon = course.icon;

  return (
    <div
      className={[
        "group flex flex-col border border-foreground/[0.06] bg-card px-4 pt-4 pb-3.5 transition-[border-color]",
        course.available
          ? "hover:border-foreground/15"
          : "opacity-50",
      ].join(" ")}
    >
      <div className="flex items-center gap-2.5">
        <Icon
          size={16}
          weight="bold"
          className={course.available ? "text-foreground/60" : "text-foreground/20"}
        />
        <h2 className="min-w-0 flex-1 text-[13px] font-medium leading-tight tracking-[-0.02em] text-foreground/90">
          {course.title}
        </h2>
        {!course.available && <Lock size={12} className="shrink-0 text-foreground/20" />}
      </div>

      <p className="mt-2.5 text-[12px] leading-[1.55] tracking-[-0.01em] text-foreground/42">
        {course.outcome}
      </p>

      <div className="mt-auto flex items-center justify-between pt-4 text-[11px] tracking-[-0.01em] text-foreground/25">
        <div className="flex items-center gap-2.5">
          <span>{course.units} units</span>
          <span>~{course.estimatedHours}h</span>
        </div>
        {course.available && (
          <ArrowRight size={12} className="text-foreground/30 transition-colors group-hover:text-foreground/60" />
        )}
      </div>
    </div>
  );
}
