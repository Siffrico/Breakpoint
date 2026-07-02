# Training Domain Modernization Plan

## Status and intent

This plan turns the inventory in `documentation/domainworkflows.md` into an
ordered cleanup and modernization program for `packages/api/src/domain/memory`
and `packages/api/src/domain/training`, excluding profile and excluding capstone
behavior except where capstone prevents deletion of a shared dependency.

The governing architectural decision is:

> Education V4 — the Orient → Connect → Solve → Teach loop — is the canonical
> learner interaction system. Preserve and strengthen the code that serves that
> loop. Remove older systems that are unreachable or superseded. Use Effect at
> asynchronous failure, resource, concurrency, and persistence boundaries; do
> not replace Zod, AI SDK turn handling, or pure domain functions with Effect.

This is an implementation plan, not authorization to delete production data or
remove compatibility behavior without evidence. Each phase has its own exit
gate so deletion, correctness repair, architecture consolidation, and Effect
migration can be reviewed independently.

## Audit corrections

The original domain map is strong, but the implementation audit found these
corrections:

1. The immediate whole-file deletion set is **23 files**, not 18.
2. The loose top-level dead cluster contains 14 files when
   `generate-training-object.ts` is included. It is only called by the already
   dead `evaluate-practice-response.ts`.
3. `agents/failure-isolation.ts` and `agents/ghost-replay.ts` also have no real
   callers.
4. `unit-builder/build-stage.ts`, `prove-stage.ts`, and `repair-stage.ts` are
   reachable only through dead wrapper exports. The live unit-builder surface
   is the seed/scaffold path.
5. There are not four independent unit-builder/runtime retry implementations.
   Unit-builder stages call `orchestration/agent-runtime.ts`. The live code has
   three retry engines plus non-retrying wrappers:
   - `engine/execute.ts` — legacy/capstone retry loop;
   - `orchestration/agent-runtime.ts::runResilientAgent` — resumable artifact
     generation;
   - `education-unit/agents/run-phase-agent.ts` — typed interactive phase
     retries;
   - `runAgent` and `workspace-ai/runtime.ts` are simple, non-retrying wrappers.
6. `engine/execute.ts` cannot be deleted with the loose legacy files because
   capstone still calls it.

## Canonical system boundary

### End-to-end Education V4 path

The active learner turn travels through this path:

1. Workspace UI and API route.
2. `router/training.ts`.
3. `get-ai-workspace-workflow.ts` or
   `submit-ai-workspace-message-workflow.ts`.
4. `workspace-ai/workspace-turn-orchestration.ts::runOneStep`.
5. `workspace-ai/workspace-turn.ts` loads the plan, node, unit, responses, and
   durable unit-run projection.
6. `workspace-ai/orchestrator.ts` selects education-unit, recall, or terminal
   state.
7. Education mode builds context and invokes
   `education-unit/orchestrate-unit-turn.ts::runUnitTurn`.
8. A phase agent performs the Orient, Connect, Solve, or Teach model call.
9. `workspace-ai/fsm-tools.ts` converts a grading tool call into a `UnitEvent`.
10. `education-unit/fsm.ts` applies the sole state transition.
11. `workspace-ai/workspace-turn-persistence.ts` commits the turn.
12. `workspace-turn-repository-deps.ts::commitEducationTurn` performs the
    durable message, response, unit-run, rating, attempt, and lease work.

This path is the reference against which every keep/delete/consolidate decision
must be tested.

### Keep as canonical core

Keep and strengthen:

- `training/education-unit/**`;
- `training/workspace-ai/**`;
- `training/context-engine/**`;
- `training/engine/rating/**`;
- `training/engine/compaction/**`;
- `training/orchestration/goldilocks.ts`;
- `training/orchestration/rating-scope.ts`;
- repositories used by workspace projection, unit runs, attempts, ratings,
  recall, curriculum, memory, transactions, and leases;
- `training/unit-builder/seed-stage.ts` and the minimal seed contracts needed
  to author a unit scaffold before Education V4 starts;
- active onboarding and curriculum artifact generation;
- active workflows and router entry points;
- Zod schemas at transport and model-output boundaries;
- AI SDK messages, tools, structured output, and streaming behavior.

### Explicit non-goals

