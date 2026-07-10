import type {
  CurriculumDesignerOutput,
  OnboardingPacket,
  ProjectOverviewOutput,
} from "../agents/contracts";
import type { ProjectBuildStep, ProjectBuildStepDetail } from "./build-project";

export interface ProjectBuildArtifactPayload {
  goals: DeepPartial<OnboardingPacket>;
  curriculum: DeepPartial<CurriculumDesignerOutput>;
  overview: DeepPartial<ProjectOverviewOutput>;
}

type DeepPartial<T> = T extends readonly (infer TItem)[]
  ? (DeepPartial<TItem> | null | undefined)[]
  : T extends object
    ? { [TKey in keyof T]?: DeepPartial<T[TKey]> }
    : T;

export type ProjectBuildArtifactPreviewInput =
  | { step: "goals"; payload: ProjectBuildArtifactPayload["goals"] }
  | { step: "curriculum"; payload: ProjectBuildArtifactPayload["curriculum"] }
  | { step: "overview"; payload: ProjectBuildArtifactPayload["overview"] };

const WAITING_FOR_OUTPUT = "Waiting for the first structured output...";

const DEFAULT_STEP_DETAILS: Record<ProjectBuildStep, ProjectBuildStepDetail> = {
  name: {
    title: "Project shell",
    body: "Creating the project shell and resolving the saved track name.",
  },
  goals: {
    title: "Goal synthesis",
    body: "Synthesizing the onboarding conversation into a handoff packet.",
  },
  curriculum: {
    title: "Curriculum draft",
    body: "Drafting the identity profile and independent skill map.",
  },
  overview: {
    title: "Overview draft",
    body: "Writing the field map that explains the project direction.",
  },
  save: {
    title: "Project save",
    body: "Persisting the finished project and making it available in your workspace.",
  },
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const compact = (values: (string | null | undefined)[]): string[] =>
  values.filter((value): value is string => Boolean(value));

const line = (label: string, value: unknown): string | null => {
  const content = text(value);
  return content ? `${label}: ${content}` : null;
};

const listLine = (label: string, values: unknown): string | null => {
  if (!Array.isArray(values)) return null;
  const items = values
    .map(text)
    .filter((value): value is string => Boolean(value));
  return items.length > 0 ? `${label}: ${items.join("; ")}` : null;
};

const titledItems = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];

  return values
    .map((value: unknown) => {
      if (!value || typeof value !== "object") return null;
      return text((value as Record<string, unknown>).title);
    })
    .filter((value): value is string => Boolean(value));
};

const truncate = (value: string, maxLength = 900): string =>
  value.length > maxLength
    ? `${value.slice(0, maxLength).trimEnd()}...`
    : value;

const detailFrom = (
  title: string,
  lines: string[],
): ProjectBuildStepDetail => ({
  title,
  body: lines.length > 0 ? truncate(lines.join("\n")) : WAITING_FOR_OUTPUT,
  generated: lines.length > 0,
});

const previewGoals = (
  payload: ProjectBuildArtifactPayload["goals"],
): ProjectBuildStepDetail =>
  detailFrom(
    "Goal synthesis",
    compact([
      line("Target", payload.targetIdentity),
      line("Motivation", payload.motivation),
      line("Baseline", payload.currentBaseline),
      line("Proof", payload.proofOfProgress),
      line("Friction", payload.identityFriction),
      listLine("Hard moments", payload.hardMoments),
      listLine("Behavior signals", payload.behaviorSignals),
    ]),
  );

const previewCurriculum = (
  payload: ProjectBuildArtifactPayload["curriculum"],
): ProjectBuildStepDetail => {
  const plan = payload.planDraft;
  const abilities = titledItems(plan?.abilities);

  return detailFrom(
    "Curriculum draft",
    compact([
      line("Target", payload.identityReport?.targetIdentity),
      line("Headline", payload.identityReport?.headline),
      line("Plan", plan?.title),
      line("Summary", plan?.summary),
      listLine("Abilities", abilities),
    ]),
  );
};

const previewOverview = (
  payload: ProjectBuildArtifactPayload["overview"],
): ProjectBuildStepDetail =>
  detailFrom(
    "Overview draft",
    compact([
      line("Title", payload.title),
      line("Summary", payload.summary),
      line("Body", payload.body),
    ]),
  );

export const getProjectBuildStepDetail = (
  step: ProjectBuildStep,
): ProjectBuildStepDetail => DEFAULT_STEP_DETAILS[step];

export const previewProjectBuildArtifact = ({
  step,
  payload,
}: ProjectBuildArtifactPreviewInput): ProjectBuildStepDetail => {
  if (step === "goals") return previewGoals(payload);
  if (step === "curriculum") return previewCurriculum(payload);
  return previewOverview(payload);
};
