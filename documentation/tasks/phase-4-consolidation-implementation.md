# Phase 4 Consolidation — Implementation Handoff

Executor instructions for the reduced Phase 4 scope of
`documentation/training-domain-modernization-plan.md`. The original phase 4 was
audited against the current code on 2026-07-03; roughly half of it is already
done or obsolete. This document is the surviving scope. **Follow it exactly.
Do not add scope from the original phase 4 section — several of its items were
judged over-engineered and are deliberately excluded** (see "Explicitly out of
scope" at the end).

## Mission

Six tasks, each a small behavior-preserving refactor in `packages/api`:

1. Delete two duplicated helpers in `get-ai-workspace-workflow.ts`.
2. Replace inline forced-Connect arithmetic with the existing FSM helper.
3. Extract one shared `loadActiveUnitProjection` Effect used by three callers.
4. Delete seven dead members from `WorkspaceTurnPersistenceDependencies`.
5. Extract one shared `invokeStructuredModel` primitive under four call sites.
6. Record the reduced scope in the modernization plan document.

**Zero behavior change is the acceptance bar for tasks 1–5.** Every existing
test must pass unmodified except where a task explicitly says to delete stub
lines from a test's fake-deps object.

## Ground rules — read before writing any code

- Package manager is **pnpm**, never npm/yarn. Verification commands below.
- **One commit per task**, in order. Run the verification block before each
  commit. If verification fails, fix forward within the task; never commit red.
- **Never use `any`, `as any`, or `@ts-expect-error` to silence a type error.**
  A type error after your edit means you missed a consumer — go read that
  consumer and handle it properly. If a consumer exists that this document does
  not mention, stop and re-check whether the deletion/refactor is still safe
  rather than forcing it.
- Do not reformat, reorder imports in, or "clean up" code outside the exact
  edits described. The diff should contain only what the task requires.
- Match the file's existing style: JSDoc summaries in the
  "takes X / produces Y / fails when Z" voice, comments that state constraints
  (why something must be so), not narration of what the next line does.
- Do not add new dependencies, new Effect services, retries, timeouts, spans,
  or logging anywhere. Those are phase 5 concerns.
- Copy code blocks from this document as the starting point, then make them
  compile against the real imports. The blocks are correct in structure but you
  own final import paths and type names.

### Verification block (run after every task)

```bash
pnpm -C packages/api typecheck
pnpm -C packages/api test
```

And once after the final task:

```bash
pnpm typecheck
pnpm lint
```

The behavior guards you must keep green:
`workspace-ai/workspace-read-boundary.test.ts`,
`workspace-ai/workspace-turn-orchestration.test.ts`,
`workspace-ai/workspace-turn-persistence.test.ts`,
`education-unit/agents/run-phase-agent.test.ts`,
`orchestration/agent-runtime.test.ts`,
`repositories/workspace-turn-repository-deps.test.ts`.

## Orientation

All paths relative to `packages/api/src`.

| File | Role |
|---|---|
| `domain/training/workspace-ai/workspace-turn.ts` | Canonical turn resolution (`resolveWorkspaceTurnEffect`), replanning (`planNextWorkspaceTurn`), shared helpers |
| `domain/training/workspace-ai/workspace-reader.ts` | `WorkspaceProjectionReader` Effect service + promise-source adapter |
| `domain/training/workflows/get-ai-workspace-workflow.ts` | Read-only workspace display view |
| `domain/training/workspace-ai/workspace-turn-persistence.ts` | Commit input types + `WorkspaceTurnPersistenceDependencies` |
| `repositories/workspace-turn-repository-deps.ts` | The one factory building the deps object; owns atomic commit transactions |
| `domain/training/education-unit/orchestrate-unit-turn.ts` | Unit turn engine; only module applying `fsm.transition` |
| `domain/training/education-unit/fsm.ts` | Pure FSM + policy helpers |
| `domain/training/education-unit/agents/run-phase-agent.ts` | Interactive retry policy (Effect) |
| `domain/training/workspace-ai/runtime.ts` | Recall/workspace single-shot model call (no retry — keep it that way) |
| `domain/training/orchestration/agent-runtime.ts` | Artifact policies: `runAgent`, `runResilientAgent`, `classifyFailure` |
| `domain/training/engine/model-router.ts` | `requireAiModelForPurpose`, `getSearchToolsForSelectedProvider` |
| `domain/training/engine/run-profiles.ts` | `getRunProfile` → `{ maxSteps, maxOutputTokens, reasoningBudgetTokens }` |

---

## Task 1 — Delete duplicated helpers in the workspace view workflow

**File:** `domain/training/workflows/get-ai-workspace-workflow.ts`

At the bottom of this file live two private helpers that are byte-for-byte
duplicates of exports from `../workspace-ai/workspace-turn`:

- `getNextReadyLearningNode` (private, ~line 218)
- `getWorkspaceMessageSlot` (private, ~line 225)

Steps:

- Delete both private declarations.

- Add `getNextReadyLearningNode` and `getWorkspaceMessageSlot` to the existing
  `import { getUnitAdvanceGate, resolveUnitRunProjection } from "../workspace-ai/workspace-turn";`
  statement. The file already imports from that module, so there is no cycle
  risk (`workspace-turn.ts` does not import this workflow; only
  `workspace-turn-orchestration.ts` does, and that is unchanged).

- The exported `getWorkspaceMessageSlot` takes `WorkspaceAiTurnMode` where the
  private one took `WorkspaceAiState["mode"]`. These are the same union;
  typecheck confirms. If it does not, stop and inspect —
  do not cast.

Run the verification block. Commit: `phase 4: dedupe workspace view helpers`.

---

## Task 2 — Use the FSM policy helper for forced Connect advancement

**File:** `domain/training/education-unit/orchestrate-unit-turn.ts`

`fsm.ts` exports `shouldTeachMissedConnection(state, event, policy)` for
exactly the check this file re-derives inline. Current code (~line 239):

```ts
// Capture the force-advance signal BEFORE transition wipes connectGrills.
const forcedConnectAdvance =
  state.phase === "connect" &&
  event.type === "connection_graded" &&
  !event.connected &&
  state.connectGrills + 1 >= recipe.policy.maxGrillsBeforeTeach;
```

Replace with:

```ts
// Capture the force-advance signal BEFORE transition wipes connectGrills.
const forcedConnectAdvance =
  event.type === "connection_graded" &&
  shouldTeachMissedConnection(state, event, recipe.policy);
```

- Add `shouldTeachMissedConnection` to the existing
  `import { transition, writesGoldilocks } from "./fsm";`.

- The `event.type === "connection_graded"` guard stays outside the helper call:
  it narrows `event` to the `Extract<UnitEvent, { type: "connection_graded" }>`
  the helper requires. The helper itself covers the `state.phase === "connect"`,
  `!event.connected`, and grill-budget conditions — verify this by reading
  `shouldTeachMissedConnection` in `fsm.ts` before editing, so you know the
  replacement is logically identical.

Run the verification block. Commit: `phase 4: reuse fsm forced-advance helper`.

---

## Task 3 — Extract the shared active-unit projection loader

The block "next ready node → unit → phase responses → unit-run projection" is
copied three times:

1. `workspace-turn.ts` inside `resolveWorkspaceTurnEffect` (~lines 182–207)
2. `workspace-turn.ts` inside `planNextWorkspaceTurn` (~lines 299–315)
3. `get-ai-workspace-workflow.ts` inside `getAiWorkspaceWorkflowEffect`
   (~lines 85–110)

Extract one Effect helper in `workspace-turn.ts` and reuse it in all three.

### 3a. Add the helper to `domain/training/workspace-ai/workspace-turn.ts`

```ts
export interface ActiveUnitProjection {
  node: CurriculumNode | null;
  unit: UnitContent | null;
  responses: PhaseResponseRecord[];
  run: PersistedUnitRun | null;
}

/**
 * Takes the plan's nodes and a session id; produces the next-ready learning
 * node's unit, phase responses, and in-memory run projection. A missing unit
 * is NOT a failure here — turn resolution treats it as UNIT_PREPARING while
 * post-commit replanning tolerates it, so each caller owns that decision.
 */
export const loadActiveUnitProjection = ({
  sessionId,
  nodes,
}: {
  sessionId: string;
  nodes: CurriculumNode[];
}): EffectType.Effect<
  ActiveUnitProjection,
  DbError,
  WorkspaceProjectionReader
> =>
  Effect.gen(function* () {
    const reader = yield* WorkspaceProjectionReader;
    const node = getNextReadyLearningNode(nodes);
    const unit = node ? yield* reader.getUnitByNodeId(node.id) : null;
    if (!unit) {
      return { node, unit: null, responses: [], run: null };
    }
    const [responses, existingRun] = yield* Effect.all(
      [
        reader.getPhaseResponses(unit.id, sessionId),
        reader.getUnitRun(sessionId, unit.id),
      ],
      { concurrency: 2 },
    );
    return {
      node,
      unit,
      responses,
      run: resolveUnitRunProjection({ sessionId, unit, existing: existingRun }),
    };
  });
```

### 3b. Rewrite the duplicated block in `resolveWorkspaceTurnEffect`

Replace the `readyUnitNode` / `readyUnit` / `readyUnitResponses` /
`existingReadyUnitRun` / `readyUnitRun` section with:

```ts
const active = yield* loadActiveUnitProjection({
  sessionId,
  nodes: plan.nodes,
});
if (active.node && !active.unit) {
  return yield* new UnitNotReadyError({
    message: "UNIT_PREPARING",
    nodeId: active.node.id,
  });
}
```

Then update the later references in the same function: `readyUnitResponses` →
`active.responses`, `readyUnitRun` → `active.run`, `readyUnit?.id` →
`active.unit?.id`. The downstream logic (the `planWorkspaceTurn` call, the
`unit.id === active.unit?.id` reuse checks, the resolved-state mapping) must
stay exactly as it is.

### 3c. Rewrite `planNextWorkspaceTurn` on the same helper

This function is currently plain async over raw deps. Convert it to run the
helper, keeping its public promise signature so no caller changes:

```ts
const planNextWorkspaceTurnEffect = ({
  sessionId,
  plan,
}: {
  sessionId: string;
  plan: CurriculumPlan;
}): EffectType.Effect<
  WorkspaceAiState | null,
  DbError,
  WorkspaceProjectionReader
> =>
  Effect.gen(function* () {
    const reader = yield* WorkspaceProjectionReader;
    const [allResponses, active] = yield* Effect.all(
      [
        reader.listPhaseResponsesBySession(sessionId),
        loadActiveUnitProjection({ sessionId, nodes: plan.nodes }),
      ],
      { concurrency: 2 },
    );
    return planWorkspaceTurn({
      nodes: plan.nodes,
      allResponses,
      activeUnitResponses: active.responses,
      activeUnitRun: active.run,
    });
  });

export const planNextWorkspaceTurn = async ({
  sessionId,
  plan,
  deps,
}: {
  sessionId: string;
  plan: CurriculumPlan;
  deps: Omit<WorkspaceTurnDependencies, "getActivePlan">;
}): Promise<WorkspaceAiState | null> => {
  const exit = await Effect.runPromiseExit(
    planNextWorkspaceTurnEffect({ sessionId, plan }).pipe(
      Effect.provideService(
        WorkspaceProjectionReader,
        // The plan is already in hand, so the reader's getActivePlan slot is
        // satisfied without granting this replan a plan-reading capability.
        makeWorkspaceProjectionReader({
          ...deps,
          getActivePlan: () => Promise.resolve(plan),
        }),
      ),
    ),
  );

  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
};
```

**Critical behavior difference to preserve:** `planNextWorkspaceTurn` must NOT
throw `UnitNotReadyError` when the ready node's unit is missing — it replans
with empty responses and a null run, exactly as today. Only 3b and 3d add the
`UnitNotReadyError` check.

### 3d. Rewrite the duplicated block in `getAiWorkspaceWorkflowEffect`

**File:** `domain/training/workflows/get-ai-workspace-workflow.ts`

Replace the `activeUnitNode` / `activeUnit` / `activeUnitResponses` /
`existingActiveUnitRun` / `activeUnitRun` section with the same pattern as 3b
(import `loadActiveUnitProjection` from `../workspace-ai/workspace-turn`), then
update the later references: `activeUnitNode` → `active.node`, `activeUnit` →
`active.unit`, `activeUnitResponses` → `active.responses`, `activeUnitRun` →
`active.run`. Everything after (recall-unit check, evaluation progress,
`nextLearningNode`, `unitAdvanceGate`, intro message) stays untouched.

### 3e. Verify

Run the verification block. `workspace-read-boundary.test.ts` proves reads
still perform zero writes; the orchestration and persistence tests prove the
replan path is unchanged. Commit:
`phase 4: extract shared active-unit projection loader`.

---

## Task 4 — Delete dead members from the persistence dependency surface

The phase-3 atomic commits absorbed several writes into
`commitEducationTurn` / `commitRecallTurn` / `commitNextScenarioPrompt`
(implemented inside `repositories/workspace-turn-repository-deps.ts`). Seven
interface members survived as dead API. Verified: **no domain code calls
`deps.<member>` for any of them.**

Dead members: `savePhaseResponse`, `updateUnitMasteryContract`,
`updateScenarioContract`, `saveAttempt`, `completeNode`, `listMessagesByTurnId`,
`touchSession`.

**NOT dead — do not touch:** `appendMessage` (used by
`claimTurnAndLoadTranscript`), `listMessages`, `claimWorkspaceTurn`,
`markWorkspaceTurnFailed`, the three `commit*` methods, and everything on
`WorkspaceTurnDependencies` / the reader sources.

### 4a. `domain/training/workspace-ai/workspace-turn-persistence.ts`

- The `completion.attempt` field of `WorkspaceEducationTurnCommit` currently
  types itself off the member you are deleting:
  `Parameters<WorkspaceTurnPersistenceDependencies["saveAttempt"]>[0]`.
  First give that input its own named type (copy the parameter object type of
  the current `saveAttempt` member exactly):

```ts
export interface WorkspaceAttemptCommit {
  sessionId: string;
  userId?: string | null;
  unitId: string;
  response: string;
  debrief: Debrief;
  seedResponse?: string | null;
  finalArticulation?: string | null;
  growthDimensions?: string[] | null;
}
```

  and change the commit field to `attempt: WorkspaceAttemptCommit;`.

- Then delete the seven members from
  `WorkspaceTurnPersistenceDependencies`.

### 4b. `repositories/workspace-turn-repository-deps.ts`

- In `createWorkspaceTurnRepositoryDeps`, delete the seven corresponding
  entries (`savePhaseResponse`, `updateUnitMasteryContract`,
  `updateScenarioContract`, `saveAttempt`, `completeNode`,
  `listMessagesByTurnId`, `touchSession`).

- **Do not delete the repository calls inside the commit transactions** —
  `trainingCurriculumRepository.savePhaseResponse`,
  `trainingAttemptRepository.saveAttempt`,
  `trainingOnboardingRepository.touchSession`, etc. inside
  `commitEducationTurn` / `commitRecallTurn` / `commitNextScenarioPrompt` are
  the live implementations. Only the flat factory entries go.

- The `toCurriculumNode` helper and its `CurriculumNode` import exist only for
  the deleted `completeNode` entry. Delete the helper; keep the type import
  only if something else in the file still uses it (`DifficultyBand` from the
  same import statement is still used — trim the import, don't remove it).

- `router/training.ts` (~line 207) and `advance-completed-unit-workflow.ts`
  build their own `completeNode` for capstone/advance flows. **Do not touch
  those files.**

### 4c. Test fakes

Delete only the stub lines for the seven removed members from:

- `domain/training/workspace-ai/workspace-turn-persistence.test.ts`
  (fake-deps object around line 130)
- `domain/training/workspace-ai/workspace-turn-orchestration.test.ts`
  (fake-deps object around line 100)

Do not change any assertion. If a test fails after this, you deleted a member
that was actually alive — revert and re-investigate; do not adjust the test.

Run the verification block. Commit:
`phase 4: remove dead workspace persistence dependency members`.

---

## Task 5 — Extract the structured-model invocation primitive

Four sites build the same `streamText + Output.object` call with drifting
knobs. Extract the invocation only. **Both retry policies, all step budgets,
all prompts, and all error handling stay byte-identical in behavior.**

The four sites:

1. `education-unit/agents/run-phase-agent.ts` → `callModel` (messages prompt,
   optional tools, `stopWhen: stepCountIs(3)`, awaits `output` + `toolCalls`)
2. `workspace-ai/runtime.ts` → `runWorkspaceAiPrompt` (string prompt, search
   tools, `stepCountIs(4)`, awaits `output`)
3. `orchestration/agent-runtime.ts` → `runAgent` (string prompt, search tools,
   profile-driven steps/tokens/reasoning, awaits `output`)
4. `orchestration/agent-runtime.ts` → `runResilientAgent` (same as 3 plus
   `smoothStream` transform and `partialOutputStream` consumption)

### 5a. Create `domain/training/engine/invoke-structured-model.ts`

Move `getReasoningProviderOptions` out of `agent-runtime.ts` into this file
verbatim (it stays private). Then:

```ts
import type { ModelMessage, ToolSet } from "ai";
import type { z } from "zod/v4";
import { Output, smoothStream, stepCountIs, streamText } from "ai";

import type { RunProfile } from "./run-profiles";

type StructuredModel = Parameters<typeof streamText>[0]["model"];

/**
 * The one place a structured-output model call is constructed. Retry policy,
 * prompt content, and error classification belong to the callers — this owns
 * only the invocation so step budgets, reasoning options, and output wiring
 * cannot drift between the interactive and artifact policies.
 */
export const invokeStructuredModel = <TSchema extends z.ZodTypeAny>({
  model,
  schema,
  schemaName,
  system,
  prompt,
  tools,
  maxSteps,
  profile,
  smoothPartials = false,
}: {
  model: StructuredModel;
  schema: TSchema;
  schemaName: string;
  system: string;
  prompt: string | ModelMessage[];
  tools?: ToolSet;
  maxSteps: number;
  /** Artifact agents pass their run profile; interactive turns omit it. */
  profile?: RunProfile;
  /** Pace partial-output deltas for checkpoint streaming (resilient agent). */
  smoothPartials?: boolean;
}) =>
  streamText({
    model,
    output: Output.object({ schema, name: schemaName }),
    system,
    prompt,
    tools,
    stopWhen: stepCountIs(maxSteps),
    ...(smoothPartials
      ? {
          experimental_transform: smoothStream({
            delayInMs: 15,
            chunking: "word",
          }),
        }
      : {}),
    ...(profile
      ? {
          maxOutputTokens:
            profile.maxOutputTokens + profile.reasoningBudgetTokens,
        }
      : {}),
    ...(profile && profile.reasoningBudgetTokens > 0
      ? {
          providerOptions: getReasoningProviderOptions(
            profile.reasoningBudgetTokens,
          ),
        }
      : {}),
  });
```

Return the raw `streamText` result — callers await `result.output`,
`result.toolCalls`, or iterate `result.partialOutputStream` exactly as before.
If the `StructuredModel` parameter extraction fights the compiler, use the
model type that `requireAiModelForPurpose` returns instead; do not cast.

### 5b. Update the four call sites

For each site, replace only the `streamText({ ... })` expression with an
`invokeStructuredModel({ ... })` call carrying that site's exact current
values:

- `run-phase-agent.ts` `callModel`: `maxSteps: 3`, `prompt: input.messages`,
  `tools: input.tools`, no profile, no smoothing. Keep the step-budget comment
  by moving it onto the `maxSteps` argument. Keep the
  `Promise.all([result.output, result.toolCalls])` shape.
- `runtime.ts`: `maxSteps: 4`,
  `tools: getSearchToolsForSelectedProvider(PURPOSE_BY_KIND[kind])`. Keep the
  try/catch and error message exactly. **Do not add retries here** — this
  site's migration to the interactive policy is phase 6.
- `agent-runtime.ts` `runAgent`: `maxSteps: profile.maxSteps`,
  `profile`, search tools. Delete the now-moved
  `getReasoningProviderOptions` from this file.
- `agent-runtime.ts` `runResilientAgent`: same as `runAgent` plus
  `smoothPartials: true`. The `partialOutputStream` loop and all
  classify/repair/continue/restart logic stay untouched.

### 5c. Verify

`run-phase-agent.test.ts` mocks the `ai` package with `vi.mock("ai")`; that
mock applies package-wide, so the extracted module is covered without test
edits. Run the verification block; all agent and runtime tests must pass
unchanged. Commit: `phase 4: extract structured model invocation primitive`.

---

## Task 6 — Record the reduced scope in the plan

**File:** `documentation/training-domain-modernization-plan.md`

Add a short note at the top of the "Phase 4" section (do not delete the
original text) stating:

- Phase 4 was re-audited on 2026-07-03 and implemented as a reduced scope:
  shared active-unit projection loader instead of a single canonical read
  model; dead-member deletion instead of new capability ports; a shared
  `invokeStructuredModel` primitive instead of the full shared-primitive layer.
- Abort/timeout wiring, spans, and tagged-error unification for recall were
  deferred to phase 5/6 where their Effect shape is specified.
- Link to this document.

Commit: `phase 4: record reduced consolidation scope`.

---

## Explicitly out of scope — do not do these

- No `loadWorkspaceProjection` mega-operation returning one canonical read
  model for display + turn + replan. The three consumers need different data;
  the shared piece is exactly `loadActiveUnitProjection`.
- No new repository port interfaces or factories (the seven-capability split
  from the original 4.2). Phase 5.3 reshapes these as Effect services.
- No extraction of the "commit → replan → relist" tail shared by education and
  recall persistence.
- No retries, timeouts, abort signals, spans, or logging additions anywhere.
- No changes to `router/training.ts` capstone deps,
  `advance-completed-unit-workflow.ts`, `unit-coach.ts`, or
  `workspace-chat.ts` beyond what typecheck forces (expected: nothing).
- No prompt, schema, FSM, or rating changes of any kind.

## Definition of done

- All six commits exist in order, each passing
  `pnpm -C packages/api typecheck && pnpm -C packages/api test` at its point in
  history.
- `pnpm typecheck` and `pnpm lint` pass at the end.
- `rg -n "getNextReadyLearningNode|getWorkspaceMessageSlot" packages/api/src`
  shows exactly one declaration of each (in `workspace-turn.ts`).
- `rg -n "streamText\(" packages/api/src/domain/training` shows no direct call
  in `run-phase-agent.ts`, `runtime.ts`, or `agent-runtime.ts` (capstone's
  `engine/execute.ts` and app-level streaming endpoints are untouched and may
  still call it).
- `rg -n "completeNode|listMessagesByTurnId" packages/api/src/domain/training/workspace-ai`
  returns nothing.
- No test assertion was modified; only fake-deps stub lines were removed.