- Do not rewrite the FSM, context selectors, rating math, parsers, caps, or
  graph policies as Effect programs.
- Do not replace Zod with Effect Schema.
- Do not replace AI SDK model calls, tool calls, or turn semantics.
- Do not merge interactive turns and resumable long-form generation into one
  policy with conditionals.
- Do not perform a repository-wide Effect rewrite.
- Do not delete backward-compatibility state mapping until persisted data is
  inspected and a migration/retention decision is made.
- Do not alter capstone behavior in the initial cleanup.

## Phase 1 — Delete verified legacy code

This phase should be a deletion-only pull request plus compiler-guided pruning.
It must not also change Education V4 behavior or introduce Effect services.

### Delete 14 loose top-level legacy files

- `packages/api/src/domain/training/generate-unit-setup.ts`
- `packages/api/src/domain/training/run-teachback.ts`
- `packages/api/src/domain/training/build-forge-debrief.ts`
- `packages/api/src/domain/training/generate-ghost-scenario.ts`
- `packages/api/src/domain/training/grade-ghost-response.ts`
- `packages/api/src/domain/training/generate-recall-probes.ts`
- `packages/api/src/domain/training/generate-recall-repair.ts`
- `packages/api/src/domain/training/generate-practice-prompts.ts`
- `packages/api/src/domain/training/generate-build-content.ts`
- `packages/api/src/domain/training/grade-teachback.ts`
- `packages/api/src/domain/training/isolate-failure.ts`
- `packages/api/src/domain/training/grade-recall-probe.ts`
- `packages/api/src/domain/training/evaluate-practice-response.ts`
- `packages/api/src/domain/training/generate-training-object.ts`

The last file is part of the same dead cluster: its only caller is the dead
practice-response evaluator.

### Delete six dead agent/service/orchestration files

- `packages/api/src/domain/training/agents/build-content.ts`
- `packages/api/src/domain/training/agents/failure-isolation.ts`
- `packages/api/src/domain/training/agents/ghost-replay.ts`
- `packages/api/src/domain/training/orchestration/ghost-flow.ts`
- `packages/api/src/domain/training/services/build-before-after-profile.ts`
- `packages/api/src/domain/training/services/build-identity-report.ts`

Combined with the 14 loose files and the three dead unit-builder stages below,
the total is 23.

### Delete three dead unit-builder stages

- `packages/api/src/domain/training/unit-builder/build-stage.ts`
- `packages/api/src/domain/training/unit-builder/prove-stage.ts`
- `packages/api/src/domain/training/unit-builder/repair-stage.ts`

These are not Education V4 phases. Their only orchestration routes are dead:
`generateUnitLesson` and `ghost-flow`. Preserve the seed stage, which remains
live through unit scaffold generation.

### Prune partially live files

In `orchestration/unit-flow.ts`:

- keep `generateUnitScaffold`;
- remove `generateUnitLesson`;
- remove imports used only by lesson generation.

In `unit-builder/orchestrator.ts`:

- keep context construction and `educationUnitBuilder.seed`;
- remove `buildAndProve`, `evaluatePractice`, `reviewProve`, `generateRepair`,
  and `evaluateRepair`;
- remove hydration helpers and types used only by those methods;
- consider renaming this reduced module after the deletion settles, but do not
  mix that rename into the deletion PR unless it materially improves clarity.

In `unit-builder/contracts.ts`:

- retain `SeedStageOutputSchema`, `UnitBuilderContext`,
  `PriorLearningRecord`, and all seed-stage inputs/outputs;
- remove build/prove/repair-only schemas and types after the compiler confirms
  they have no consumers.

In `agents/contracts.ts`:

- remove build-content contracts;
- remove failure-isolation contracts;
- remove ghost-replay contracts;
- retain onboarding, curriculum-designer, and project-overview contracts.

### Prompt cleanup after the source deletion

Run a second reachability audit after the compiler-guided pruning. The likely
dead prompt modules are:

- `prompts/legacy/unit-authoring.ts`;
- `prompts/legacy/assessment.ts`;
- `prompts/legacy/overview.ts`;
- registry-only exports from `prompts/legacy/onboarding.ts`.

