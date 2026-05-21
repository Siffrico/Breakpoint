# Workspace Context Engine Architecture

Breakpoint's main learner surface is `/workspace`. It should behave like a focused teaching workspace, not a generic chatbot. The AI layer should keep the current SACTRE loop intact while using the Vercel AI SDK as the execution layer for structured generation, streaming teaching turns, tool calls, reranking, and observability.

## Current Learning Loop

The existing loop is already close to the desired product shape:

```text
/workspace
  WorkspaceShell
    CurriculumSidebar
    RecallGateView
    ForgeWorkspace
      SeedPhase       -> scenario
      BuildPhase      -> concept / model / worked example
      PracticePhase   -> attempt
      ProvePhase      -> mastery_check / transfer / teachback
      UnitDebrief     -> evaluate / next move

API
  training router
    submitEducationUnitStepWorkflow
      initial_response -> diagnostic gap + concept + mastery_check + transfer
      mastery_check    -> ready_for_application | retry_concept
      build_response   -> implementation review
      revision         -> pass | retry_concept | retry_application
```

Plain-language product loop:

```text
scenario
  -> attempt
  -> concept repair
  -> mastery check
  -> new scenario
  -> build
  -> evaluate
  -> retry or advance
```

## Proposed File Tree

```text
packages/api/src/domain/training/
  context-engine/
    build-context-envelope.ts       # one bounded context object per AI call
    context-budget.ts               # token and section budgets
    retrieve-memory.ts              # explicit memory retrieval, filtering, ranking
    select-evidence.ts              # chooses prior attempts, failures, successes
    teaching-state.ts               # maps unit state to the next teaching move
    schemas.ts                      # zod contracts for context packets
  teaching/
    workspace-agent.ts              # Vercel AI SDK agent / stream entrypoint
    teaching-loop.ts                # scenario -> attempt -> concept -> mastery...
    teaching-voice.ts               # low-reading-level style constraints
    mastery-policy.ts               # pass/retry thresholds and retry shaping
  engine/
    execute.ts                      # keep structured generation here
    model-router.ts                 # model tier, gateway/provider selection
    observe.ts                      # latency, token usage, pass/fail metrics

apps/nextjs/src/app/workspace/
  page.tsx                          # main server entrypoint

apps/nextjs/src/features/training/components/
  workspace-shell.tsx               # main learner shell
  forge/forge-workspace.tsx         # unit execution UI
```

## Context Envelope

Every AI call should receive a small, typed packet instead of raw history. The model should never get "everything we know."

```ts
type ContextEnvelope = {
  learner: {
    targetIdentity: string;
    readingLevel: "simple";
    preferences: string[];
    durableMemory: string[];
  };
  unit: {
    title: string;
    currentStage: "scenario" | "attempt" | "concept" | "mastery_check" | "build" | "evaluate";
    conceptTarget: string;
    misconceptionTarget: string;
  };
  evidence: {
    latestAttempt: string;
    strongestPriorSuccess: string | null;
    mostRelevantFailure: string | null;
    unresolvedPattern: string | null;
  };
  outputContract: {
    move: "teach" | "check" | "build" | "evaluate" | "retry";
    maxWords: number;
    requiredSections: string[];
  };
};
```

## Context Bloat Rules

1. Store full transcripts, but do not prompt with full transcripts by default.
2. Retrieve memory by task intent, then rerank to the top few items.
3. Summarize older evidence into stable learner claims: "what they tend to miss", "what they can now do", "what unlocks them."
4. Use hard budgets per section: identity, unit state, prior evidence, retrieved memory, prompt.
5. Put durable memory behind explicit selectors, not automatic append.
6. Log which memory items were injected so bad context can be debugged.

## AI SDK Shape

Use Vercel AI SDK in two modes:

```text
structured internal calls
  generateObject / generateText with Output.object
  -> unit generation, grading, mastery decisions, debriefs

workspace teaching turns
  streamText or ToolLoopAgent
  -> chat-like tutoring, with tools for memory lookup and unit state reads
```

The best fit for Breakpoint is a custom memory/context tool, not an external memory provider. Breakpoint already has memory tables, unit state, attempts, recall gates, and learning evidence. Owning retrieval lets the tutor stay pedagogically strict instead of letting a generic memory layer decide what matters.

## Teaching Voice

The tutor should use simple language without lowering standards:

```text
short sentence
concrete example
one concept at a time
ask for evidence
check the mechanism
then make them apply it
```

Prompt rule:

```text
Teach like a sharp coach for a smart beginner.
Use plain words. Avoid school language.
Do not explain three things when one mechanism is blocking the learner.
Every turn must move the learner to one of:
scenario, attempt, concept, mastery_check, scenario, build, evaluate.
```

## Architecture Diagram

```text
                    /workspace
                        |
                 WorkspaceShell
                        |
         +--------------+--------------+
         |                             |
   Unit/Recall UI                 Workspace chat
         |                             |
         +--------------+--------------+
                        |
                 training router
                        |
              Teaching Loop Service
                        |
        +---------------+----------------+
        |                                |
 Context Engine                    AI SDK Runtime
        |                                |
  +-----+------+                  +------+------+
  |            |                  |             |
Memory repo  Evidence repo    streamText   generateObject
  |            |                  |             |
  +-----+------+                  +------+------+
        |                                |
 bounded ContextEnvelope          typed teaching output
                        |
                  Unit state update
                        |
                   Workspace UI
```

## Implementation Order

1. Keep `/workspace` as the main route and route legacy `/home` to it.
2. Add `context-engine/build-context-envelope.ts` and unit tests for budgeted selection.
3. Move ad hoc prompt context into `ContextEnvelope`.
4. Add a workspace teaching endpoint that streams turns but writes structured step results.
5. Add memory retrieval only through explicit tools/selectors.
6. Add eval cases for the loop: pass mastery, fail mastery, retry concept, retry application.
