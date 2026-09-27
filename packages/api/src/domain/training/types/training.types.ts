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
  PracticeContract,
  PracticeEvaluation,
  PracticePrompt,
  PracticeSubmission,
  ProjectOverview,
  ScenarioEvaluationContract,
  SkillMap,
  SubmitEducationUnitStep,
  TeachbackMessage,
  TeachbackRoundResult,
  TeachbackSetup,
  UnitContent,
  UnitContext,
} from "@acme/validators";

import type { AskStartingPointInput } from "../agents/onboarding-chat-agent";
import type {
  CreateProjectInput,
  ProjectBuildState,
} from "../orchestration/build-project";

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
  PracticeEvaluation,
  PracticePrompt,
  PracticeSubmission,
  ProjectOverview,
  ScenarioEvaluationContract,
  SubmitEducationUnitStep,
  TeachbackMessage,
  TeachbackRoundResult,
  TeachbackSetup,
  UnitContent,
  UnitContext,
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
  outcomeResult: string | null;
  skillMap: SkillMap | null;
  practiceContract: PracticeContract | null;
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
  phase:
    | "intro"
    | "questioning"
    | "ready_for_generation"
    | "generating"
    | "complete";
  transcript: OnboardingTranscriptMessage[];
  activeQuestion: OnboardingQuestion | null;
  projectBuild?: ProjectBuildState | null;
  pendingStartingPointQuestion?: {
    sequence: number;
    input: AskStartingPointInput;
  } | null;
  pendingProjectProposal?: CreateProjectInput | null;
}

export interface HomeState {
  targetIdentity: string;
  headline: string;
  planTitle: string;
  planSummary: string;
  completedOutcomes: number;
  totalOutcomes: number;
  nextUnitId: string | null;
  nextUnitTitle: string | null;
  blockingSignals: string[];
  lastCompletedUnit: {
    title: string;
    checksMet: number | null;
    checksTotal: number | null;
    failureTags: string[];
  } | null;
  demonstratedCapabilities: string[];
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
  aiEducationStage?: "teach" | "answer" | "feedback" | "complete";
  recallUnitId?: string;
  promptKind?: "education_unit" | "recall";
  modelPurpose?: string;
  verdict?: string;
  evaluationSummary?: string;
  failedDimensions?: string[];
  dimensionResults?: EvaluationDimensionResult[];
  checksMet?: number;
  checksTotal?: number;
  scenarioAttemptId?: string;
  // Syllabus entries composed into a recall presentation; the verdict turn
  // reinforces exactly these, immune to the decay target shifting mid-interlude.
  recallEntryIds?: string[];
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