Do not delete `prompts/legacy/capstone.ts` or `prompts/legacy-registry.ts` while
capstone imports them. Prompt cleanup should be a separate commit in the same
PR so the code deletion remains easy to verify.

### Phase 1 verification

Run:

```bash
rg -n "generateUnitLesson|buildAndProve|evaluatePractice|reviewProve|generateRepair|evaluateRepair|reviewTeachbackFailure|requireFailureGap|createGhostReplayScenario|evaluateGhostReplay" packages apps --glob '!**/dist/**'
pnpm -C packages/api typecheck
pnpm -C packages/api test
pnpm typecheck
git diff --check
```

The symbol search should return no source consumers. Tests specifically covering
unit loading, Education V4, workspace turns, and project building must remain
green.

### Phase 1 exit gate

- All 23 files are deleted.
- Partially live modules expose only the seed/scaffold path.
- No capstone dependency was removed.
- Typecheck and all API tests pass.
- A fresh repository-wide search finds no stale imports or exported dead API.

## Phase 2 — Lock Education V4 behavior with contract tests

Do this before Effect migration. The current tests cover the pure FSM, tool
mapping, retry helper, persistence pieces, and a lease rejection path, but not
a complete model-contract-to-FSM turn or full Orient → Connect → Solve → Teach
sequence.

### Add an injectable phase-runner seam

Allow `runUnitTurn` tests to supply a deterministic phase result without
calling a model. This is a testability seam, not a second production runtime.

### Add deterministic workflow tests

Cover:

- Orient produces a learner-facing message and advances correctly.
- First Connect prompt can be persisted without pretending a learner answer
  was already graded.
- A Connect answer can pass, fail, consume grill budget, and force advance.
- Solve can continue after incomplete/wrong work without an invalid contract.
- Solve pass/fail scores map to the intended events.
- Teach completes the pass and advances to the next recipe state.
- A full two-pass sequence reaches mastered state.
- Missing/invalid grading calls produce a typed contract failure only when a
  verdict is actually required.
- Provider, timeout, schema, and contract failures remain distinguishable.
- Persistence is not invoked after an invalid turn result.

### Resolve the prompt/tool/FSM contradiction

Current Connect and Solve prompts allow some responses without a grading tool,
while `resolveEvent` rejects every Connect/Solve response without that tool.
Choose and encode one coherent contract:

1. Preferred: every phase agent emits an explicit typed event, including a
   non-grading `prompted` or `continue` event; or
2. allow a valid non-transition turn result and persist it explicitly.

Do not solve this by fabricating pass/fail verdicts. The FSM and the model
contract must represent the real pedagogical move.

### Phase 2 exit gate

- Full Education V4 sequence is covered without live AI calls.
- Prompt rules, tool requirements, events, and FSM transitions agree.
- Every phase has explicit success and failure semantics.
- Tests fail if the mandatory-tool contradiction is reintroduced.

## Phase 3 — Repair active correctness gaps

These are behavior defects in the live canonical path, not cleanup preferences.

Phase 3 is governed by one persistence invariant:

> A lease claim is the entry gate for a learner turn. AI generation may propose
> a result, but only a validated domain event may select an idempotent commit.
> Workspace reads stay read-only, unit provisioning is an explicit lifecycle
> command, and transcript compaction is an independent idempotent checkpoint.

This does **not** mean every write belongs in the education-turn transaction.
The allowed write owners are deliberately narrow:

- the unit-provisioning command owns generated unit content;
- the claimed-turn commit owns messages, FSM state, attempt lifecycle, rating
  evidence, and lease completion for one learner turn;
- the compaction checkpoint owns only its replaceable transcript summary;
- the completed-unit advance command owns curriculum progression and triggers
  prewarm only after it makes the next node ready.

Model calls and other slow work must not run inside a database transaction.

### 3.1 Fix unit provisioning

The new `unit-preparation/` workflow establishes the correct owner, but the
remaining callers and repository semantics must finish the boundary:

- Keep `prepareUnitContent` as the only code path allowed to generate and write
  unit content. It must use the canonical seed-stage generator and return an
  existing row without spending model tokens.
- Remove preparation from `getAiWorkspaceWorkflow`. A workspace query may
  return `UNIT_PREPARING`, but it must not start generation. Project build,
  completed-unit advance, intentional prewarm, and an explicit recovery command
  are the allowed preparation triggers.
