// Builds the searchable index that powers the workspace command palette (⌘K):
// every learning project the user owns, with only the curriculum units that
// have an actual persisted conversation.

import { deriveProvisionalProjectTitle } from "../services/provisional-project-title";

interface WorkspaceIndexSession {
  id: string;
  status: string;
  updatedAt: Date | null;
  createdAt: Date;
}

interface WorkspaceIndexPlan {
  id: string;
  onboardingSessionId: string;
  title: string | null;
  status: string;
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
  listFirstUserMessagesBySessionIds: (
    sessionIds: string[],
  ) => Promise<{ sessionId: string; content: string }[]>;
  listChatUnitIdsBySessionIds: (
    sessionIds: string[],
  ) => Promise<{ sessionId: string; unitId: string }[]>;
  listNodesByPlanIds: (planIds: string[]) => Promise<WorkspaceIndexNode[]>;
}

const isChatNode = (node: WorkspaceIndexNode) =>
  node.kind === "unit";

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
  const [profiles, plans, firstUserMessages, chatUnits] = await Promise.all([
    deps.listProfilesBySessionIds(sessionIds),
    deps.listPlansBySessionIds(sessionIds),
    deps.listFirstUserMessagesBySessionIds(sessionIds),
    deps.listChatUnitIdsBySessionIds(sessionIds),
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
  const firstUserMessageBySessionId = new Map(
    firstUserMessages.map((message) => [message.sessionId, message.content]),
  );
  const sessionIdByPlanId = new Map(
    plans.map((plan) => [plan.id, plan.onboardingSessionId]),
  );
  const chatUnitIdsBySessionId = new Map<string, Set<string>>();
  for (const chatUnit of chatUnits) {
    const unitIds = chatUnitIdsBySessionId.get(chatUnit.sessionId);
    if (unitIds) {
      unitIds.add(chatUnit.unitId);
    } else {
      chatUnitIdsBySessionId.set(
        chatUnit.sessionId,
        new Set([chatUnit.unitId]),
      );
    }
  }

  const chatsBySessionId = new Map<string, WorkspaceIndexChat[]>();
  for (const node of nodes.sort(
    (left, right) => right.orderIndex - left.orderIndex,
  )) {
    if (!isChatNode(node)) {
      continue;
    }

    const sessionId = sessionIdByPlanId.get(node.planId);
    if (!sessionId) {
      continue;
    }
    if (!chatUnitIdsBySessionId.get(sessionId)?.has(node.id)) {
      continue;
    }

    const existing = chatsBySessionId.get(sessionId);
    const chat: WorkspaceIndexChat = {
      id: node.id,
      title: node.title,
    };
    if (existing) {
      existing.push(chat);
    } else {
      chatsBySessionId.set(sessionId, [chat]);
    }
  }

  let onboardingProjectEmitted = false;
  return sessions.flatMap((session) => {
    const plan = planBySessionId.get(session.id) ?? null;
    const planTitle = plan?.title?.trim() ?? "";
    const identityTitle =
      targetIdentityBySessionId.get(session.id)?.trim() ?? "";
    const title =
      planTitle ||
      identityTitle ||
      deriveProvisionalProjectTitle(
        firstUserMessageBySessionId.get(session.id) ?? "",
      );

    if (!title) return [];

    const status =
      plan?.status === "active"
        ? "active"
        : plan ||
            session.status === "ready_for_generation" ||
            session.status === "complete"
          ? "building"
          : "onboarding";
    if (status === "onboarding") {
      if (onboardingProjectEmitted) return [];
      onboardingProjectEmitted = true;
    }

    return [
      {
        sessionId: session.id,
        title,
        chats: chatsBySessionId.get(session.id) ?? [],
      },
    ];
  });
};
