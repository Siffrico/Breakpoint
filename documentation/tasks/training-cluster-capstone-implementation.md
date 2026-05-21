## Implementation Plan

### File Tree

```text
documentation
└─ tasks
   └─ training-cluster-capstone-implementation.md

packages
├─ db
│  └─ src
│     └─ schema.ts
├─ validators
│  └─ src
│     └─ training.ts
└─ api
   └─ src
      ├─ domain
      │  └─ training
      │     ├─ capstone
      │     │  ├─ evaluate-build.ts
      │     │  ├─ evaluate-debate.ts
      │     │  ├─ evaluate-teach.ts
      │     │  ├─ run-capstone-agent.ts
      │     │  ├─ advance-debate-round.ts
      │     │  ├─ advance-teach-round.ts
      │     │  ├─ fallback-capstone.ts
      │     │  ├─ tools
      │     │  │  ├─ build-challenge.tool.ts
      │     │  │  ├─ debate-scenario.tool.ts
      │     │  │  └─ teach-challenge.tool.ts
      │     │  └─ types
      │     │     └─ capstone.types.ts
      │     ├─ types
      │     │  └─ training.types.ts
      │     └─ workflows
      │        ├─ generate-capstone-workflow.ts
      │        ├─ get-capstone-workflow.ts
      │        └─ submit-capstone-message-workflow.ts
      ├─ repositories
      │  ├─ training-capstone-repository.ts
      │  ├─ training-curriculum-repository.ts
      │  └─ training-training-repository.ts
      └─ router
         └─ training.ts

apps
└─ nextjs
   └─ src
      ├─ app
      │  └─ train/[unitId]/page.tsx
      └─ features
         └─ training
            ├─ components
            │  ├─ workspace-overview.tsx
            │  ├─ capstone
            │  │  ├─ build-capstone.tsx
            │  │  ├─ capstone-workspace.tsx
            │  │  ├─ debate-capstone.tsx
            │  │  └─ teach-capstone.tsx
            │  └─ forge
            │     └─ forge-workspace.tsx
            └─ server
               └─ training-queries.ts
```

### Responsibilities

- `packages/db/src/schema.ts`
  Adds capstone attempt and message tables keyed by the existing `simulation` node.
- `packages/validators/src/training.ts`
  Defines shared capstone scenario, message, state, submission, and evaluation contracts.
- `packages/api/src/repositories/training-capstone-repository.ts`
  Owns capstone persistence, transcript ordering, and attempt updates.
- `packages/api/src/domain/training/capstone/*`
  Owns scenario generation, round advancement, evaluation, and deterministic fallbacks.
- `packages/api/src/domain/training/workflows/*capstone*`
  Owns policy: when a simulation can be generated, when a response advances, and when a capstone completes.
- `packages/api/src/router/training.ts`
  Exposes capstone queries and mutations with the same thin-router pattern as the rest of training.
- `apps/nextjs/src/features/training/components/capstone/*`
  Renders format-specific capstone flows while sharing transcript and completion state.
- `apps/nextjs/src/app/train/[unitId]/page.tsx`
  Routes a ready node to Forge or capstone based on the node kind.

### Subtasks

1. Schema and shared contracts
   Verification checkpoint: repo typecheck sees the new capstone types and DB exports cleanly.
   Stop point: confirm the table shape and discriminated scenario union before AI logic lands.

2. Repository and progression fixes
   Verification checkpoint: simulation nodes become the next ready training node, and finishing the last unit no longer unlocks the next unit before the simulation.
   Stop point: review the updated readiness policy because it changes curriculum progression.

3. Capstone generation and evaluation workflows
   Verification checkpoint: a ready simulation node can generate or retrieve a capstone, store an initial scenario, and accept user turns through final evaluation.
   Stop point: inspect the AI fallbacks and final scoring behavior to protect pedagogy quality.

4. Router and training entry integration
   Verification checkpoint: the `train/[unitId]` page can open either a Forge unit or a simulation capstone without custom URLs.

5. UI surfaces and interaction states
   Verification checkpoint: build, debate, and teach render correctly, show transcript/history, disable invalid submissions, and surface pass/fail feedback clearly.

6. Final verification
   Verification checkpoint: targeted `typecheck` passes for the touched packages and primary flows are manually traceable from home to debrief to capstone.

### High-Risk Notes

- Do not auto-pass on evaluator failure. Keep the attempt in progress or fail closed with explicit feedback.
- Do not create a parallel cluster progression path. Capstones must attach to existing `simulation` nodes.
- Do not fire-and-forget server work in a way that can silently drop generation. Prefer deterministic generation on retrieval over unreliable background side effects.
