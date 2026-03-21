import type { RouterOutputs } from "@acme/api";

type LearningDomainCard = RouterOutputs["esdeSimulation"]["catalog"][number];
type ActiveScenario = RouterOutputs["esdeSimulation"]["activeScenario"];
type ScenarioEvaluation = RouterOutputs["esdeSimulation"]["submitResponse"];

export const previewDomainCatalog: LearningDomainCard[] = [
  {
    slug: "incident-response",
    title: "Incident Response",
    description:
      "Practice diagnosis, containment, communication, and verification when technical failures start cascading.",
    status: "available",
    stageLabel: "Stage 01",
    difficultyLabel: "High pressure",
    totalLevels: 8,
    completedLevels: 2,
    currentLevelNumber: 3,
    currentLevelTitle: "Launch-day payment failure",
  },
  {
    slug: "sales-conversations",
    title: "Sales Conversations",
    description:
      "Train sharper discovery, objection handling, and control of the next step under live pressure.",
    status: "available",
    stageLabel: "Stage 02",
    difficultyLabel: "Live dialogue",
    totalLevels: 6,
    completedLevels: 1,
    currentLevelNumber: 2,
    currentLevelTitle: "Budget freeze pushback",
  },
  {
    slug: "team-leadership",
    title: "Team Leadership",
    description:
      "Run difficult conversations with clarity, standards, and emotional control.",
    status: "locked",
    stageLabel: "Stage 03",
    difficultyLabel: "Interpersonal",
    totalLevels: 7,
    completedLevels: 0,
    currentLevelNumber: null,
    currentLevelTitle: null,
  },
];

export const previewScenario: ActiveScenario = {
  id: "scenario-incident-003",
  domainSlug: "incident-response",
  domainTitle: "Incident Response",
  levelId: "level-003",
  levelNumber: 3,
  levelTitle: "Launch-day payment failure",
  activeStage: "simulate",
  stageSequence: ["educate", "simulate", "diagnose", "evaluate"],
  responseMode: "typed",
  attemptNumber: 2,
  variantLabel: "Escalation variant",
  prompt: {
    title: "Payment failures after launch announcement",
    narrative:
      "Five minutes after the launch announcement, conversion drops sharply. Support sees angry messages, logs are partial, and leadership wants a status update immediately. You are responsible for the first response.",
    focusAreas: ["triage", "containment", "observability", "communication"],
    successCriteria: [
      "Identify the likely blast radius.",
      "Contain damage before root cause is fully known.",
      "Set a concrete verification path.",
    ],
    pressureModifiers: [
      "Public visibility is high.",
      "Facts are incomplete.",
      "A second-order trust risk is forming.",
    ],
  },
  progress: {
    domainSlug: "incident-response",
    levelId: "level-003",
    levelNumber: 3,
    levelTitle: "Launch-day payment failure",
    status: "in_progress",
    attemptCount: 2,
    completedLevelsInDomain: 2,
    totalLevelsInDomain: 8,
    unlockedNextLevel: false,
  },
};

export const previewScenarioEvaluation: ScenarioEvaluation = {
  score: 88,
  scoreBreakdown: {
    correctness: 89,
    reasoning: 91,
    robustness: 82,
    speed: 86,
    consistency: 87,
    transfer: 84,
  },
  readiness: "ready_for_next_round",
  strengths: [
    "You prioritized blast-radius containment before chasing certainty.",
    "Your update cadence created clarity instead of silence.",
    "You treated verification as part of operational ownership.",
  ],
  improvements: [
    "Name a rollback threshold earlier.",
    "Call out customer messaging ownership sooner.",
    "Make the fallback path explicit if logs remain incomplete.",
  ],
  rootCauses: [
    "weak_containment_plan",
    "missing_verification_strategy",
  ],
  repairTargets: [
    {
      title: "Rollback threshold",
      instruction:
        "Define the exact metric or signal that triggers rollback before you enter deep diagnosis.",
    },
    {
      title: "Fallback path",
      instruction:
        "Describe the next action if the first fix does not restore conversion cleanly.",
    },
  ],
  nextStage: "diagnose",
  recommendedScenarioId: "scenario-incident-004",
  retryVariantIssued: false,
};