- Make `resolveWorkspaceTurn`, `planNextWorkspaceTurn`, and workspace display
  loading pure reads. If a unit-run row does not exist, derive `initialState` in
  memory and materialize it only in the first claimed-turn commit.
- Change unit-content conflict handling from `onConflictDoUpdate` to
  `onConflictDoNothing`, followed by a read of the winning row. A concurrent
  loser must never overwrite the winner's generated content.
- Keep mastering a unit separate from advancing the curriculum. Remove the
  dead `nextReadyNode` result from `commitEducationTurn`; the
  `advanceCompletedUnit` transaction must return the node it actually made
  ready, and only that successful command may schedule its prewarm.
- Preserve the legacy-template refresh policy, but route regeneration through
  the same preparation owner.

Required tests:

- workspace projection and turn loading perform zero writes;
- concurrent preparation produces one canonical winner and every caller reads
  that same row;
- a failed prewarm leaves reads recoverable through the explicit preparation
  command;
- advancing a completed unit returns and prewarms the newly-ready node;
- a unit-run is created once by the first claimed commit, never by a read.

### 3.2 Make turn identity and lease ownership mandatory

`turnId: null` currently bypasses lease fencing and makes timestamp-based
deduplication impossible. Normalize identity once at the transport boundary:

- If a client does not supply a turn id, generate a UUID before entering the
  workspace service. Internal turn APIs and commit inputs require a non-null
  `turnId`; optionality exists only at the outer compatibility boundary.
- Claim the `(sessionId, turnId)` lease before transcript mutation, model work,
  scenario preparation, or rating work.
- A completed claim returns the cached durable result. A live claim reports
  processing. A failed or expired claim follows one explicit reclaim policy.
- Add `originTurnId` to scenario attempts with a unique constraint scoped to
  the curriculum node (or session). The Pass-2 Connect presentation commit is
  the attempt's origin.
- Record the turn that presented the Solve task as `solvePromptTurnId` so the
  timing boundary is auditable and idempotent.
- Transaction retries and HTTP retries using the same turn id must not duplicate
  messages, phase responses, attempts, evaluations, predictions, or FSM moves.

Do not use `openedAt`, request time, or another changing timestamp as an
idempotency key.

### 3.3 Use presentation events to open the measured attempt

The event vocabulary already identifies the real learner-facing boundaries:

- Pass-2 Connect `phase_continues(reason="prompted")` means the assistant
  message contains the calibrated scenario the learner is now seeing.
- Solve `phase_continues(reason="prompted")` means the assistant message
  contains the actual Solve task and starts Solve-only timing.

Split the current `prepareScenarioDirective` behavior into two responsibilities:

1. A read-only resolver loads rating state, chooses a directive, and renders the
   difficulty guidance before the phase-agent call.
2. The validated presentation-event commit persists that proposal with the
   assistant message that actually presents it.

For both passes, inject the resolved difficulty guidance into
`buildUnitTurnContext` before generation. Pass 1 reads difficulty for
calibration but does not open the measured rating attempt. On Pass 2:

- the Connect prompted commit atomically inserts the scenario attempt,
  `originTurnId`, directive, support level, immutable item rating, scenario
  prompt, and `presentedAt` alongside the presenting assistant message;
- the Solve prompted commit atomically stamps `solvePresentedAt` and
  `solvePromptTurnId` using set-once semantics alongside the Solve prompt;
- `itemRating`, directive identity, `presentedAt`, and `solvePresentedAt` are
  immutable after their respective presentation commits;
- if validation or persistence fails, neither the presenting message nor its
  attempt boundary becomes durable.

This resolves the Phase 2 prompt/tool/FSM contract and Goldilocks presentation
ordering with the same typed `prompted` event rather than a special-case flag.

### 3.4 Record the first verdict, including failure evidence

Rating only successful solves is biased: Glicko cannot learn from losses and
the misconception ladder never sees the errors it is designed to repair.

- Define one shared `ErrorCodeSchema` taxonomy, render
  `ERROR_CLASSIFICATION_PROTOCOL` from that source, and extend
  `GradeSolutionInputSchema` with `errorCodes`. The prompt and tool schema must
  not maintain separate lists that can drift.
