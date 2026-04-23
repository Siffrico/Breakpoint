import type { Memory, MemoryError } from "../../memory/types";
import type { Result } from "../../../lib/result";
import { err, ok } from "../../../lib/result";
import {
  getMemoryContentHash,
  normalizeMemoryContent,
} from "../../memory/policies/memory-caps";
import {
  CompletedUnitEvidenceSchema,
  PostUnitReportSchema,
  type CompletedUnitEvidence,
  type PostUnitReport,
  type TutorContext,
} from "./schemas";
import {
  mergePostUnitReportIntoMemory,
  serializeProfileMemory,
  serializeUnitSummaryMemory,
} from "./tutor-memory";
import { generateTutorObject } from "./tutor-runtime";

export const createPostUnitReport = async ({
  context,
  completedUnit,
}: {
  context: TutorContext;
  completedUnit: CompletedUnitEvidence;
}): Promise<PostUnitReport> => {
  const parsed = CompletedUnitEvidenceSchema.parse(completedUnit);

  return generateTutorObject({
    context: {
      ...context,
      stage: "post_unit_report",
    },
    schema: PostUnitReportSchema,
    instruction: `Create a PostUnitReport from this completed unit evidence.

Rules:
- Update profile memory only from evidence in the unit.
- Preserve durable learner truths; do not overfit to one answer.
- recurringFailurePatterns should describe repeatable learning behavior, not insults.
- teachingPreferences should tell the next tutor how to teach this learner better.
- unitSummaryMemory should be compact enough to fit in future tutor context.

Completed unit evidence:
${JSON.stringify(parsed, null, 2)}`,
  });
};

export const applyPostUnitReport = async ({
  userId,
  currentMemory,
  report,
  deps,
}: {
  userId: string;
  currentMemory: TutorContext["memory"];
  report: PostUnitReport;
  deps: {
    createMemory: (payload: {
      userId: string;
      content: string;
      contentHash: string;
      source: "profile_update" | "unit_report";
    }) => Promise<Result<Memory, MemoryError>>;
  };
}): Promise<Result<{ ok: true }, string>> => {
  const nextProfileMemory = mergePostUnitReportIntoMemory({
    current: currentMemory,
    report,
  });

  const entries = [
    {
      source: "profile_update" as const,
      content: serializeProfileMemory(nextProfileMemory),
    },
    {
      source: "unit_report" as const,
      content: serializeUnitSummaryMemory(report.unitSummaryMemory),
    },
  ];

  for (const entry of entries) {
    const content = normalizeMemoryContent(entry.content);
    const result = await deps.createMemory({
      userId,
      source: entry.source,
      content,
      contentHash: getMemoryContentHash(content),
    });

    if (!result.success && result.error.code !== "CONFLICT") {
      return err(result.error.message);
    }
  }

  return ok({ ok: true });
};
