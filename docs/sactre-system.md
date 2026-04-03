# SACTRE System

This document describes the current SACTRE learning loop implemented in Breakpoint's `packages/api/src/domain/becoming` code.

## What SACTRE Means Here

In the live implementation, SACTRE is a six-step unit flow:

1. Scenario
2. Attempt
3. Concept
4. Teach
5. Reconnect
6. Evaluate

The acronym is used as product shorthand for a diagnostic teaching loop rather than a strict letter-for-stage mapping. The system is designed to:

- start with a concrete scenario instead of front-loading explanation
- capture the learner's actual reasoning before teaching
- generate a precise concept correction
- teach through compact examples
- bridge the new idea to prior knowledge
- test transfer with a fresh evaluation scenario

## System Goal

SACTRE exists to make each unit feel like a coaching intervention, not a generic lesson. The runtime tries to identify the learner's current model, teach the smallest useful concept, and then check whether that concept transfers to a new situation.

The main quality bar enforced by prompts and schemas is:

- teach one precise concept, not a broad topic
- use the learner's own wording when possible
- keep scenarios concrete and diagnostic
- make reconnect explicit
- evaluate transfer, not memorization

## High-Level Architecture

There are three main layers involved:

### 1. Unit scaffold generation

Before a learner responds, Breakpoint generates the initial unit shell from the seed-stage pipeline. That scaffold includes:

- unit title
- seed prompt
- seed hint
- cluster arc framing
- complexity budget
- scenario metadata

Primary files:

- `packages/api/src/domain/becoming/workflows/get-unit-workflow.ts`
- `packages/api/src/domain/becoming/orchestration/unit-flow.ts`
- `packages/api/src/domain/becoming/unit-builder/seed-stage.ts`

### 2. SACTRE runtime generation

After the learner submits an attempt, Breakpoint asks the AI service to generate the rest of the SACTRE pack:

- concept name
- concept summary
- attempt signals
- teach examples
- reconnect bridge
- evaluation scenario

Primary file:

- `packages/api/src/domain/becoming/services/education-unit-ai-service.ts`

### 3. State and persistence

The learner's state is reconstructed from the unit scaffold plus saved phase-response snapshots. The workflow persists snapshots after each major transition so the unit can be resumed deterministically.

Primary files:

- `packages/api/src/domain/becoming/policies/education-unit-state-policy.ts`
- `packages/api/src/domain/becoming/workflows/submit-education-unit-step-workflow.ts`
- `packages/api/src/domain/becoming/types/becoming.types.ts`
- `packages/validators/src/becoming.ts`

## Runtime Flow

### 1. Get or create the unit

`getUnitWorkflow` loads an existing unit by `nodeId` or generates one if it does not exist yet.

The generated unit becomes the initial SACTRE state:

- `currentStep = "scenario"`
- `loopCount = 0`
- `scenario` comes from `seedPrompt` and `seedHint`
- `concept`, `attempt`, `teachExamples`, and `evaluation` start empty

### 2. Present the scenario

The learner first sees a concrete scenario card built from the stored unit content:

- `scenario.title` from unit scenario metadata
- `scenario.prompt` from `seedPrompt`
- `scenario.helper` from `seedHint`

This is intentionally pre-teach. The learner should be forced to judge, choose, diagnose, or explain using only prior knowledge.

### 3. Record the attempt

When the learner submits the `attempt` step, the workflow:

- verifies the unit is still at `currentStep = "scenario"`
- trims and validates the response
- fetches prior attempt history for context
- calls `educationUnitAiService.generateTeachPack(...)`

That AI call returns the instructional payload for the rest of the loop.

### 4. Build the teaching payload

The generated teach pack populates:

- `concept`
- `attempt.signals`
- `teachExamples`
- `reconnectBridge`
- `evaluation`

The state then moves to:

- `currentStep = "evaluate"`

At this point the learner has already exposed their reasoning, and the system has converted that attempt into a targeted explanation and transfer test.

### 5. Evaluate transfer

When the learner submits the `evaluate` step, the workflow calls `educationUnitAiService.evaluateTransfer(...)`.

That evaluation produces one of three outcomes:

