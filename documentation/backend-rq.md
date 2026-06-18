# Backend Requirements

## Product Frame

The backend supports an identity-first adaptive training system. It is responsible for turning onboarding context into curriculum, running the training loop, preserving evidence, and helping the product recommend what the learner should do next.

The current implementation is organized around three main domains:

```text
packages/api/src/domain
├─ memory
├─ profile
└─ training
```

The backend should keep this shape: product workflows live in domain modules, persistence lives in repositories, and HTTP/API exposure stays in tRPC routers.

## Current Responsibilities

### 1. Onboarding and Identity Modeling

The system captures the learner's goal, context, target identity, current baseline, hard moments, behavior signals, confidence flags, and proof-of-progress expectations.

Important requirements:

- preserve onboarding session state
- create durable identity profiles and profile versions
- convert traits into observable behaviors where possible
- keep uncertainty explicit instead of inventing missing facts
- allow future profile edits to inform curriculum recalibration

Relevant code:

```text
packages/api/src/domain/training/orchestration/onboarding-flow.ts
packages/api/src/domain/training/agents/onboarding-chat-agent.ts
packages/db/src/schema/training/onboarding.ts
packages/db/src/schema/training/profile.ts
```

### 2. Curriculum Generation and Storage

The backend generates an active curriculum plan from the learner's identity model and persists ordered curriculum nodes. A curriculum node should explain what capability it builds, why it matters, and where it sits in the larger progression.

Important requirements:

- preserve plan, stage, and node structure
- support unit and capstone-style nodes
- store ordering and map positions for UI rendering
- preserve completed evidence when curriculum evolves
- keep rationale available to the learner and mentor layer

Relevant code:

```text
packages/api/src/domain/training/agents/curriculum-designer.ts
packages/api/src/domain/training/orchestration/curriculum-flow.ts
packages/api/src/repositories/training-curriculum-repository.ts
packages/db/src/schema/training/curriculum.ts
```

### 3. Unit Training Loop

Education units should be generated and evaluated as backend product logic, not as hardcoded frontend content. The backend should support setup, briefing, recall, practice, evaluation, debrief, and repair.

Important requirements:

- generate unit setup and practice prompts from curriculum context
- grade recall and practice responses
- isolate failure causes precisely
- store attempts, timing, outcomes, and debriefs
- unlock progression based on evidence, not passive completion

Relevant code:

```text
packages/api/src/domain/training/orchestration/unit-flow.ts
packages/api/src/domain/training/unit-builder
packages/api/src/domain/training/evaluate-practice-response.ts
packages/api/src/domain/training/isolate-failure.ts
packages/db/src/schema/training/unit.ts
packages/db/src/schema/training/recall.ts
```

### 4. Capstones and Integrated Performance

Breakpoint needs integrated checks that require the learner to combine multiple capabilities. These should feel like real performance tests, not quizzes with bigger labels.

Important requirements:

- generate capstone scenarios from curriculum context
- persist capstone messages and round state
- evaluate build, debate, teachback, or other task-specific modes
- complete curriculum nodes only when evidence supports it
- keep failure data available for future recommendations

Relevant code:

```text
packages/api/src/domain/training/capstone
packages/api/src/domain/training/workflows/generate-capstone-workflow.ts
packages/api/src/domain/training/workflows/submit-capstone-message-workflow.ts
packages/db/src/schema/training/capstone.ts
```

### 5. Workspace AI and Recommendation

The workspace is the learner's daily operating surface. Backend logic should synthesize curriculum state, recent attempts, profile context, and memory into useful next actions.

Important requirements:

- explain why the next action is recommended
- distinguish weak evidence from strong evidence
- surface repeated gaps without overclaiming
- use memory where it improves personalization
- avoid blocking core learning when noncritical AI or analytics calls fail

Relevant code:

```text
packages/api/src/domain/training/workspace-ai
packages/api/src/domain/training/context-engine
packages/api/src/domain/memory
packages/api/src/repositories/memory-repository.ts
```

## API Surface

Current tRPC routers are organized by product concern:

```text
packages/api/src/router
├─ auth.ts
├─ memory.ts
├─ profile.ts
└─ training.ts
```

The training router should expose workflow-level operations, not raw database primitives. It currently covers onboarding, learning project creation, active plan retrieval, unit retrieval, workspace messages, capstone generation, and capstone submission.

## Data Model

The current schema uses Breakpoint-specific training tables under `packages/db/src/schema/training`:

```text
training
├─ onboarding.ts
├─ profile.ts
├─ curriculum.ts
├─ unit.ts
├─ recall.ts
├─ rating.ts
└─ capstone.ts
```

New tables should be added only when they preserve product evidence or simplify clear domain workflows. Avoid tables that merely mirror a UI component.

## Engineering Requirements

- Keep business rules testable outside the UI.
- Keep AI integrations behind explicit workflow or service boundaries.
- Store prompts, rubrics, and scoring policies as versioned product logic where practical.
- Return structured errors from domain workflows and convert them at the router boundary.
- Prefer explicit TypeScript contracts and Zod schemas for cross-boundary inputs.
- Ensure noncritical failures do not corrupt session, curriculum, or attempt state.

## Open Backend Gaps

The following areas should remain explicit product/engineering questions:

- how profile edits should version and recalculate active plans
- what evidence should drive unit unlocks across different domains
- how to compare learner progress across domains without flattening nuance
- how memory should be selected, capped, and audited in AI context
- when to regenerate curriculum versus repair the current node sequence
