import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Breakpoint preview",
  description: "Preview the Breakpoint application shell.",
};

const previews = [
  {
    href: "/ui/onboarding",
    label: "Onboarding",
    description: "Conversation flow with local fake progression.",
  },
  {
    href: "/ui/workspace",
    label: "Workspace",
    description: "Main workspace shell with local preview data.",
  },
  {
    href: "/ui/profile/profile",
    label: "Settings · Profile",
    description: "Account identity and training profile.",
  },
  {
    href: "/ui/profile/general",
    label: "Settings · General",
    description: "Theme, model, and memory surfaces.",
  },
  {
    href: "/ui/profile/teachers",
    label: "Settings · Teachers",
    description: "Teacher agents and system prompts (WIP).",
  },
  {
    href: "/ui/profile/billing",
    label: "Settings · Billing",
    description: "Plan and subscription management.",
  },
  {
    href: "/ui/profile/topics",
    label: "Settings · Projects",
    description: "Populated project manager and project standing pages.",
  },
  {
    href: "/ui/mission",
    label: "Mission",
    description: "A filled-in active mission with local proof submission.",
  },
  {
    href: "/ui/train",
    label: "Unit 1 — Your First Training Loop",
    description:
      "97% accuracy challenge: spot the train/real-world gap before shipping.",
  },
  {
    href: "/ui/courses",
    label: "Courses",
    description: "Outcome-based course catalog and discovery.",
  },
  {
    href: "/ui/chat-lab",
    label: "Chat Lab",
    description:
      "Mock-streamed text, LaTeX, and mermaid across chat designs — real useChat, faked transport.",
  },
];

export default function UiPreviewIndexPage() {
  return (
    <main className="min-h-screen bg-[#06070a] px-5 py-8 text-white sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <div className="border-b border-white/8 pb-6">
          <h1 className="font-display mt-3 text-4xl tracking-[-0.06em] sm:text-5xl">
            UI preview hub
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-8 text-white/60">
            These routes render local mock data only. No database is required.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {previews.map((preview) => (
            <Link
              key={preview.href}
              href={preview.href}
              className="border border-white/10 bg-white/[0.03] p-6 transition-colors hover:bg-white/[0.06]"
            >
              <div className="font-display mt-3 text-2xl tracking-[-0.05em]">
                {preview.label}
              </div>
              <div className="mt-4 text-sm leading-7 text-white/58">
                {preview.description}
              </div>
              <div className="mt-6 text-sm text-white/75">Open route →</div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
