import { deriveProvisionalProjectTitle } from "../services/provisional-project-title";

interface UnfinishedSession {
  id: string;
  status: string;
  updatedAt: Date | null;
  createdAt: Date;
}

interface BuildRun {
  sessionId: string;
  updatedAt: Date;
  run: {
    status: "building" | "complete" | "error";
    state: { projectName?: string };
  };
}

export interface UnfinishedOnboardingSummary {
  sessionId: string;
  title: string;
  status: "onboarding" | "building" | "interrupted" | "error";
  updatedAt: Date;
}

const INTERRUPTED_AFTER_MS = 360_000;

/**
 * Takes owned onboarding records, produces compact resumable summaries, and
 * fails only when a dependency read fails.
 */
export const listUnfinishedOnboardingSessionsWorkflow = async ({
  now = new Date(),
  deps,
}: {
  now?: Date;
  deps: {
    listSessions: () => Promise<UnfinishedSession[]>;
    listFirstUserMessages: (
      sessionIds: string[],
    ) => Promise<{ sessionId: string; content: string }[]>;
    listBuildRuns: (sessionIds: string[]) => Promise<BuildRun[]>;
  };
}): Promise<UnfinishedOnboardingSummary[]> => {
  const sessions = (await deps.listSessions()).filter(
    (session) => session.status !== "complete",
  );
  if (sessions.length === 0) return [];

  const sessionIds = sessions.map((session) => session.id);
  const [firstMessages, buildRuns] = await Promise.all([
    deps.listFirstUserMessages(sessionIds),
    deps.listBuildRuns(sessionIds),
  ]);
  const firstMessageBySessionId = new Map(
    firstMessages.map((message) => [message.sessionId, message.content]),
  );
  const runBySessionId = new Map(
    buildRuns.map((record) => [record.sessionId, record]),
  );

  return sessions.map((session) => {
    const runRecord = runBySessionId.get(session.id);
    const run = runRecord?.run;
    const updatedAt =
      runRecord?.updatedAt ?? session.updatedAt ?? session.createdAt;
    const projectName = run?.state.projectName?.trim() ?? "";
    const provisionalTitle = deriveProvisionalProjectTitle(
      firstMessageBySessionId.get(session.id) ?? "",
    );
    const title =
      [projectName, provisionalTitle].find(
        (candidate) => (candidate?.length ?? 0) > 0,
      ) ?? "New onboarding";
    const status =
      run?.status === "error"
        ? "error"
        : run?.status === "building"
          ? now.getTime() - updatedAt.getTime() >= INTERRUPTED_AFTER_MS
            ? "interrupted"
            : "building"
          : "onboarding";

    return { sessionId: session.id, title, status, updatedAt };
  });
};
