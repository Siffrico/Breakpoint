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
    redirect(`/workspace?session=${resolvedSessionId}`);
  }

  return <CurriculumReveal plan={plan} sessionId={resolvedSessionId} />;
}
