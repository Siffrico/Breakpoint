import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Curriculum",
  description: "Review your Breakpoint curriculum.",
};

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { CurriculumReveal } from "~/features/training/components/curriculum-reveal";
import {
  getActivePlan,
  listLearningProjects,
} from "~/features/training/server/training-queries";

const LAST_SESSION_COOKIE = "bp-last-learning-session";

export default async function CurriculumPage(props: {
  searchParams: Promise<{ session?: string }>;
}) {
  const [{ session }, authSession, cookieStore] = await Promise.all([
    props.searchParams,
    getSession(),
    cookies(),
  ]);

  if (!authSession?.user) {
    redirect("/");
  }

  const projects = await listLearningProjects().catch(() => []);
  const cookieSessionId = cookieStore.get(LAST_SESSION_COOKIE)?.value;
  const resolvedSessionId =
    session ?? cookieSessionId ?? projects[0]?.sessionId ?? null;

  if (!resolvedSessionId) {
    redirect("/onboarding");
  }

  if (!session) {
    redirect(`/curriculum?session=${resolvedSessionId}`);
  }

  const plan = await getActivePlan(resolvedSessionId).catch(() => null);

  if (!plan) {
    return (
      <main className="min-h-dvh bg-background text-foreground">
        <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-5 py-12">
          <div className="border border-border bg-card p-6">
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Curriculum unavailable
            </div>
            <h1 className="mt-3 font-display text-2xl tracking-[-0.03em]">
              The curriculum could not be loaded.
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The onboarding session exists, but no saved curriculum plan was
              found for it yet.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return <CurriculumReveal plan={plan} sessionId={resolvedSessionId} />;
}
