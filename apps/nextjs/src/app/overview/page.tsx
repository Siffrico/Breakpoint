import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { AssistantRichText } from "~/features/training/components/assistant-rich-text";
import {
  getActivePlan,
  getProjectOverview,
  listLearningProjects,
} from "~/features/training/server/training-queries";

export const metadata: Metadata = {
  title: "Project Overview",
  description: "Review the high-level map for your Breakpoint project.",
};

const LAST_SESSION_COOKIE = "bp-last-learning-session";

export default async function OverviewPage(props: {
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
    redirect(`/overview?session=${resolvedSessionId}`);
  }

  const plan = await getActivePlan(resolvedSessionId).catch(() => null);

  if (!plan) {
    redirect(`/workspace?session=${resolvedSessionId}`);
  }

  const overview = await getProjectOverview(resolvedSessionId).catch(
    () => null,
  );

  return (
    <main className="bg-background text-foreground min-h-dvh">
      <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
        <h1 className="font-display text-foreground text-2xl tracking-[-0.03em]">
          {overview?.title ?? plan.title}
        </h1>

        {overview?.summary ? (
          <p className="text-foreground/56 mt-3 text-[14px] leading-6">
            {overview.summary}
          </p>
        ) : null}

        <article className="bp-prose mt-8 text-[15px] leading-7">
          {overview ? (
            <AssistantRichText content={overview.body} />
          ) : (
            <p className="text-foreground/56">
              This project was created before overview generation was enabled.
            </p>
          )}
        </article>
      </div>
    </main>
  );
}
