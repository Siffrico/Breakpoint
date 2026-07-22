import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { TopicNavItem } from "~/features/settings/components/settings-nav";
import { SettingsShell } from "~/features/settings/components/settings-shell";
import { TopicDetail } from "~/features/settings/components/topics/topic-detail";
import { previewLearningProjects } from "~/features/training/lib/training-preview";

export const metadata: Metadata = {
  title: "Project · Settings preview",
  description: "Preview a populated learning project standing page.",
};

const previewTopic: Parameters<typeof TopicDetail>[0]["topic"] = {
  title: "AI Engineering",
  targetIdentity:
    "An AI engineer who can ship LLM systems that survive real traffic.",
  abilities: [
    {
      nodeId: "preview-llm-behavior",
      title: "LLM behavior under production pressure",
      summary:
        "Reason about sampling, drift, and the difference between a plausible answer and a reliable system.",
      status: "completed",
      rating: 1542,
      ratingDeviation: 68,
      lastRatedAt: "2026-04-10T23:40:00.000Z",
    },
    {
      nodeId: "preview-evals",
      title: "Evaluation and regression judgment",
      summary:
        "Design evals that detect user-visible regressions before a release makes them expensive.",
      status: "ready",
      rating: 1388,
      ratingDeviation: 112,
      lastRatedAt: "2026-04-08T17:10:00.000Z",
    },
    {
      nodeId: "preview-retrieval",
      title: "Retrieval correctness",
      summary:
        "Separate retrieval quality from answer quality and diagnose the layer that actually failed.",
      status: "planned",
      rating: null,
      ratingDeviation: null,
      lastRatedAt: null,
    },
  ],
  overview: {
    title: "AI Engineering Core",
    summary: "A practical path from model behavior to production judgment.",
    body: "You are building the instinct to explain an LLM system from its observed behavior—not from its marketing claims. The current edge is evaluation judgment: decide what evidence would make a release safe, then trace failures through retrieval, prompts, tools, and latency.",
    generatedAt: "2026-04-10T23:40:00.000Z",
  },
};

export default async function UiPreviewProjectDetailPage(props: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await props.params;
  const project = previewLearningProjects.find(
    (candidate) => candidate.sessionId === sessionId,
  );

  if (!project) notFound();

  const topics = previewLearningProjects.map(
    (candidate): TopicNavItem => ({
      sessionId: candidate.sessionId,
      title: candidate.title,
      status: candidate.status === "active" ? "active" : "onboarding",
    }),
  );

  return (
    <SettingsShell basePath="/ui/profile" topics={topics}>
      {project.sessionId === previewLearningProjects[0]?.sessionId ? (
        <TopicDetail topic={previewTopic} />
      ) : (
        <TopicDetail
          topic={{
            title: project.title,
            targetIdentity: "A learner building durable technical judgment.",
            abilities: [],
            overview: null,
          }}
        />
      )}
    </SettingsShell>
  );
}
