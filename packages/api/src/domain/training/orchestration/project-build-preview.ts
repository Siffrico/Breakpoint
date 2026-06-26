import type {
  CurriculumDesignerOutput,
  OnboardingPacket,
  ProjectOverviewOutput,
} from "../agents/contracts";
import type { ProjectBuildStep, ProjectBuildStepDetail } from "./build-project";

export interface ProjectBuildArtifactPayload {
  goals: Partial<OnboardingPacket>;
  curriculum: Partial<CurriculumDesignerOutput>;
  overview: Partial<ProjectOverviewOutput>;
}

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
    body: "Drafting the identity profile, module sequence, and unit plan.",
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
  const clusters = plan?.clusters.map((cluster) => cluster.title) ?? [];
  const integrations =
    plan?.integrationLayers.map((layer) => layer.title) ?? [];

  return detailFrom(
    "Curriculum draft",
    compact([
      line("Target", payload.identityReport?.targetIdentity),
      line("Headline", payload.identityReport?.headline),
      line("Plan", plan?.title),
      line("Summary", plan?.summary),
      listLine("Clusters", clusters),
      listLine("Integration layers", integrations),
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
