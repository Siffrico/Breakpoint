# Domain & Workflow Map

## Purpose

This document exists to be reviewed, not to be followed. It is a factual map of
what exists in `packages/api/src/domain/` today — one level below "what files
are there" and one level above "read the whole file." For each area it states:
what it does, what it calls, what calls it, and anything that looks like
duplication, dead weight, or an inconsistent pattern next to its siblings.

The intended next step is a separate pass — by a person or a model with this
document in hand — that decides, area by area: is this workflow necessary as
designed, should it be merged with something else, should it be deleted, or
should it be redesigned before any reliability/type-safety work (Effect or
otherwise) is layered on top of it. Optimizing the implementation of a
workflow that shouldn't exist in its current form is the failure mode this
document is trying to prevent.

Scope: `memory/` domain and the `training/` domain **except** `training/capstone/`.
The `profile/` domain is excluded (already fully migrated to Effect; see
`effect-migration.md` and `packages/api/src/effect/`). `training/prompts/` is
excluded (static prompt text, not logic).

Every "no callers found" claim below was verified with a repo-wide grep
(`packages/api/src` + `apps/`), not just asserted from reading the file.

---

## 1. `memory/` domain

**Purpose:** CRUD for learner memory artifacts — manual notes, ChatGPT export
imports, file imports.

**Workflows** (`memory/workflows/`): `create-manual-memory.ts`,
`update-memory.ts`, `delete-memory.ts`, `list-memories.ts`,
`import-chatgpt-memory.ts`, `import-file-memory.ts`.

**Pattern:** every workflow takes `{ ...input, deps }`, returns
`Result<T, MemoryError>` (`{code, message}` union: `BAD_REQUEST | NOT_FOUND |
PAYLOAD_TOO_LARGE | CONFLICT | INTERNAL_SERVER_ERROR`), and threads through a
narrow closure-typed `deps` interface per workflow (`getExistingHashes`,
`createImport`, `createMemories`, ...).

**DUPLICATE:** `import-chatgpt-memory.ts` and `import-file-memory.ts` are
line-for-line identical control flow (normalize → size-cap check → parse →
dedupe by content hash → check existing hashes → create import → create
memories). The only difference is which parser they call
(`parseChatGptMemories` vs `parseFileMemories`) and two user-facing message
strings. This reads as one workflow (`importMemoriesWorkflow`) parameterized
by a parser function, currently duplicated into two files.

**Parsers** (`memory/parsers/`): `chatgpt-parser.ts`, `file-parser.ts` — pure
functions, no issues observed.

**Policies** (`memory/policies/memory-caps.ts`): content hashing, byte-length
caps, payload normalization — pure, shared by both import workflows correctly.

---

## 2. `training/workflows/` — tRPC entry points

All 11 non-capstone files here are confirmed wired into `router/training.ts`
(verified by import grep) — no dead entry points in this layer.

| File | Purpose |
|---|---|
| `create-learning-project-workflow.ts` | New session + profile + optional markdown-curriculum import |
| `continue-learning-project-workflow.ts` | Finds next ready unit, prepares it, returns a workspace href |
| `get-active-plan-workflow.ts` | Fetch `CurriculumPlan` by session |
| `get-ai-workspace-workflow.ts` | Resolve/prepare the current workspace turn |
| `submit-ai-workspace-message-workflow.ts` | One user message in → persisted AI turn out |
| `advance-completed-unit-workflow.ts` | Gate + commit moving past a mastered unit |
| `get-home-state-workflow.ts` | Dashboard/home summary state |
| `get-profile-workflow.ts` | Training-side profile projection (distinct from `profile/` domain) |
| `get-unit-workflow.ts` | Load a unit, generating scaffold/lesson/briefing on demand if missing |
| `get-workspace-index-workflow.ts` | Searchable index across projects/chats |
| `start-onboarding-workflow.ts` | Create session, send intro prompt |

**Pattern:** `Result<T, string>` (from `lib/result.ts`) almost everywhere;
`submit-ai-workspace-message-workflow.ts` is the one exception — it
`try/catch`es around `runOneStep` and additionally calls
`deps.markWorkspaceTurnFailed` on the catch path (lease cleanup), which none
of the other workflows need because they don't hold a lease.

