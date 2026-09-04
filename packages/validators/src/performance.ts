import { z } from "zod/v4";

export const WebVitalNameSchema = z.enum([
  "CLS",
  "FCP",
  "FID",
  "INP",
  "LCP",
  "TTFB",
]);

export const RecordWebVitalSchema = z.object({
  route: z.string().min(1).max(512).startsWith("/"),
  name: WebVitalNameSchema,
  value: z.number().finite(),
  delta: z.number().finite(),
  rating: z.enum(["good", "needs-improvement", "poor"]),
  navigationType: z.enum([
    "navigate",
    "reload",
    "back-forward",
    "back-forward-cache",
    "prerender",
    "restore",
  ]),
});

export type RecordWebVital = z.infer<typeof RecordWebVitalSchema>;

export interface WorkspaceModelAttemptMetric {
  agent: "mentor" | "reviewer";
  purpose: string;
  schemaName: string;
  provider: string;
  model: string;
  durationMs: number;
  firstChunkMs: number | null;
  firstVisibleMs: number | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outcome: "success" | "error";
  errorTag: string | null;
  /**
   * Which output-contract rules the model broke, when that is why the attempt
   * failed. `errorTag` only says "ZodError", which is not enough to fix a
   * prompt: without this the reason exists for one stack frame and is gone.
   */
  schemaIssues: string[] | null;
}

export interface WorkspaceTurnTimingMetric {
  requestToStreamMs: number;
  streamToPlanMs: number | null;
  planToTurnReadyMs: number | null;
  turnReadyToModelMs: number | null;
  modelToFirstChunkMs: number | null;
  modelToFirstVisibleMs: number | null;
  modelWindowMs: number | null;
  modelAttemptsMs: number;
  modelDoneToCommitMs: number | null;
  totalMs: number;
}

export interface WorkspaceTurnPerformanceMetric {
  sessionId: string;
  turnId: string;
  action: string;
  educationStage: string | null;
  outcome: "success" | "error" | "aborted";
  errorTag: string | null;
  release: string | null;
  timings: WorkspaceTurnTimingMetric;
  modelAttempts: WorkspaceModelAttemptMetric[];
}
