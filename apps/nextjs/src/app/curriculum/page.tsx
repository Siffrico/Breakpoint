import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { listLearningProjects } from "~/features/training/server/training-queries";

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

  const projects = await listLearningProjects();
  const cookieSessionId = cookieStore.get(LAST_SESSION_COOKIE)?.value;
  const resolvedSessionId =
    session ?? cookieSessionId ?? projects[0]?.sessionId ?? null;

  if (!resolvedSessionId) {
    redirect("/onboarding");
  }

  redirect(`/settings/topics/${resolvedSessionId}`);
}
