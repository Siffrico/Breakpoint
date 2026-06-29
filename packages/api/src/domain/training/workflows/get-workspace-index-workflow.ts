// Builds the searchable index that powers the workspace command palette (⌘K):
// every learning project the user owns, each with the full list of its training
// chats (unit + integration nodes). Kept separate from `listLearningProjects`
// so the sidebar's lightweight preview (3 lessons) is not bloated with the full
// chat list this palette needs.

interface WorkspaceIndexSession {
  id: string;
  updatedAt: Date | null;
  createdAt: Date;
}

interface WorkspaceIndexPlan {
  id: string;
  onboardingSessionId: string;
  title: string | null;
}

interface WorkspaceIndexProfile {
  onboardingSessionId: string;
  targetIdentity: string | null;
}

interface WorkspaceIndexNode {
  id: string;
  planId: string;
  kind: string;
  status: string;
  title: string;
  orderIndex: number;
}

export interface WorkspaceIndexChat {
  id: string;
  title: string;
  status: string;
}

export interface WorkspaceIndexProject {
  sessionId: string;
  title: string;
  chats: WorkspaceIndexChat[];
}

export interface WorkspaceIndexDependencies {
  listSessionsByUser: () => Promise<WorkspaceIndexSession[]>;
  listProfilesBySessionIds: (
    sessionIds: string[],
  ) => Promise<WorkspaceIndexProfile[]>;
  listPlansBySessionIds: (
    sessionIds: string[],
  ) => Promise<WorkspaceIndexPlan[]>;
  listNodesByPlanIds: (planIds: string[]) => Promise<WorkspaceIndexNode[]>;
}

const isChatNode = (node: WorkspaceIndexNode) =>
  node.kind === "unit" || node.kind === "integration";

export const getWorkspaceIndexWorkflow = async ({
  deps,
}: {
  deps: WorkspaceIndexDependencies;
}): Promise<WorkspaceIndexProject[]> => {
  const sessions = await deps.listSessionsByUser();
  if (sessions.length === 0) {
    return [];
  }

  const sessionIds = sessions.map((session) => session.id);
  const [profiles, plans] = await Promise.all([
    deps.listProfilesBySessionIds(sessionIds),
    deps.listPlansBySessionIds(sessionIds),
  ]);

  const nodes = await deps.listNodesByPlanIds(plans.map((plan) => plan.id));

  const targetIdentityBySessionId = new Map(
    profiles.map((profile) => [
      profile.onboardingSessionId,
      profile.targetIdentity,
    ]),
  );
  const planBySessionId = new Map(
    plans.map((plan) => [plan.onboardingSessionId, plan]),
  );
  const sessionIdByPlanId = new Map(
    plans.map((plan) => [plan.id, plan.onboardingSessionId]),
  );

  const chatsBySessionId = new Map<string, WorkspaceIndexChat[]>();
  for (const node of nodes) {
    if (!isChatNode(node)) {
      continue;
    }

    const sessionId = sessionIdByPlanId.get(node.planId);
    if (!sessionId) {
      continue;
    }

    const existing = chatsBySessionId.get(sessionId);
    const chat: WorkspaceIndexChat = {
      id: node.id,
      title: node.title,
      status: node.status,
    };
    if (existing) {
      existing.push(chat);
    } else {
      chatsBySessionId.set(sessionId, [chat]);
    }
  }

  return sessions.map((session) => {
    const plan = planBySessionId.get(session.id) ?? null;
    return {
      sessionId: session.id,
      title:
        plan?.title ??
        targetIdentityBySessionId.get(session.id) ??
        "New learning track",
      chats: chatsBySessionId.get(session.id) ?? [],
    };
  });
};