- `pass`
- `gap`
- `lost`

Each outcome updates the state differently.

#### `pass`

The learner demonstrated enough causal understanding to move on.

State transition:

- `currentStep = "complete"`
- final feedback, score, strengths, improvements, and next step are saved

#### `gap`

The learner is partially there but needs a different scenario anchor.

State transition:

- `currentStep = "scenario"`
- `loopCount += 1`
- scenario is replaced with `retryScenario` when provided
- prior attempt payload is cleared

This creates a new attempt cycle around the same concept.

#### `lost`

The learner still does not have the concept and needs simpler teaching before retrying.

State transition:

- `currentStep = "evaluate"`
- `loopCount += 1`
- the system may prepend `simplerExample` to `teachExamples`
- evaluation may be replaced with `retryScenario`

This keeps the learner in the teaching/evaluation part of the loop rather than fully resetting to the scenario step.

## State Model

The canonical runtime state is `EducationUnitState`.

Important fields:

- `currentStep`: `scenario | evaluate | complete`
- `loopCount`: number of retries
- `concept`: the named concept being taught
- `scenario`: the active scenario card
- `attempt`: learner response, confidence, latency, and diagnostic signals
- `teachExamples`: 2-3 examples generated for instruction
- `reconnectBridge`: explicit bridge to prior knowledge
- `evaluation`: transfer-check scenario card
- `result`: `pass | gap | lost`
- `score`, `strengths`, `improvements`, `nextStep`: debrief output

Schema source:

- `packages/validators/src/becoming.ts`

## Persistence Model

SACTRE does not persist every stage as a separate top-level phase. Instead, it persists snapshots at the two learner submission boundaries:

- `sactre_attempt`
- `sactre_evaluate`

Each saved `PhaseResponseRecord` can store:

- raw user response
- AI response summary or feedback
- score / pass status
- metadata including `stateSnapshot`

The latest valid `stateSnapshot` is the source of truth for reconstructing the unit state. If no snapshot exists, the system rebuilds the initial state from `UnitContent`.

## Prompt Contract

The SACTRE AI service uses one shared system prompt that defines the expected loop:

- Scenario
- Attempt
- Concept
- Teach
- Reconnect
- Evaluate

It also enforces several output rules:

- `conceptSummary` must be one sentence
- teach examples should move from the learner's world toward canonical form
- later examples should get shorter
- reconnect should follow the pattern: `This is like X you already know, except...`
- evaluation should use a new anchor, not the original prompt

## Relationship to the Older Forge Pipeline

This repo still contains the older Forge unit-builder pipeline:

- Seed
- Build
- Practice
- Teach-back
- Repair

Those pieces still exist in files like:

- `packages/api/src/domain/becoming/unit-builder/orchestrator.ts`
- `packages/api/src/domain/becoming/agents/build-content.ts`

That older pipeline is still important because it generates unit scaffolding and related instructional artifacts, but the current learner-facing unit runtime documented here is the newer SACTRE state machine.

Put differently:

- Forge pipeline = content generation infrastructure
- SACTRE runtime = live learner interaction loop

## Source Map

- Unit bootstrap: `packages/api/src/domain/becoming/workflows/get-unit-workflow.ts`
- Seed-stage generation: `packages/api/src/domain/becoming/unit-builder/seed-stage.ts`
- Runtime AI generation and evaluation: `packages/api/src/domain/becoming/services/education-unit-ai-service.ts`
- Runtime state policy: `packages/api/src/domain/becoming/policies/education-unit-state-policy.ts`
- Submission workflow: `packages/api/src/domain/becoming/workflows/submit-education-unit-step-workflow.ts`
- Runtime types: `packages/api/src/domain/becoming/types/becoming.types.ts`
- Runtime schemas: `packages/validators/src/becoming.ts`

## Short Summary

Breakpoint's SACTRE system is a stateful diagnostic-teaching loop. It starts with a concrete scenario, captures the learner's first attempt, generates a focused concept correction plus examples and reconnect framing, then evaluates transfer with a fresh scenario. The loop can complete, re-scenario on partial understanding, or simplify and retry when the learner is still lost.
