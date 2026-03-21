import { generateObject } from "ai";
import { z } from "zod/v4";

import type {
  CurriculumBlueprint,
  CurriculumNodeBlueprint,
  IdentityReport,
  UnitContentBlueprint,
} from "../types/becoming.types";
import { getBecomingModel } from "./becoming-model";

const CurriculumDraftSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  targetIdentity: z.string().min(1),
  clusters: z
    .array(
      z.object({
        title: z.string().min(1),
        summary: z.string().min(1),
        whyItMatters: z.string().min(1),
        units: z
          .array(
            z.object({
              title: z.string().min(1),
              summary: z.string().min(1),
              whyItMatters: z.string().min(1),
            }),
          )
          .length(2),
      }),
    )
    .length(3),
});

const ReadyUnitDraftSchema = z.object({
  units: z.array(
    z.object({
      nodeOrderIndex: z.number().int().min(0),
      title: z.string().min(1),
      concept: z.string().min(1),
      workedExample: z.string().min(1),
      retrievalItems: z
        .array(
          z.object({
            prompt: z.string().min(1),
            intent: z.string().min(1),
            expectedSignals: z.array(z.string().min(1)).min(2).max(5),
          }),
        )
        .length(3),
      scenario: z.object({
        title: z.string().min(1),
        prompt: z.string().min(1),
        focusAreas: z.array(z.string().min(1)).length(4),
        successCriteria: z.array(z.string().min(1)).length(4),
      }),
    }),
  ),
});

const buildNodes = (
  draft: z.infer<typeof CurriculumDraftSchema>,
  report: IdentityReport,
): CurriculumNodeBlueprint[] => {
  const nodes: CurriculumNodeBlueprint[] = [
    {
      parentOrderIndex: null,
      kind: "root",
      status: "completed",
      title: report.targetIdentity,
      summary: report.headline,
      whyItMatters: "This path exists because of the operator the user wants to become.",
      orderIndex: 0,
      depth: 0,
      positionColumn: 2,
      positionRow: 0,
    },
  ];

  let orderIndex = 1;
  let unitNumber = 0;

  draft.clusters.forEach((cluster, clusterIndex) => {
    const clusterOrderIndex = orderIndex++;
    nodes.push({
      parentOrderIndex: 0,
      kind: "skill_cluster",
      status: "completed",
      title: cluster.title,
      summary: cluster.summary,
      whyItMatters: cluster.whyItMatters,
      orderIndex: clusterOrderIndex,
      depth: 1,
      positionColumn: clusterIndex * 2,
      positionRow: 1,
    });

    cluster.units.forEach((unit, unitIndex) => {
      unitNumber += 1;
      nodes.push({
        parentOrderIndex: clusterOrderIndex,
        kind: "unit",
        status: unitNumber <= 2 ? "ready" : "planned",
        title: unit.title,
        summary: unit.summary,
        whyItMatters: unit.whyItMatters,
        orderIndex: orderIndex++,
        depth: 2,
        positionColumn: clusterIndex * 2 + unitIndex,
        positionRow: 2,
      });
    });
  });

  nodes.push({
    parentOrderIndex: 0,
    kind: "simulation",
    status: "planned",
    title: "Deep Simulation",
    summary: "A cumulative pressure test that interleaves the first five units.",
    whyItMatters: "Integration pressure shows whether separate skills have actually fused into behavior.",
    orderIndex,
    depth: 3,
    positionColumn: 2,
    positionRow: 3,
  });

  return nodes;
};

const buildInitialUnits = async ({
  report,
  nodes,
}: {
  report: IdentityReport;
  nodes: CurriculumNodeBlueprint[];
}): Promise<UnitContentBlueprint[]> => {
  const model = getBecomingModel();
  if (!model) {
    throw new Error("OPENAI_API_KEY is required for AI-generated unit creation.");
  }

  const readyNodes = nodes.filter(
    (node) => node.kind === "unit" && node.status === "ready",
  );

  const { object } = await generateObject({
    model,
    schema: ReadyUnitDraftSchema,
    system:
      "You are the education-unit-builder for an identity-driven training product. Build dense, sharp units that teach one thing cleanly, force recall, and then pressure-test application. No fluff. No generic teaching language. Every unit should feel like it was built for this user's target self.",
    prompt: `Generate the first ready units for this learner.

Requirements:
- Return one payload for each ready unit listed below.
- Keep the title aligned with the unit title already chosen.
- Concept should teach how to think, not just what to know.
- Worked example should show strong reasoning in action.
- Retrieval items should force recall, not recognition.
- Scenario should feel high-pressure and specific.
- Focus areas and success criteria must each contain exactly 4 items.
- expectedSignals should be short phrases that are strong evidence of understanding.

Identity report:
Target identity: ${report.targetIdentity}
Headline: ${report.headline}
Motivation: ${report.motivation}
Current baseline: ${report.currentBaseline}
Proof of progress: ${report.proofOfProgress}
Hard moments: ${report.hardMoments.join("; ")}
Constraints: ${report.constraints.join("; ") || "None provided"}
Behavior signals: ${report.behaviorSignals.join("; ")}

Ready units:
${readyNodes
  .map(
    (node) =>
      `- order=${node.orderIndex} | title=${node.title} | summary=${node.summary} | why=${node.whyItMatters}`,
  )
  .join("\n")}`,
  });

  const readyNodeByOrder = new Map(
    readyNodes.map((node) => [node.orderIndex, node]),
  );

  if (
    object.units.length !== readyNodes.length ||
    object.units.some((unit) => !readyNodeByOrder.has(unit.nodeOrderIndex))
  ) {
    throw new Error("AI returned unit payloads that do not match the ready nodes.");
  }

  return object.units.map((unit) => ({
    nodeOrderIndex: unit.nodeOrderIndex,
    title: readyNodeByOrder.get(unit.nodeOrderIndex)?.title ?? unit.title,
    concept: unit.concept,
    workedExample: unit.workedExample,
    retrievalItems: unit.retrievalItems as UnitContentBlueprint["retrievalItems"],
    scenario: unit.scenario,
  }));
};

export const buildCurriculumPlan = async (
  report: IdentityReport,
): Promise<CurriculumBlueprint> => {
  const model = getBecomingModel();
  if (!model) {
    throw new Error("OPENAI_API_KEY is required for AI-generated curriculum architecture.");
  }

  const { object } = await generateObject({
    model,
    schema: CurriculumDraftSchema,
    system:
      "You design adaptive training curricula for an identity-driven product. Convert ambition into a pressure-tested path. Think in terms of operator capability, judgment, behavior under stress, and measurable progression.",
    prompt: `Design a curriculum architecture for this learner.

Requirements:
- Return exactly 3 skill clusters.
- Return exactly 2 units inside each cluster.
- Build for the person they want to become, not a generic course buyer.
- The units should feel concrete, serious, and operator-like.
- The path should move from foundational judgment to pressure performance.
- Keep the language crisp, not academic or motivational.

Identity report:
Target identity: ${report.targetIdentity}
Headline: ${report.headline}
Motivation: ${report.motivation}
Current baseline: ${report.currentBaseline}
Proof of progress: ${report.proofOfProgress}
Hard moments: ${report.hardMoments.join("; ")}
Constraints: ${report.constraints.join("; ") || "None provided"}
Behavior signals: ${report.behaviorSignals.join("; ")}`,
  });

  const nodes = buildNodes(object, report);
  const initialUnits = await buildInitialUnits({ report, nodes });

  return {
    title: object.title,
    summary: object.summary,
    targetIdentity: object.targetIdentity,
    nodes,
    initialUnits,
  };
};
