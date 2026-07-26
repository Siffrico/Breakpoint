import type {
  ClusterBriefing,
  ClusterBriefingMapItem,
  ComplexityBudget,
  CurriculumNode,
  CurriculumNodeKind,
  CurriculumNodeStatus,
  CurriculumPlan,
  Debrief,
  DifficultyBand,
  EducationUnitActiveStage,
  EducationUnitAssessmentStatus,
  EducationUnitAttemptMode,
  EducationUnitAttemptSignals,
  EducationUnitConceptCorrection,
  EducationUnitConfidence,
  EducationUnitDiagnosticGap,
  EducationUnitImplementationReview,
  EducationUnitPromptCard,
  EducationUnitResponseRecord,
  EducationUnitState,
  EducationUnitWorkedExample,
  EvaluationDimensionResult,
  FailureGap,
  FailureIsolationResult,
  ForgeDebrief,
  ForgeUnitContent,
  ForgeUnitScenario,
  GhostEvaluation,
  GhostScenario,
  IdentityReport,
  OnboardingQuestion,
  OnboardingSlot,
  OnboardingTranscriptMessage,
  PostSeedUnitContentDraft,
  PracticeEvaluation,
  PracticePrompt,
  PracticeSubmission,
  PreSeedUnitContentDraft,
  ProjectOverview,
  ScenarioArchetype,
  ScenarioEvaluationContract,
  SubmitEducationUnitStep,
  TeachbackMessage,
  TeachbackRoundResult,
  TeachbackSetup,
  UnitContent,
  UnitMasteryContract,
} from "@acme/validators";

import type {
  CreateProjectInput,
  ProjectBuildState,
} from "../orchestration/build-project";
import type { AttemptTiming, EvaluationPlan } from "../workspace-ai/types";

export type {
  CurriculumNode,
  CurriculumNodeKind,
  CurriculumNodeStatus,
  CurriculumPlan,
  DifficultyBand,
  ComplexityBudget,
  ClusterBriefing,
  ClusterBriefingMapItem,
  Debrief,
  EducationUnitAttemptMode,
  EducationUnitAssessmentStatus,
  EducationUnitAttemptSignals,
  EducationUnitConceptCorrection,
  EducationUnitConfidence,
  EducationUnitActiveStage,
  EducationUnitDiagnosticGap,
  EducationUnitImplementationReview,
  EducationUnitPromptCard,
  EducationUnitResponseRecord,
  EducationUnitState,
  EducationUnitWorkedExample,
  EvaluationDimensionResult,
  FailureGap,
  FailureIsolationResult,
  ForgeDebrief,
  ForgeUnitContent,
  ForgeUnitScenario,
  GhostEvaluation,
  GhostScenario,
  IdentityReport,
  OnboardingQuestion,
  OnboardingSlot,
  OnboardingTranscriptMessage,
  PostSeedUnitContentDraft,
  PracticeEvaluation,
  PracticePrompt,
  PracticeSubmission,
  PreSeedUnitContentDraft,
  ProjectOverview,
  ScenarioEvaluationContract,
  SubmitEducationUnitStep,
  TeachbackMessage,
  TeachbackRoundResult,
  TeachbackSetup,
  UnitContent,
  UnitMasteryContract,
};

export interface CurriculumNodeBlueprint {
  parentOrderIndex: number | null;
  kind: CurriculumNodeKind;
  status: CurriculumNodeStatus;
  title: string;
  summary: string;
  whyItMatters: string;
  learningGoal: string;
  orderIndex: number;
  depth: number;
  positionColumn: number;
  positionRow: number;
  difficultyBands: DifficultyBand[] | null;
  /** Null outside ability nodes; ability nodes always carry a valid stage. */
  abilityStage: "foundations" | "skillset" | "mastered" | null;
  skillMap: {
    workflow: { name: string; steps: string[] };
    bandRamp: { startRating: number; peakRating: number };
    masteryContract: {
      exitCriteria: string[];
      maxRatingDeviation?: number;
    };
    scenarioArchetype: ScenarioArchetype;
  } | null;
}

