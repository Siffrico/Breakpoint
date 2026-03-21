import type {
  CurriculumNode,
  CurriculumNodeKind,
  CurriculumPlan,
  CurriculumNodeStatus,
  Debrief,
  IdentityReport,
  OnboardingQuestion,
  OnboardingSlot,
  OnboardingTranscriptMessage,
  RetrievalEvaluation,
  RetrievalItem,
  UnitContent,
} from "@acme/validators";

export type {
  CurriculumNode,
  CurriculumNodeKind,
  CurriculumPlan,
  CurriculumNodeStatus,
  Debrief,
  IdentityReport,
  OnboardingQuestion,
  OnboardingSlot,
  OnboardingTranscriptMessage,
  RetrievalEvaluation,
  RetrievalItem,
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

export interface UnitContentBlueprint {
  nodeOrderIndex: number;
  title: string;
  concept: string;
  workedExample: string;
  retrievalItems: [RetrievalItem, RetrievalItem, RetrievalItem];
  scenario: {
    title: string;
    prompt: string;
    focusAreas: string[];
    successCriteria: string[];
  };
}

export interface CurriculumBlueprint {
  title: string;
  summary: string;
  targetIdentity: string;
  nodes: CurriculumNodeBlueprint[];
  initialUnits: UnitContentBlueprint[];
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