- Enforce the protocol's primary-error rule: a genuine failed verdict supplies
  exactly one primary error code and a pass supplies none.
- On Pass 2, the first `solution_graded` event against the open attempt is the
  sole rating observation, whether `passed` is true or false.
- That first verdict atomically saves score, error evidence, server occurrence
  time, rating/misconception updates, and closes the scenario attempt.
- Subsequent Solve repairs remain pedagogical FSM turns. They do not reopen the
  attempt or write another rating observation because the learner has already
  received feedback on that item.
- A later repair may still advance the FSM to `mastered`; mastery progression
  and unbiased rating evidence are related but distinct facts.

Timing is Solve-only:

- resolve the time limit from the server-owned recipe/policy and snapshot it on
  the attempt;
- calculate elapsed time from persisted `solvePresentedAt` to the first verdict
  commit time;
- derive `wasOverTime` on the server;
- treat client `attemptTiming` as optional telemetry, not authoritative rating
  evidence;
- preserve "not measured" separately from a genuine `false` value.

Required tests cover first-verdict pass, first-verdict fail, `needs_more_work`
without closure, fail-then-repair without a second rating write, duplicate
turn replay, missing Solve presentation, timeout boundary, and error-code-driven
misconception updates.

### 3.5 Commit validated turns atomically

Generation happens outside the transaction. After the model result passes Zod,
tool-contract, and FSM validation, one event-specific commit owns the durable
turn:

```text
claim lease
  -> load read model and proposed difficulty
  -> run model and validate exactly one event
  -> commit user/assistant messages
            + phase response
            + FSM cursor
            + event-specific attempt/rating writes
            + lease completion
```

- A Connect presentation commit opens the measured attempt.
- A Solve presentation commit stamps the Solve timing boundary.
- A first-verdict commit closes and evaluates the attempt.
- Other valid phase events persist messages, phase response, FSM cursor, and
  lease completion without inventing attempt or rating writes.
- Any failure rolls back the entire commit. No transaction may leave a message
  without its FSM move, a rating update without its verdict, or a completed
  lease without its durable response.
- Repository ports should expose these commit capabilities rather than raw
  multi-step write methods to the orchestration layer.

Transcript compaction is intentionally outside this transaction. Keep one
summary row per `(sessionId, slot)` and make checkpoint updates monotonic by
`coveredThroughSequence`: a newer sequence may replace the summary, while an
equal or older retry is a no-op. A failed summary write must not corrupt or
partially commit the learner turn.

### 3.6 Make streaming retry safe

`streamAssistantDelta` is prefix-append-only. If a retry or schema repair emits
a different prefix after text is visible, the browser can display a response
that differs from the response eventually persisted.

- Provider restart and schema repair are allowed only before the first visible
  assistant delta.
- Once any assistant text is visible, do not restart generation. Close the text
  part, emit the stable public error state, mark the claimed turn failed, and
  let the learner retry using the same durable turn id.
- A completed retry returns the cached durable response. A reclaim after a
  failed turn follows the lease policy and starts a fresh UI response rather
  than appending to the failed prefix.
- Education V4 currently exposes only a complete validated reply, so its
  internal pre-output retries remain safe. Apply the visible-output guard to
  recall streaming and to any future token-streamed phase agent.
- Add contract tests where the retry prefix diverges, failure occurs before the
  first delta, failure occurs after the first delta, and a retry reuses the same
  turn id.

### 3.7 Select, adapt, and budget memory

The context engine already produces bounded string collections, while
`buildUnitTurnContext` currently expects `{ content }[]`; the live education
path bypasses the selector and passes raw memories.

- Route education turns through one memory-selection adapter before building
  phase context.
- Normalize the selector/consumer contract to one representation rather than
  leaking repository `Memory` objects into the agent context.
- Rank against the current node, scenario focus, active phase, and known
  misconception. Apply a relevance floor based on actual query overlap before
  source weighting so an unrelated memory cannot survive only because its
  source has a bonus.
- Keep structured profile preferences and recent unit summaries under explicit
  category budgets; deduplicate and enforce the existing hard character limits.
- Render no memory section when selection is empty.
- Test empty, zero-overlap, highly relevant, source-weight-only, duplicate, and
  oversized memory sets plus the adapter into `buildUnitTurnContext`.

