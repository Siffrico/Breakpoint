import type {
  CurriculumDesignerOutput,
  ProjectOverviewOutput,
} from "../agents/contracts";
import type { OutcomeCurriculumOutput } from "../outcome-curriculum/contracts";
import type { ProjectBuildStep, ProjectBuildStepDetail } from "./build-project";

export interface ProjectBuildArtifactPayload {
  /**
   * Either mode's designer output. Both carry an identity report and a plan
   * draft whose top-level list is the thing worth streaming — `abilities` in
   * ability mode, `outcomes` in topic mode — so the preview reads whichever is
   * present rather than branching on the mode it was never told.
   */
  curriculum: DeepPartial<CurriculumDesignerOutput | OutcomeCurriculumOutput>;
  overview: DeepPartial<ProjectOverviewOutput>;
}

type DeepPartial<T> = T extends readonly (infer TItem)[]
  ? (DeepPartial<TItem> | null | undefined)[]
  : T extends object
    ? { [TKey in keyof T]?: DeepPartial<T[TKey]> }
    : T;

export type ProjectBuildArtifactPreviewInput =
  | { step: "curriculum"; payload: ProjectBuildArtifactPayload["curriculum"] }
  | { step: "overview"; payload: ProjectBuildArtifactPayload["overview"] };

const WAITING_FOR_OUTPUT = "Waiting for the first structured output...";

const DEFAULT_STEP_DETAILS: Record<ProjectBuildStep, ProjectBuildStepDetail> = {
  name: {
    title: "Project shell",
    body: "Creating the project shell and resolving the saved track name.",
  },
  curriculum: {
    title: "Curriculum draft",
    body: "Drafting the identity profile and independent skill map.",
  },
  unit: {
    title: "Launch unit",
    body: "Preparing the first complete unit before opening the workspace.",
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

const previewCurriculum = (
  payload: ProjectBuildArtifactPayload["curriculum"],
): ProjectBuildStepDetail => {
  const plan = payload.planDraft;
  const abilities = titledItems(
    plan && "abilities" in plan ? plan.abilities : undefined,
  );
  const outcomes = titledItems(
    plan && "outcomes" in plan ? plan.outcomes : undefined,
  );

  return detailFrom(
    "Curriculum draft",
    compact([
      line("Target", payload.identityReport?.targetIdentity),
      line("Headline", payload.identityReport?.headline),
      line("Plan", plan?.title),
      line("Summary", plan?.summary),
      abilities.length > 0 ? listLine("Abilities", abilities) : null,
      outcomes.length > 0 ? listLine("Outcomes", outcomes) : null,
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
}: ProjectBuildArtifactPreviewInput): ProjectBuildStepDetail =>
  step === "curriculum" ? previewCurriculum(payload) : previewOverview(payload);
