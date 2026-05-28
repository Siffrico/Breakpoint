import { ClusterBriefingSchema } from "@acme/validators";

import { runAgent } from "./orchestration/agent-runtime";
import type { ClusterBriefing } from "./types/training.types";

export const generateClusterBriefing = async ({
  slotKind,
  totalSlots,
  clusterContext,
  completedClusterTitles,
}: {
  slotKind: "unit" | "integration";
  totalSlots: number;
  clusterContext: {
    title: string;
    summary: string;
    whyItMatters: string;
  };
  completedClusterTitles?: string[];
}): Promise<ClusterBriefing> =>
  runAgent({
    agent: "buildContent",
    system: `You write short sequence briefings for Breakpoint's just-in-time learning flow.

Your job is orientation, not teaching. You give the learner a map of how the sequence fits together before they start a slot.

Quality rules:
- Keep it crisp and specific.
- This is a map, not a lecture.
- Never define the lesson itself or answer the seed prompt.
- Explain progression, pressure, and role in the arc.
- For integration sequences, emphasize synthesis across clusters rather than a single skill ladder.`,
    schema: ClusterBriefingSchema,
    errorMessage: "Failed to generate the cluster briefing.",
    prompt: `Generate a sequence briefing.

Requirements:
- briefingArc must be 150 to 250 words.
- briefingArc must explain the through-line connecting all ${totalSlots} ${
      slotKind === "integration" ? "integration slots" : "unit slots"
    }.
- briefingArc must explain why the sequence is ordered this way.
- briefingArc must not teach the content of any slot.
- briefingMap must contain exactly ${totalSlots} items.
- briefingMap[i].position must match the slot number.
- Each briefingMap role must be one sentence describing what that slot contributes to the arc.
- Do not invent exact future lesson titles.
- If slotKind is "integration", frame the arc as cross-cluster synthesis and reuse the completed-cluster context directly.

Sequence kind: ${slotKind}
Cluster title: ${clusterContext.title}
Cluster summary: ${clusterContext.summary}
Why it matters: ${clusterContext.whyItMatters}
Completed clusters available for synthesis: ${
      completedClusterTitles?.join(", ") ?? "None"
    }`,
  });