### Phase 3 exit gate

- Workspace and turn-projection reads perform no writes.
- Unit provisioning has one explicit owner, concurrent creation cannot
  overwrite the winner, and advance-triggered prewarm is live.
- Every internal workspace turn has a durable non-null id and enters through a
  lease claim.
- Difficulty is chosen before generation and the measured scenario is opened
  by the Pass-2 Connect prompted commit.
- Solve timing begins at the Solve prompted commit and is computed from server
  timestamps.
- The first Pass-2 Solve verdict records pass or failure evidence exactly once;
  repairs never double-rate the item.
- Error codes flow from a closed grader schema into misconception updates.
- Messages, FSM movement, event-specific attempt/rating writes, and lease
  completion are atomic.
- Visible-output failures never restart into a divergent streamed prefix.
- Memory context is relevant, adapted to the consumer contract, deduplicated,
  and bounded.
- Compaction remains an independent idempotent checkpoint.

## Phase 4 — Consolidate live architecture before broad Effect adoption

### 4.1 One workspace projection loader

`getAiWorkspaceWorkflow`, `resolveWorkspaceTurn`, and
`planNextWorkspaceTurn` repeat plan → ready node → ensure unit → responses →
unit-run → plan logic.

Extract a single `loadWorkspaceProjection` domain operation that returns the
canonical read model needed to derive:

- workspace display state;
- runnable turn;
- next state after persistence.

It must not perform hidden writes. Unit provisioning is a separate command.

### 4.2 Narrow repository ports by operation

Replace the broad dependency object with capabilities based on workflow needs:

- workspace projection reads;
- transcript reads/claims;
- atomic education-turn commit;
- atomic recall-turn commit;
- unit provisioning;
- memory selection/read;
- rating scope/read/write.

Remove unused interface methods such as `completeNode` from workspace
persistence. Preserve the separate completed-unit advance workflow: mastering a
unit and advancing the curriculum are intentionally different operations.

### 4.3 Remove duplicate planning/helpers

- Keep one next-ready-node implementation.
- Keep one message-slot mapping helper.
- Reuse the FSM policy helper for forced Connect advancement instead of
  repeating threshold arithmetic.
- Extract the shared commit → replan → relist tail from education and recall
  persistence only if doing so preserves their distinct atomic commit logic.

### 4.4 Retain two AI reliability policies

Build shared low-level primitives, then keep two policy wrappers:

**Interactive policy**

- Education V4 and recall/workspace short turns.
- Typed errors.
- Per-attempt timeout connected to AI SDK `abortSignal`.
- Bounded exponential restart for transient provider/timeouts only.
- One schema/tool repair.
- No partial continuation.

**Resumable artifact policy**

- Onboarding packet, curriculum design, and project overview.
- Partial checkpoints.
- Continuation prompts.
- Schema repair.
- Save-only recovery.
- Resume after process/request failure.

Shared primitives should own:

- model resolution;
- AI SDK error classification;
- abort/cancellation wiring;
- safe attempt metadata;
- structured spans/logging;
- Zod structured-output invocation.

Policy wrappers should own budgets, repair prompts, continuation semantics, and
artifact checkpoint behavior.

### Phase 4 exit gate

- One workspace projection path exists.
- Read operations do not provision/mutate.
- Repository capabilities are narrow and workflow-owned.
- Interactive and artifact policies share failure primitives without losing
  their real behavioral differences.

## Phase 5 — Effect migration for Education V4 and workspace turns

Use the existing profile Effect slice and `effect-migration.md` as conventions,
with the corrections below.

### 5.1 Define tagged errors by concern

Use explicit unions such as:

- `WorkspaceNotReadyError`;
- `WorkspaceInputError`;
- `TurnLeaseMissingError`, `TurnLeaseLostError`, `TurnLeaseConflictError`;
- `UnitProvisionError`;
- `AiTimeoutError`;
- `AiTransientProviderError`;
- `AiProviderRejectedError` or `AiConfigurationError`;
- `AiSchemaError`;
- `EducationUnitContractError`;
- `PersistenceError` / classified `DbError`;
- `RatingError`.

