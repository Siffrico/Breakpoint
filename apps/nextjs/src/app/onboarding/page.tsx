import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { env } from "~/env";
import { OnboardingShell } from "~/features/training/components/onboarding-shell";
import { TRPCReactProvider } from "~/trpc/react";
import { getQueryClient, trpc } from "~/trpc/server";

export const metadata: Metadata = {
  title: "Onboarding",
  description: "Set up your Breakpoint learning path.",
};

/**
 * Local-only switch between the two curriculum shapes. Topic mode is still
 * being built out, so this never renders in production — and the server
 * refuses a "topic" request there regardless, because a session's mode is
 * permanent once set.
 */
function CurriculumModeDevToggle({ active }: { active: "ability" | "topic" }) {
  const options = [
    { mode: "ability" as const, label: "abilities", href: "/onboarding?new=1" },
    {
      mode: "topic" as const,
      label: "topic",
      href: "/onboarding?new=1&curriculum=topic",
    },
  ];
  return (
    <div className="text-muted-foreground pointer-events-auto fixed bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3 text-xs">
      <span>dev · curriculum</span>
      {options.map((option) => (
        <a
          key={option.mode}
          href={option.href}
          className={
            option.mode === active
              ? "text-foreground underline underline-offset-4"
              : "hover:text-foreground"
          }
        >
          {option.label}
        </a>
      ))}
    </div>
  );
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{
    new?: string;
    session?: string;
    curriculum?: string;
  }>;
}) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/auth");
  }

  const params = await searchParams;
  const startNewProject = params.new === "1";
  const curriculumMode = params.curriculum === "topic" ? "topic" : "ability";
  const showModeToggle = env.NODE_ENV !== "production";
  // A normal visit restores even a just-completed build, so reloading before
  // pressing "Start learning" cannot silently create a replacement session.
  // Only the explicit new-project action opts out of restoration.
  const initialState = startNewProject
    ? null
    : params.session
      ? await getQueryClient().fetchQuery(
          trpc.training.onboardingState.queryOptions({
            sessionId: params.session,
          }),
        )
      : await getQueryClient().fetchQuery(
          trpc.training.resumeOnboarding.queryOptions(),
        );

  // Manual/imported projects do not have a streamed build card to restore.
  // Their useful recovery destination is the workspace, not an empty chat.
  if (
    initialState?.phase === "ready_for_generation" &&
    !initialState.projectBuild
  ) {
    redirect(
      `/workspace?session=${encodeURIComponent(initialState.sessionId)}`,
    );
  }

  return (
    <TRPCReactProvider>
      <OnboardingShell
        key={initialState?.sessionId ?? "new"}
        initialState={initialState}
        curriculumMode={curriculumMode}
      />
      {showModeToggle ? (
        <CurriculumModeDevToggle active={curriculumMode} />
      ) : null}
    </TRPCReactProvider>
  );
}
