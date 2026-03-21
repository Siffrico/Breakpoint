import Link from "next/link";

const previews = [
  {
    href: "/ui/onboarding",
    label: "Onboarding",
    description: "Conversation flow with local fake progression.",
  },
  {
    href: "/ui/home",
    label: "Home",
    description: "Workspace overview with seeded progress data.",
  },
  {
    href: "/ui/profile",
    label: "Profile",
    description: "Identity profile and behavior signal layout.",
  },
  {
    href: "/ui/plan",
    label: "Plan",
    description: "Curriculum map reveal with mock nodes.",
  },
  {
    href: "/ui/train",
    label: "Unit",
    description: "Retrieval check, scenario unlock, and debrief preview.",
  },
  {
    href: "/ui/domains",
    label: "E.S.D.E.",
    description: "Domain grid plus an interactive scenario preview.",
  },
];

export default function UiPreviewIndexPage() {
  return (
    <main className="min-h-screen bg-[#06070a] px-5 py-8 text-white sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <div className="border-b border-white/8 pb-6">
          <p className="text-xs tracking-[0.3em] uppercase text-white/35">
            Testing Mode
          </p>
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
              <div className="text-xs tracking-[0.26em] uppercase text-white/35">
                Preview
              </div>
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
