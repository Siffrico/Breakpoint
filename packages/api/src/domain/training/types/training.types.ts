import type {
  BeforeAfterProfile,
  BuildCapstoneScenario,
  CapstoneAttempt,
  CapstoneEvaluation,
  CapstoneFormat,
  CapstoneMessage,
  CapstoneMessageRole,
  CapstoneScenario,
  CapstoneState,
  CapstoneStatus,
  CapstoneTurnResult,
  ClusterBriefing,
  ClusterBriefingMapItem,
  ComplexityBudget,
  CurriculumNode,
  CurriculumNodeKind,
  CurriculumNodeStatus,
  CurriculumPlan,
  DebateCapstoneScenario,
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
  FinalizeForgeUnitResult,
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
  RecallGate,
  RecallGateStatus,
  RecallGateSummary,
  RecallProbe,
  RecallProbeStatus,
  RecallProbeType,
  ScenarioEvaluationContract,
  SubmitEducationUnitStep,
  SubmitRecallProbe,
  TeachbackMessage,
  TeachbackRoundResult,
  TeachbackSetup,
  TeachCapstoneScenario,
  UnitContent,
  UnitMasteryContract,
  UnitRecallState,
  UnitRecallStatus,
} from "@acme/validators";

import type { ProjectBuildState } from "../orchestration/build-project";
import type { AttemptTiming, EvaluationPlan } from "../workspace-ai/types";

export type {
  CurriculumNode,
  CurriculumNodeKind,
  CurriculumNodeStatus,
  CurriculumPlan,
  DifficultyBand,
  CapstoneAttempt,
  CapstoneEvaluation,
  CapstoneFormat,
  CapstoneMessage,
  CapstoneMessageRole,
  CapstoneScenario,
  CapstoneState,
  CapstoneStatus,
  CapstoneTurnResult,
  ComplexityBudget,
  BuildCapstoneScenario,
  BeforeAfterProfile,
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
  DebateCapstoneScenario,
  FailureGap,
  FailureIsolationResult,
  ForgeDebrief,
  ForgeUnitContent,
  ForgeUnitScenario,
  GhostEvaluation,
  GhostScenario,
  IdentityReport,
  FinalizeForgeUnitResult,
  OnboardingQuestion,
  OnboardingSlot,
  OnboardingTranscriptMessage,
  PostSeedUnitContentDraft,
  PracticeEvaluation,
  PracticePrompt,
  PracticeSubmission,
  PreSeedUnitContentDraft,
  ProjectOverview,
  RecallGate,
  RecallGateSummary,
  RecallGateStatus,
  RecallProbe,
  RecallProbeStatus,
  RecallProbeType,
  ScenarioEvaluationContract,
  SubmitRecallProbe,
  SubmitEducationUnitStep,
  TeachbackMessage,
  TeachbackRoundResult,
  TeachbackSetup,
  TeachCapstoneScenario,
  UnitRecallState,
  UnitRecallStatus,
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
  beforeAfter: BeforeAfterProfile;
}

export interface OnboardingSessionState {
  sessionId: string;
  phase: "intro" | "questioning" | "ready_for_generation";
  transcript: OnboardingTranscriptMessage[];
  activeQuestion: OnboardingQuestion | null;
  projectBuild?: ProjectBuildState | null;
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
  activeRecallGate: RecallGateSummary | null;
  blockingSignals: string[];
  lastCompletedUnit: {
    title: string;
    score: number | null;
    failureTags: string[];
  } | null;
  demonstratedCapabilities: string[];
  nodeScores: Record<string, number>;
}

export type CapstoneAttemptRecord = CapstoneAttempt;

export type CapstoneMessageRecord = CapstoneMessage;

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
  aiEducationStage?:
    | "Diagnose"
    | "BreakDown"
    | "Grill"
    | "Solve"
    | "Review"
    | "TeachGap"
    | "NameIdea"
    | "Test"
    | "Check"
    | "completed";
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
  nextScenarioPrompt?: boolean;
  manualDifficultySignal?: "too_easy" | "too_hard";
  difficultyDirectiveReason?: string;
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
