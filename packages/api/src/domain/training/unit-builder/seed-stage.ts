import type { SeedStageOutput, UnitBuilderContext } from "./contracts";
import { UnitBuilderContextSchema } from "./contracts";

/**
 * Unit preparation persists only the durable assignment metadata now. The live
 * mentor creates the learner's teaching step and first scenario against that
 * assignment, so preparation must not run a third content-authoring model.
 */
export const runSeedStage = (
  context: UnitBuilderContext,
  _options?: { abortSignal?: AbortSignal },
): Promise<SeedStageOutput> => {
  UnitBuilderContextSchema.parse(context);
  const targets = context.knowledge?.targets ?? [];
  const firstTarget = targets[0];
  const responseMode =
    context.planContext.clusterContext?.taskContract?.practiceContract
      .responseMode;
  const seedPrompt =
    responseMode === "select"
      ? "The mentor will present this unit's scenario after the teaching step.\n\nA) First option\n\nB) Second option\n\nC) Third option\n\nD) Fourth option"
      : "The mentor will present this unit's scenario after the teaching step.";

  return Promise.resolve({
    title: context.node.title,
    buildContent:
      "The mentor will create this unit's teaching step in the workspace.",
    seedPrompt,
    seedHint: "Use the concrete command from the mentor's teaching step.",
    clusterArcFrame: context.node.summary,
    complexityBudget: 1,
    teachbackSetup: {
      studentPersona: context.learner.targetIdentity,
      openingMisconception:
        firstTarget?.content ??
        "Uses a familiar move without checking why it fits.",
      roundLadder: [
        {
          round: 1,
          objection: "What detail controls the move?",
          objective: "Name the controlling detail.",
        },
        {
          round: 2,
          objection: "Why does the familiar move fail here?",
          objective: "Explain the concrete consequence.",
        },
        {
          round: 3,
          objection: "What would you do first?",
          objective: "Apply the command in a fresh case.",
        },
      ],
      passSignals: [
        "Names the controlling detail.",
        "Explains why the command fits the situation.",
      ],
      failureModes: [
        "Repeats a familiar move without checking it.",
        "Names a rule without explaining what it changes.",
      ],
    },
    scenario: {
      title: context.node.title,
      focusAreas: targets.map((target) => target.label),
    },
  });
};