**SMELL:** `get-unit-workflow.ts` is the busiest file in this layer — it reads
a unit, and if pieces are missing, reaches into `orchestration/unit-flow.ts`
to generate scaffold/lesson and into `generate-cluster-briefing.ts` for a
briefing, inline. A "read" workflow that conditionally triggers three
different generation paths is doing more than its name says.

---

## 3. `training/workspace-ai/` — turn orchestration & persistence

**Purpose:** decides which "turn" runs next (education-unit phase, recall, or
scenario), calls it, and commits the result durably.

**Files:** `orchestrator.ts` (pure state-machine: which mode/phase runs next —
returns `null` on terminal states, no throws), `workspace-turn.ts` (resolves
the runnable turn: plan + node + unit + unit-run projection),
`workspace-turn-orchestration.ts` (`runOneStep` — the actual choreographer:
calls education-unit or recall, then persistence), `workspace-turn-persistence.ts`
(`saveUnitPhaseResult` / `saveRecallTurnResult` — durable commits),
`stage-runtime.ts`, `fsm-tools.ts` (maps AI-SDK tool calls to `UnitEvent`),
`runtime.ts`, `types.ts`, `prompts.ts`.

**Pattern:** closure-injected `deps` object (`WorkspaceTurnDependencies`,
~15 methods, all `Promise`-returning), plain `throw new Error(...)` for
invariant violations ("Curriculum is not ready yet.", "Unit is not active."),
no typed error channel. This is the *named* next target in
`effect-migration.md` (Phase 2/3, "workspace-turn slice") — not something this
document is proposing, just confirming it's still pre-migration as of this
write-up.

**Note:** `workspace-turn-persistence.ts`'s `saveUnitPhaseResult` and
`saveRecallTurnResult` both end by calling `planNextWorkspaceTurn` and
re-listing messages — same three-step tail in both functions (compute next
state → list messages by slot → return `{state, messages, assistantMessage}`).
Not a bug, but worth the reviewer's eye for whether it's the same operation
with two different "which phase produced the content" inputs, or genuinely
two flows.

---

## 4. `training/education-unit/` — the FSM + phase agents

**Purpose:** the orient → connect → solve → teach loop (two passes) that is
the actual unit of learning.

**Files:** `unit.ts` (the recipe: phases, pass/fail bar, loop limits —
data, not logic), `fsm.ts` (the only place a transition is applied),
`context.ts` (pure: turns durable state + material into the "## Context"
block a phase agent sees), `orchestrate-unit-turn.ts` (`runUnitTurn` — one
model call, mapped to an event, transitioned, returned), `agents/`
(`orient-agent.ts`, `connect-agent.ts`, `solve-agent.ts`, `teach-agent.ts`,
`run-phase-agent.ts`, `errors.ts`, `output-schema.ts`, `system-prompt.ts`).

**This is the most mature reliability code in the codebase.**
`agents/run-phase-agent.ts` already uses `Effect.gen`/`Effect.retry` with a
tagged-error union (`AgentSchemaError | AgentProviderError | AgentTimeoutError
| AgentPartialOutputError` via `Data.TaggedError`) and a bounded
exponential-backoff + one-repair-pass policy. Nothing about this area needs
"more type safety" in the way the rest of the codebase does — if anything, it
is the reference implementation the rest of `training/` should be measured
against.