Preserve causes, operation, model/purpose, and attempt metadata for server logs.
Never place prompt content, learner messages, or private memory in telemetry.

Remove unreachable error variants. In particular, phase-agent partial output is
not currently captured, so `AgentPartialOutputError` is not a valid interactive
failure until such capture exists.

### 5.2 Keep Effects to the edge

Change `runUnitTurn` from an async function that calls `Effect.runPromise`
internally to an Effect value:

```ts
Effect.Effect<
  UnitTurnResult,
  PhaseAgentError | EducationUnitContractError,
  AiGateway
>
```

Then migrate workspace orchestration so typed failures remain intact through
claim, model call, rating, and persistence. Execute with `runPromiseExit` only
at tRPC/streaming boundaries and translate every tag once into stable public
errors.

Do not convert expected contract failures to defects with `Effect.die`. Reserve
defects for impossible programmer errors.

### 5.3 Add domain-owned services

Introduce capabilities only at side-effect boundaries:

- `AiGateway`;
- `WorkspaceTurnRepo`;
- `CurriculumRepo`;
- `UnitRunRepo`;
- `MemoryRepo`;
- `RatingRepo`;
- optional `Clock` where deterministic time is required.

Domain modules own tags/interfaces. `repositories/**` owns Drizzle live layers.
Capture the request or transaction `Db` while building each live layer so
repository methods do not retain a `Db` requirement.

### 5.4 Classify database failures before retry

Extend `DbError` with operation, SQLSTATE, retained cause, and failure kind:

- serialization;
- deadlock;
- connection;
- timeout;
- constraint;
- query;
- unknown.

Retry only explicit transient kinds. Retry the whole idempotent transaction,
not individual writes. Never retry validation, authorization, not-found,
constraint, lease conflict, query defects, or unknown failures by default.

### 5.5 Make leases interruption-safe

- Connect request `AbortSignal` to Effect interruption.
- Prove with a test that aborting interrupts the fiber and AI SDK provider call.
- Acquire/release or finalize claimed leases with ownership checks by `leaseId`.
- Make cleanup idempotent.
- Never let cleanup overwrite a completed turn or release a different owner's
  lease.

### 5.6 Correct AI retry classification

The current phase runner retries all provider errors. Split transient failures
from permanent provider/configuration failures:

- retry 408, 429, selected 5xx, network resets, and explicit timeouts;
- do not retry most hard 4xx, invalid credentials, unsupported model/tool
  contracts, invalid requests, or configuration failures;
- use bounded backoff, jitter, attempt limit, and total deadline;
- wire each timeout to the AI SDK abort signal so provider work actually stops.

### 5.7 Add observability

Wrap attempts and transactions in spans containing safe annotations:

- operation/purpose;
- model identifier;
- education phase;
- attempt number;
- failure tag/kind;
- latency;
- final outcome.

Keep existing logging until span parity is proven, then remove duplicate
logging. Do not log learner content.

### Phase 5 exit gate

- No Effect runner exists inside Education V4 domain/orchestration modules.
- Expected failures remain tagged to the transport boundary.
- Request cancellation interrupts the Effect fiber and provider call.
- Lease cleanup is ownership-safe and tested.
- Database retries are classified, bounded, transaction-level, and idempotent.
- Domain code depends on domain services, not Drizzle or repository modules.

## Phase 6 — Migrate adjacent live systems

After the Education V4 slice is stable:

1. Migrate recall/workspace simple model calls to the interactive AI policy.
2. Preserve long-form artifact resume/checkpoint behavior while moving its
   failures and resources to shared Effect primitives.
3. Migrate memory workflows from `Result<T, MemoryError>` to tagged Effect
   failures and a `MemoryRepo` service.
4. Merge ChatGPT/file imports into one parameterized import workflow with parser
   and source-specific messages/configuration.
5. Migrate remaining `Result<T, string>` workflows slice by slice.
6. Migrate capstone model execution before deleting `engine/execute.ts`.
7. Delete `lib/result.ts` only when repository-wide search finds no consumers.

### Memory import consolidation

The shared import workflow should own:

- payload normalization and byte cap;
- parser invocation;
- content hash/deduplication;
- existing-hash lookup;
- import record creation;
- memory creation;
- tagged parse, cap, conflict, and persistence errors.

