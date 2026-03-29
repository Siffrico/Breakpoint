import type {
  CurriculumNode,
  CurriculumNodeKind,
  CurriculumNodeStatus,
  CurriculumPlan,
  CapstoneAttempt,
  CapstoneEvaluation,
  CapstoneFormat,
  CapstoneMessage,
  CapstoneMessageRole,
  CapstoneScenario,
  CapstoneState,
  CapstoneStatus,
  CapstoneTurnResult,
  BuildCapstoneScenario,
  BeforeAfterProfile,
  Debrief,
  DebateCapstoneScenario,
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
  TeachbackMessage,
  TeachbackRoundResult,
  TeachbackSetup,
  TeachCapstoneScenario,
  UnitContent,
} from "@acme/validators";

export type {
  CurriculumNode,
  CurriculumNodeKind,
  CurriculumNodeStatus,
  CurriculumPlan,
  CapstoneAttempt,
  CapstoneEvaluation,
  CapstoneFormat,
  CapstoneMessage,
  CapstoneMessageRole,
  CapstoneScenario,
  CapstoneState,
  CapstoneStatus,
  CapstoneTurnResult,
  BuildCapstoneScenario,
  BeforeAfterProfile,
  Debrief,
  DebateCapstoneScenario,
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
  TeachbackMessage,
  TeachbackRoundResult,
  TeachbackSetup,
  TeachCapstoneScenario,
  UnitContent,
};

export interface CurriculumNodeBlueprint {
  parentOrderIndex: number | null;
  kind: CurriculumNodeKind;
  status: CurriculumNodeStatus;
  title: string;
  summary: string;
  whyItMatters: string;
  orderIndex: number;
  depth: number;
  positionColumn: number;
  positionRow: number;
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
  contentGeneratedAt: Date;
}

export interface CurriculumBlueprint {
  title: string;
  summary: string;
  targetIdentity: string;
  nodes: CurriculumNodeBlueprint[];
  beforeAfter: BeforeAfterProfile;
}

export interface OnboardingSessionState {
  sessionId: string;
  phase: "intro" | "questioning" | "ready_for_generation";
  transcript: OnboardingTranscriptMessage[];
  activeQuestion: OnboardingQuestion | null;
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
}

export interface CapstoneAttemptRecord extends CapstoneAttempt {}

export interface CapstoneMessageRecord extends CapstoneMessage {}

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

export type BecomingPhase = "seed" | "practice" | "teachback" | "ghost";

export interface PhaseResponseMetadata {
  attempts?: number;
  feedback?: string;
  gap?: FailureGap;
  ghostScenario?: GhostScenario;
}

export interface PhaseResponseRecord {
  id: string;
  unitContentId: string;
  sessionId: string;
  userId?: string | null;
  phase: BecomingPhase;
  sequence: number;
  userResponse: string;
  aiResponse: string | null;
  passed: boolean | null;
  score: number | null;
  metadata: PhaseResponseMetadata | null;
  createdAt: Date;
}
