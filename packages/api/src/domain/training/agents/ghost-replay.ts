import type { FailureGap, ForgeUnitContent } from "../types/training.types";
import {
  GhostReplayEvaluationSchema,
  GhostReplayScenarioEnvelopeSchema,
  type RepairTarget,
} from "./contracts";
import { runAgent } from "../orchestration/agent-runtime";

const GHOST_REPLAY_SYSTEM = `You are Breakpoint's ghost-replay agent.

Your role is to test whether the learner can now execute the repaired reasoning skill in a new domain.

Generation standards:
- The domain must be meaningfully different from the original unit domain.
- The new scenario must test the same reasoning skill, not just similar wording.
- Make the task concrete and response-shaped.

Evaluation standards:
- Judge transfer of the repaired reasoning skill only.
- General writing quality is irrelevant unless it blocks reasoning.
- Pass only when the learner actually applies the repaired skill in the new domain.`;

export const createGhostReplayScenario = async ({
  gap,
  unitContent,
  previousDomains,
  repairTarget,
  evidenceAnchors,
}: {
  gap: FailureGap;
  unitContent: ForgeUnitContent;
  previousDomains: string[];
  repairTarget?: RepairTarget | null;
  evidenceAnchors?: string[];
}) =>
  runAgent({
    agent: "ghostReplay",
    system: GHOST_REPLAY_SYSTEM,
    schema: GhostReplayScenarioEnvelopeSchema,
    errorMessage: "Failed to generate a ghost scenario.",
    prompt: `Generate a ghost replay scenario.

Rules:
- Use a different domain from the unit domain.
- Do not reuse previousDomains.
- Test the same repaired reasoning skill.
- Keep the prompt concrete and actionable.
- transferFocus should explain what the learner must demonstrate.

Original unit context:
${formatUnitContext(unitContent)}

Original gap:
${formatGap(gap)}

Repair target:
${formatRepairTarget(repairTarget)}

Evidence anchors:
${evidenceAnchors?.join("; ") || "None provided"}

Previous ghost domains:
${previousDomains.join(", ") || "None"}`,
  });

export const evaluateGhostReplay = async ({
  gap,
  unitContent,
  ghostScenario,
  response,
  repairTarget,
  evidenceAnchors,
}: {
  gap: FailureGap;
  unitContent: ForgeUnitContent;
  ghostScenario: {
    domain: string;
    prompt: string;
    targetDepth: number;
  };
  response: string;
  repairTarget?: RepairTarget | null;
  evidenceAnchors?: string[];
}) =>
  runAgent({
    agent: "ghostReplay",
    system: GHOST_REPLAY_SYSTEM,
    schema: GhostReplayEvaluationSchema,
    errorMessage: "Failed to evaluate the ghost response.",
    prompt: `Evaluate this ghost replay response.

Scoring rules:
- Score only whether the learner repaired the original reasoning gap in a new domain.
- Do not over-reward clarity if the reasoning is still broken.
- Do not fail merely for style if the reasoning clearly transfers.

Original unit context:
${formatUnitContext(unitContent)}

Original gap:
${formatGap(gap)}

Repair target:
${formatRepairTarget(repairTarget)}

Evidence anchors:
${evidenceAnchors?.join("; ") || "None provided"}

Ghost scenario:
Domain: ${ghostScenario.domain}
Prompt: ${ghostScenario.prompt}
Target depth: ${ghostScenario.targetDepth}

Learner response:
${response}`,
  });

const formatUnitContext = (unitContent: ForgeUnitContent): string =>
  `Title: ${unitContent.title}
Summary: ${unitContent.summary}
Why it matters: ${unitContent.whyItMatters}
Scenario: ${unitContent.scenario.title}
Focus areas: ${unitContent.scenario.focusAreas.join("; ")}`;

const formatGap = (gap: FailureGap): string =>
  `Description: ${gap.description}
Gap type: ${gap.gapType}
Where it broke: ${gap.whereItBroke}`;

const formatRepairTarget = (repairTarget?: RepairTarget | null): string =>
  repairTarget
    ? `Skill: ${repairTarget.skill}
Transfer objective: ${repairTarget.transferObjective}
Success criteria: ${repairTarget.successCriteria.join("; ")}`
    : "Not explicitly provided. Infer it from the gap.";
