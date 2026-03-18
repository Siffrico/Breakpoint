export type EsdeStage = "educate" | "simulate" | "diagnose" | "evaluate";

export type LearningDomainStatus = "available" | "locked";

export type LearningLevelStatus = "locked" | "available" | "in_progress" | "completed";

export type ScenarioResponseMode = "typed";

export type FailureCategory =
  | "missing_failure_mechanism"
  | "weak_containment_plan"
  | "missing_verification_strategy"
  | "weak_system_design"
  | "weak_prioritization"
  | "low_signal_response"
  | "limited_transfer_reasoning";

export type BenchmarkDimension =
  | "correctness"
  | "reasoning"
  | "robustness"
  | "speed"
  | "consistency"
  | "transfer";

export interface LearningDomainCard {
  slug: string;
  title: string;
  description: string;
  status: LearningDomainStatus;
  stageLabel: string;
  difficultyLabel: string;
  totalLevels: number;
  completedLevels: number;
  currentLevelNumber: number | null;
  currentLevelTitle: string | null;
}

export interface ScenarioPrompt {
  title: string;
  narrative: string;
  focusAreas: string[];
  successCriteria: string[];
  pressureModifiers: string[];
}

export interface LevelProgressSnapshot {
  domainSlug: string;
  levelId: string;
  levelNumber: number;
  levelTitle: string;
  status: LearningLevelStatus;
  attemptCount: number;
  completedLevelsInDomain: number;
  totalLevelsInDomain: number;
  unlockedNextLevel: boolean;
}

export interface ActiveScenario {
  id: string;
  domainSlug: string;
  domainTitle: string;
  levelId: string;
  levelNumber: number;
  levelTitle: string;
  activeStage: EsdeStage;
  stageSequence: EsdeStage[];
  prompt: ScenarioPrompt;
  responseMode: ScenarioResponseMode;
  attemptNumber: number;
  variantLabel: string;
  progress: LevelProgressSnapshot;
}

export interface BenchmarkScores {
  correctness: number;
  reasoning: number;
  robustness: number;
  speed: number;
  consistency: number;
  transfer: number;
}

export interface RepairTarget {
  title: string;
  instruction: string;
}

export interface ScenarioEvaluation {
  score: number;
  scoreBreakdown: BenchmarkScores;
  readiness: "needs_repair" | "developing" | "ready_for_next_round";
  strengths: string[];
  improvements: string[];
  rootCauses: FailureCategory[];
  repairTargets: RepairTarget[];
  nextStage: Extract<EsdeStage, "diagnose" | "evaluate">;
  recommendedScenarioId: string | null;
  retryVariantIssued: boolean;
}

export interface SubmitScenarioResponseInput {
  domainSlug: string;
  scenarioId: string;
  response: string;
}
