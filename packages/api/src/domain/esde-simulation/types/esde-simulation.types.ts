export type EsdeStage = "educate" | "simulate" | "diagnose" | "evaluate";

export type LearningDomainStatus = "available" | "locked";

export interface LearningDomainCard {
  slug: string;
  title: string;
  description: string;
  status: LearningDomainStatus;
  stageLabel: string;
  difficultyLabel: string;
}

export interface ScenarioPrompt {
  title: string;
  narrative: string;
  focusAreas: string[];
  successCriteria: string[];
}

export interface ActiveScenario {
  id: string;
  domainSlug: string;
  domainTitle: string;
  activeStage: EsdeStage;
  stageSequence: EsdeStage[];
  prompt: ScenarioPrompt;
  responseMode: "typed";
}

export type DiagnosisCategory =
  | "weak_concept_understanding"
  | "shallow_diagnosis"
  | "bad_prioritization"
  | "incomplete_mitigation";

export interface ScenarioEvaluation {
  score: number;
  readiness: "needs_repair" | "developing" | "ready_for_next_round";
  strengths: string[];
  improvements: string[];
  rootCauses: DiagnosisCategory[];
  nextStage: Extract<EsdeStage, "diagnose" | "evaluate">;
}

export interface SubmitScenarioResponseInput {
  domainSlug: string;
  scenarioId: string;
  response: string;
}