**Inconsistency worth flagging:** `orchestrate-unit-turn.ts` (`runUnitTurn`)
calls `Effect.runPromise(...)` internally and re-throws a plain
`EducationUnitTurnError extends Error` for its own invariant ("agent didn't
call the grading tool"). So the typed `PhaseAgentError` channel from the
agent layer gets collapsed back into an untyped `Promise` one level up,
right before the caller (`workspace-turn-orchestration.ts`) needs to
distinguish "the model failed" from "the model answered but didn't grade."
The type safety this layer built gets thrown away at its own boundary.

---

## 5. `training/engine/` — model execution, rating, compaction

**`execute.ts`** (`executePrompt`) — used by loose top-level generate/grade
files (see §9) and several `capstone/` files (out of scope here, but it's a
shared dependency). Manual `for` loop, 2 attempts, generic `throw new
Error(errorMessage)` on exhaustion. No timeout, no typed error.

**`model-router.ts`** — picks provider/model by purpose+tier; throws generic
`Error` when no API key is configured.

**`observe.ts`** (`logPromptExecution`) — structured console logging of each
attempt (latency, success, score). Candidate to become `Effect.log` +
`Effect.withSpan` if/when this area is migrated, but that's downstream of
this document's purpose.

**`plan-progression.ts`** — curriculum node status transitions.

**`rating/`** (`glicko.ts`, `decide.ts`, `apply-evaluation.ts`,
`expand-band-ladder.ts`, `evidence.ts`, `misconceptions.ts`, `policy.ts`,
`render.ts`) — the Goldilocks difficulty-rating engine. Pure/computational,
consumed by `orchestration/goldilocks.ts`. No issues observed; not reviewed
file-by-file here since it's math/policy, not orchestration.

**`compaction/`** (`compaction.ts`, `summarize.ts`, `policy.ts`) — running
transcript summarization with `AbortSignal.timeout(12s)` on the summarizer
call. This is the **only** call site in all of `training/` that threads an
abort signal into an AI SDK call.

---

## 6. `training/orchestration/` — higher-level flows

| File | Status | Notes |
|---|---|---|
| `build-project.ts` (~900 lines) | **Active, core** | Full onboarding→curriculum→overview→persist checklist. State machine with per-artifact retry/resume tracking (`ArtifactBuildError`, partial-write queuing). Confirmed called from `router/onboarding-chat.ts` and `agents/onboarding-chat-agent.ts`. Size is arguably justified by genuine idempotency/resume requirements — a reviewer should judge whether the complexity is inherent or accreted. |
| `curriculum-flow.ts` | **Active** | `buildCurriculumNodes` — turns a curriculum designer draft into positioned graph nodes (clusters/units/simulations/integration layers). Pure. |
| `goldilocks.ts` | **Active** | Wires `engine/rating` functions to storage (`prepareScenarioDirective`, `recordEvaluation`). Confirmed called from `workspace-turn-orchestration.ts` and repositories. |
| `rating-scope.ts` | **Active** | Pure node-graph walk (unit → ancestor skill_cluster) with cycle detection (`CurriculumInvariantError`). Confirmed called from `workspace-turn-orchestration.ts` and `education-unit/unit.ts`. |
| `project-build-preview.ts` | **Active** | Formats partial AI outputs into human-readable checklist progress text for `build-project.ts`. Confirmed imported there. Pure formatting, no agent calls. |
| `agent-runtime.ts` | **Active** | Own `ArtifactFailureKind` taxonomy + hand-rolled retry loop for long-form/resumable artifact generation (see prior conversation — this is the third of three overlapping AI-retry patterns in the codebase, alongside `engine/execute.ts` and `education-unit/agents/run-phase-agent.ts`). |
| `unit-flow.ts` | **Partially dead** | Exports `generateUnitScaffold` (used by `get-unit-workflow.ts`) and `generateUnitLesson` (**zero callers anywhere in the repo** — verified). |
| `onboarding-flow.ts` | **Dead weight, not dead code** | 10-line pass-through to `agents/onboarding.ts`'s `buildOnboardingPacket`. Confirmed called (from `build-project.ts`), but adds no behavior — a candidate to inline unless it's meant as a seam for future orchestration logic. |
| `ghost-flow.ts` | **Confirmed dead** | Two-function wrapper around `unit-builder`'s repair stage (`generateRepair`/`evaluateRepair`). **Zero references anywhere in current `src/`** — verified by grep; only appears in stale `dist/` build output. |

---

## 7. `training/unit-builder/` — seed → build → prove → repair pipeline

**Purpose:** generates one unit's actual content, per-slot, in four ordered
AI calls: `seed-stage.ts` (what to teach + scenario), `build-stage.ts`
(rebuild the learner's model after their seed response), `prove-stage.ts`
(practice prompts + teach-back evaluation), `repair-stage.ts` (ghost/transfer
scenario when prove fails). `contracts.ts` holds the Zod schemas gluing each
stage's output to the next stage's input. `orchestrator.ts`
(`educationUnitBuilder`) is a thin dispatch object exposing `seed`,
`buildAndProve`, `evaluatePractice`, `reviewProve`, `generateRepair`,
`evaluateRepair`.

Each stage calls a shared `runAgent(...)`/`runResilientAgent(...)` helper
(distinct from `engine/execute.ts` and from `education-unit/agents/run-phase-agent.ts`
— a fourth AI-call pattern, though closer in spirit to `agent-runtime.ts`'s
resilient-artifact style).

No cross-stage error handling: a mid-pipeline failure has no stage-tagged
error and no checkpoint — `buildAndProve` re-runs both `runBuildStage` and
`generateProveStage` on any retry, there's no way to resume from "build
succeeded, prove failed." Structurally this is the same shape as
`orchestrate-unit-turn.ts`'s pattern of losing typed failures at a pipeline
boundary, one layer down.

---

## 8. `training/context-engine/` — context assembly for AI calls

**Purpose:** turns durable state + learner memory + response history into the
"## Context" block(s) handed to phase agents and the recall path.

**Files:** `build-context-envelope.ts` (the assembler — selects memory,
selects evidence, determines the output "move" [teach/diagnose/guide/evaluate/
transfer/recall], builds an output contract), `build-messages.ts` (envelope →
`ModelMessage[]`), `select-evidence.ts` (latest message, strongest success,
strongest failure, unresolved pattern, retry count), `select-memory.ts`
(durable memory + recurring-failure patterns + preferences, ranked by keyword
overlap against a hardcoded stopword list), `context-budget.ts` (truncation
limits — pure config), `render-context-prompt.ts` (envelope → prompt text),
`schemas.ts` (the envelope's Zod schema).

Entirely pure/computational — no I/O, no AI calls, no errors to speak of.

**DUPLICATE (structural, not logic):** `select-evidence.ts` and
`select-memory.ts` both implement the same "filter candidates → rank/score →
truncate to budget" shape independently, with their own local ranking
heuristics. Not wrong, but if a third selector is ever added, this shape
should become one small internal interface rather than a third bespoke
implementation.

---

## 9. `training/agents/` — top-level content-generation agents

(Distinct from `education-unit/agents/` in §4 — these are per-artifact
generators, not per-turn phase agents.)

| File | Produces | Calls |
|---|---|---|
| `build-content.ts` | **Confirmed dead** — Pre-seed / post-seed unit scaffold, zero callers anywhere in the repo | `runAgent({agent: "buildContent", ...})` |
| `curriculum-designer.ts` | Full curriculum draft + identity report + before/after | `runResilientAgent({agent: "curriculumDesigner", ...})` |
| `failure-isolation.ts` | Root-gap diagnosis after a failed teach-back | `runAgent({agent: "failureIsolation", ...})` |
| `ghost-replay.ts` | Transfer/ghost scenario + evaluation | `runAgent({agent: "ghostReplay", ...})` |
| `onboarding.ts` | Onboarding packet from transcript | `runResilientAgent({agent: "onboarding", ...})` |
| `onboarding-chat-agent.ts` | Live onboarding chat system prompt + `createCreateProjectTool()` | wraps `build-project.ts` as a tool call |
| `project-overview.ts` | Long-form (6-10k token) narrative overview, resumable on truncation | `runResilientAgent({agent: "projectOverview", ...})` — **note:** internal call site says `agent: "curriculumDesigner"`, worth a reviewer double-checking whether this is a copy-paste artifact or intentional shared routing |

**`build-content.ts` is confirmed dead — zero callers anywhere in the repo**
for both `generatePreSeedUnit` and `generatePostSeedLesson` (verified by
grep). It's an earlier, less-specialized version of what
`unit-builder/seed-stage.ts` + `build-stage.ts` now do; fully superseded, not
just "possibly redundant."

---

## 10. `training/services/` — small shared utilities

| File | Status |
|---|---|
| `curriculum-markdown-import-service.ts` | **Active.** Real parsing logic (heading extraction, text cleanup, blueprint construction) for the "paste a markdown curriculum" import path in `create-learning-project-workflow.ts`. |
| `provisional-project-title.ts` | **Active.** Small pure title-clamping utility, wired into `router/training.ts` directly. |
| `onboarding-prompts.ts` | **Active, but a one-line file.** Exports a single intro-prompt constant, imported by `start-onboarding-workflow.ts`. Candidate to inline; not wrong, just a file that exists to hold one string. |
| `build-before-after-profile.ts` | **Confirmed dead — zero callers anywhere in the repo.** Thin wrapper around `executePrompt` with a legacy prompt template; superseded by `curriculum-designer.ts`'s `CurriculumDesignerOutput.beforeAfter`. |
| `build-identity-report.ts` | **Confirmed dead — zero callers anywhere in the repo.** Same shape/fate as above; superseded by `CurriculumDesignerOutput.identityReport`. |

---

## 11. `training/policies/`

**`education-unit-state-policy.ts`** — backward-compatibility mapper from a
legacy `EducationUnitState` shape (old stage names: scenario/evaluate/complete)
to the current one. Necessary as long as old persisted rows can still exist;
a reviewer with access to production data age/volume is better positioned
than this document to say when it can be deleted.

**`recall-policy.ts`** — spaced-recall candidate selection; urgency score from
decay + weakness + recency. Pure, no issues observed.

---

## 12. Loose top-level `training/*.ts` files — confirmed dead code

Every file below was checked with a repo-wide grep for real imports (not
just name mentions). **Result: 13 of 14 have zero real importers anywhere in
`packages/api/src` or `apps/`.** A few names coincidentally appear as string
literals (`id: "grade-teachback"`, etc.) inside `prompts/legacy/assessment.ts`
— those are unrelated prompt-template IDs, not references to these files.

**Confirmed dead:**
`generate-unit-setup.ts`, `run-teachback.ts`, `build-forge-debrief.ts`,
`generate-ghost-scenario.ts`, `grade-ghost-response.ts`,
`generate-recall-probes.ts`, `generate-recall-repair.ts`,
`generate-practice-prompts.ts`, `generate-build-content.ts`,
`grade-teachback.ts`, `isolate-failure.ts`, `grade-recall-probe.ts`,
`evaluate-practice-response.ts`.

**Dead cluster:** `generate-training-object.ts` has exactly one caller —
`evaluate-practice-response.ts`, which itself has zero callers. So this is a
two-file dead cluster, not a shared live utility.

**Confirmed alive:** `generate-cluster-briefing.ts` — imported by
`get-unit-workflow.ts` (§3).

These 13 files represent an earlier generation of this system (direct
`executePrompt`/template-based generation) fully superseded by the current
`agents/` + `unit-builder/` + `education-unit/agents/` generation (`runAgent`
/ `runResilientAgent` / `Effect`-based phase agents). They cost nothing at
runtime but cost real reading-comprehension tax on anyone exploring this
domain for the first time — this document's author included.

---

## 13. `repositories/` (memory + training only; `profile-repository.ts` excluded)

Plain `async` functions returning `Promise<T | null>` or throwing directly —
no `Result` wrapper, no `DbError` classification. One exception worth noting:
`training-unit-run-repository.ts`'s `parsePhase`/`parsePass` `throw new
Error(...)` on a row with a corrupted/unknown enum value (data that predates
the FSM or was hand-edited) — this is the one place in this group where
"throw" is a deliberate "fail loudly, this is corruption, not a valid state"
choice rather than laziness, per its own comment.

`workspace-turn-repository-deps.ts` (~540 lines) is the closure-factory
`effect-migration.md` already names as the biggest single migration target.

---

## Cross-cutting patterns for the reviewer to weigh in on

1. **Four independent "call an AI model and handle failure" implementations**
   coexist: `engine/execute.ts` (manual loop), `orchestration/agent-runtime.ts`
   (`ArtifactFailureKind` + hand-rolled loop), `education-unit/agents/run-phase-agent.ts`
   (`Effect` + `Schedule`, the most mature), and `unit-builder`'s
   `runAgent`/`runResilientAgent`. Before picking one to standardize on,
   it's worth asking whether all four call sites actually need the same
   reliability shape, or whether some of the difference is real (e.g.
   resumable long-form generation vs. a single structured call) and some is
   just drift.

2. **Two error-result conventions**: `Result<T, string>` (`lib/result.ts`,
   most of `training/workflows/`) vs. `Result<T, {code, message}>`
   (`memory/`) vs. plain `throw` (`workspace-ai/`, `unit-builder/`,
   `orchestration/`). None of the three is wrong in isolation; the
   inconsistency is the cost.

3. **A meaningful fraction of `training/`'s file count is dead** (13 loose
   top-level files, 2 service files, 1 orchestration file, 1 top-level agent
   file, half of `unit-flow.ts`) — 18 files across this scope with zero real
   callers, all superseded by the current `agents/` + `unit-builder/` +
   `education-unit/agents/` generation. Deleting these first would shrink the
   domain a reviewer (human or model) has to reason about before any Effect
   work starts, independent of any architectural opinion about the live code.
