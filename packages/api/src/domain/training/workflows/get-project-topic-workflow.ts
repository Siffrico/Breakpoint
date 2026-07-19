import { err, ok } from "../../../lib/result";
import type { Result } from "../../../lib/result";
import type { CurriculumPlan } from "../types/training.types";

interface ProjectOverview {
  title: string;
  summary: string;
  body: string;
  generatedAt: string | null;
}

interface JobProgressRow {
  nodeId: string;
  rating: number;
  ratingDeviation: number;
  lastRatedAt: Date | null;
}

export interface TopicAbilityElo {
  nodeId: string;
  title: string;
  summary: string;
  status: "planned" | "ready" | "completed";
  /** Live Glicko state, or null when the cluster has never been rated. */
  rating: number | null;
  ratingDeviation: number | null;
  lastRatedAt: string | null;
}

export interface ProjectTopic {
  title: string;
  targetIdentity: string;
  abilities: TopicAbilityElo[];
  overview: ProjectOverview | null;
}

export interface GetProjectTopicDependencies {
  getActivePlan: (sessionId: string) => Promise<CurriculumPlan | null>;
  getProjectOverview: (sessionId: string) => Promise<ProjectOverview | null>;
  getJobProgress: (nodeIds: string[]) => Promise<JobProgressRow[]>;
}

/**
 * Assembles a project's per-ability standing: each `ability` node
 * joined to its live Glicko rating (the "ELO"), plus the generated overview.
 * Pure and dependency-injected — the router supplies the DB-backed readers.
 */
export const getProjectTopicWorkflow = async ({
  sessionId,
  deps,
}: {
  sessionId: string;
  deps: GetProjectTopicDependencies;
}): Promise<Result<ProjectTopic>> => {
  const plan = await deps.getActivePlan(sessionId);
  if (!plan) {
    return err("Curriculum plan does not exist yet.");
  }

  const abilityNodes = plan.nodes.filter(
    (node) => node.kind === "ability",
  );

  const [progressRows, overview] = await Promise.all([
    deps.getJobProgress(abilityNodes.map((node) => node.id)),
    deps.getProjectOverview(sessionId),
  ]);

  const progressByNodeId = new Map(
    progressRows.map((row) => [row.nodeId, row]),
  );

  const abilities: TopicAbilityElo[] = abilityNodes.map((node) => {
    const progress = progressByNodeId.get(node.id) ?? null;

    return {
      nodeId: node.id,
      title: node.title,
      summary: node.summary,
      status: node.status,
      rating: progress?.rating ?? null,
      ratingDeviation: progress?.ratingDeviation ?? null,
      lastRatedAt: progress?.lastRatedAt?.toISOString() ?? null,
    };
  });

  return ok({
    title: plan.title,
    targetIdentity: plan.targetIdentity,
    abilities,
    overview,
  });
};
