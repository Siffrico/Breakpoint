# Concept-To-Execution Loop

This document describes the live learning-loop runtime in `packages/api/src/domain/becoming`.

## Canonical Surface

The main learner UI is `/home`.

This is not a separate "Forge workspace" product surface. The current
`ForgeWorkspace` React component is only an implementation detail inside the
home experience.

Product rule:

- all learner-facing unit progression goes through `/home`
- the unit should feel like one agentic chat session
- each visible chat turn corresponds to one stage in the learning loop
- stage transitions should appear as chat progression, not as a separate tool or mode

## Runtime Thesis

Each unit now teaches both:

1. Declarative understanding
2. Procedural execution

The runtime is designed to expose the learner's intuition, patch the concept with explicit prediction-error feedback, stabilize that correction, and then force a procedural build in a fresh scenario.

Canonical flow:

1. `challenge`
2. `initial_response`
3. `concept correction`
4. `mastery_check`
5. `transfer_challenge`
6. `build_response`
7. `implementation_review`
8. `revision`
9. `final assessment`

Only the learner submission boundaries are modeled as active stages:

- `challenge`
- `mastery_check`
- `transfer_challenge`
- `revision`
- `complete`

## State Model

The shared state object is `EducationUnitState`.

Important fields:

- `activeStage`
- `retryCount`
- `challenge`
- `initialResponse`
- `diagnosticGap`
- `conceptCorrection`
- `workedExamples`
- `priorKnowledgeBridge`
- `masteryCheck`
- `masteryCheckResponse`
- `transferChallenge`
- `buildResponse`
- `implementationReview`
- `revisedBuildResponse`
- `assessmentStatus`
- `assessmentFeedback`

## AI Boundaries

The runtime uses four explicit AI calls:

1. `generateConceptLayer`
   Builds the prediction-error diagnosis, concept correction, worked examples, mastery check, and procedural transfer challenge.

2. `evaluateMasteryCheck`
   Decides whether the learner is ready to apply the concept or needs another concept-focused retry.

3. `reviewBuildResponse`
   Reviews the first implementation pass and produces a concrete revision brief.

4. `evaluateRevision`
   Produces the final assessment and decides between:
   - `pass`
   - `retry_concept`
   - `retry_application`

## Persistence

State is still reconstructed from saved `stateSnapshot` metadata on phase responses.

New learner submission phases:

- `loop_initial_response`
- `loop_mastery_check`
- `loop_build_response`
- `loop_revision`

The state policy includes a legacy mapper so older `scenario / evaluate / complete` snapshots can still hydrate.

## Key Files

- `packages/validators/src/becoming.ts`
- `packages/api/src/domain/becoming/policies/education-unit-state-policy.ts`
- `packages/api/src/domain/becoming/services/education-unit-ai-service.ts`
- `packages/api/src/domain/becoming/workflows/submit-education-unit-step-workflow.ts`
- `apps/nextjs/src/features/becoming/components/forge/forge-workspace.tsx`
- `apps/nextjs/src/features/becoming/components/unit-question-panel.tsx`