The ChatGPT and file entry points should supply only parser/source behavior and
source-specific safe messages. Keep the existing parsers and cap/hash policy
pure.

### Phase 6 exit gate

- Recall uses the canonical interactive reliability policy.
- Artifact generation retains resumability.
- Memory import control flow exists once.
- Error translation is tag-based at transports.
- `engine/execute.ts` and `lib/result.ts` are deleted only after their final live
  consumers migrate.

## Keep/delete/consolidate decision table

| Area | Decision | Reason |
|---|---|---|
| `education-unit/**` | Keep and harden | Canonical Education V4 FSM and agents |
| `workspace-ai/**` | Keep, refactor boundaries | Active bridge, leases, persistence, recall |
| context engine | Keep pure | Active deterministic context construction |
| rating engine | Keep pure | Active Goldilocks policy/math |
| compaction | Keep, integrate cancellation | Active transcript control |
| unit-builder seed | Keep | Live unit scaffold authoring |
| unit-builder build/prove/repair | Delete | Reachable only through dead wrappers |
| active onboarding/curriculum/overview agents | Keep | Live artifact build pipeline |
| failure-isolation/ghost-replay/build-content agents | Delete | No real callers |
| loose generate/grade cluster | Delete | Superseded and unreachable |
| `agent-runtime.ts` | Keep, split shared primitives/policies | Active resumable artifact semantics |
| `run-phase-agent.ts` | Canonical interactive policy | Best typed live implementation |
| `engine/execute.ts` | Keep temporarily | Capstone still depends on it |
| `unit-flow.generateUnitScaffold` | Keep | Live seed entry point |
| `unit-flow.generateUnitLesson` | Delete | No callers |
| onboarding-flow wrapper | Optional inline later | Live but behavior-free seam |
| onboarding prompt constant | Optional inline later | Live, negligible cost |
| legacy state policy | Keep pending data audit | Protects persisted old rows |
| memory parsers/caps | Keep pure | Shared deterministic policy |
| duplicate memory workflows | Consolidate | Same control flow, parser differs |
| profile Effect slice | Keep as precedent | Already migrated; outside scope |

## Pull request sequence

Use small, behavior-focused PRs:

1. Delete the 23 verified files and prune contracts/exports.
2. Remove newly unreachable legacy prompts.
3. Add Education V4 model-contract and full-sequence tests.
4. Repair Connect/Solve event semantics.
5. Replace placeholder unit creation with explicit canonical provisioning.
6. Fix pre-presentation Goldilocks calibration and rating evidence.
7. Make education turn/rating/lease persistence atomic.
8. Add bounded memory selection.
9. Extract the canonical workspace projection and narrow ports.
10. Introduce shared AI error classification and abortable attempt primitive.
11. Return Effect from `runUnitTurn`; preserve tags through workspace flow.
12. Migrate workspace repositories/transactions/leases to domain services.
13. Migrate recall to the interactive policy.
14. Migrate memory and consolidate import workflows.
15. Migrate capstone, delete `engine/execute.ts`, then retire remaining legacy
    prompt registry code.
16. Retire `Result` only after the last consumer is gone.

Each PR should preserve or improve behavior coverage and avoid mixing deletion,
semantic fixes, and infrastructure migration unless one is strictly required
for the other.

## Definition of done

The modernization is complete when:

- Education V4 has one coherent prompt/tool/event/FSM contract;
- all verified legacy source and prompt code is gone;
- unit provisioning uses the canonical seed path and is explicit/idempotent;
- difficulty affects the task before presentation and rating evidence is
  immutable and atomic;
- memory context is selected and bounded;
- interactive and resumable artifact generation use shared typed primitives
  with distinct policies;
- Zod and AI SDK remain the validation and model-turn mechanisms;
- expected AI, domain, lease, rating, and persistence failures remain typed to
  the transport edge;
- cancellation reaches provider calls and cannot strand or steal leases;
- domain workflows depend on domain-owned services;
- pure domain code remains pure;
- retries are selective, bounded, observable, and idempotent;
- the broad workspace dependency factory, `engine/execute.ts`, and
  `lib/result.ts` are deleted only after their live consumers are migrated;
- critical success, failure, rollback, cancellation, and concurrency paths are
  covered by deterministic tests.