export interface PostSeedGenerationResult {
  captured: true;
  buildContent: string;
  practicePrompts: PracticePrompt[];
}

export interface UpdateUnitContentInput {
  unitContentId: string;
  buildContent: string;
  practicePrompts: PracticePrompt[];
  teachbackSetup?: TeachbackSetup;
  contentGeneratedAt: Date;
}

export interface CurriculumBlueprint {
  title: string;
  summary: string;
  targetIdentity: string;
  overview: ProjectOverview | null;
  nodes: CurriculumNodeBlueprint[];
}

export interface OnboardingSessionState {
  sessionId: string;
  phase: "intro" | "questioning" | "ready_for_generation";
  transcript: OnboardingTranscriptMessage[];
  activeQuestion: OnboardingQuestion | null;
  projectBuild?: ProjectBuildState | null;
  pendingProjectProposal?: CreateProjectInput | null;
}

export interface HomeState {
  targetIdentity: string;
  headline: string;
  planTitle: string;
  planSummary: string;
  completedUnits: number;
  totalUnits: number;
  nextUnitId: string | null;
  nextUnitTitle: string | null;
  blockingSignals: string[];
  lastCompletedUnit: {
    title: string;
    score: number | null;
    failureTags: string[];
  } | null;
  demonstratedCapabilities: string[];
  nodeScores: Record<string, number>;
}

export interface ProfileState {
  targetIdentity: string;
  headline: string;
  motivation: string;
  currentBaseline: string;
  proofOfProgress: string;
  hardMoments: string[];
  constraints: string[];
  behaviorSignals: string[];
}

export type TrainingPhase =
  | "seed"
  | "practice"
  | "teachback"
  | "ghost"
  | "loop_initial_response"
  | "loop_mastery_check"
  | "loop_build_response"
  | "loop_revision"
  | "ai_education"
  | "ai_recall";

export interface PhaseResponseMetadata {
  attempts?: number;
  feedback?: string;
  step?: SubmitEducationUnitStep["step"];
  responseMode?: EducationUnitAttemptMode;
  confidence?: EducationUnitConfidence;
  latencyMs?: number | null;
  signals?: EducationUnitAttemptSignals;
  stateSnapshot?: EducationUnitState;
  // The education-unit FSM phase this response left the run in (see
  // education-unit/unit.ts UnitPhase). Replaces the retired 9-step rulebook ids.
  aiEducationStage?: "orient" | "connect" | "solve" | "teach" | "mastered";
  // Which pass (1 or 2) the phase belonged to.
  phasePass?: number;
  recallUnitId?: string;
  promptKind?:
    | "onboarding_curriculum"
    | "education_unit"
    | "recall"
    | "evaluate_feedback";
  modelPurpose?: string;
  verdict?: string;
  evaluationSummary?: string;
  failedDimensions?: string[];
  dimensionResults?: EvaluationDimensionResult[];
  evaluationPlan?: EvaluationPlan;
  attemptTiming?: AttemptTiming;
  scenarioAttemptId?: string;
  // Syllabus entries composed into a recall presentation; the verdict turn
  // reinforces exactly these, immune to the decay target shifting mid-interlude.
  recallEntryIds?: string[];
  nextScenarioPrompt?: boolean;
  manualDifficultySignal?: "too_easy" | "too_hard";
  difficultyDirectiveReason?: string;
  goldilocksUpdated?: boolean;
  estimatedItemRating?: number;
  assessmentStatus?: EducationUnitAssessmentStatus;
  gap?: FailureGap;
  ghostScenario?: GhostScenario;
  evidenceAnchors?: string[];
  repairTarget?: {
    skill: string;
    transferObjective: string;
    successCriteria: string[];
  };
}

export interface PhaseResponseRecord {
  id: string;
  unitContentId: string;
  sessionId: string;
  userId?: string | null;
  phase: TrainingPhase;
  sequence: number;
  userResponse: string;
  aiResponse: string | null;
  passed: boolean | null;
  score: number | null;
  metadata: PhaseResponseMetadata | null;
  createdAt: Date;
}
