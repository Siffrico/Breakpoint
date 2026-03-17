## Feature Blueprint

### 1. User Problem and Learning Goal

- **Problem**: first-time users need a clear entry into Breakpoint instead of a vague starter screen
- **Core action**: choose a domain, enter a scenario, submit a typed answer
- **Learning behavior**: retrieval, prioritization, diagnosis, and repair under pressure
- **Success metric**: user can start a scenario in one click and receive actionable grading feedback in the same session

### 2. User Experience Flow

- **Start**: landing page with six rectangular domain cards
- **Transition**: only `Software Engineering` is live and routes into the arena
- **Arena**: top 40% scenario prompt, bottom 60% answer workspace and evaluation rail
- **Feedback**: deterministic grading stub returns score, strengths, repair targets, and next stage

### 3. Technical Approach

- **Decision**: use a DDD-style slice in `packages/api/src/domain/esde-simulation`; rationale: this sets the architecture precedent early
- **Decision**: keep data in a repository-backed static catalog for now; rationale: logic-first without forcing premature schema work
- **Decision**: grade with a deterministic rubric before AI; rationale: UI and orchestration should work before model integration
- **Decision**: query initial data on the server and mutate through tRPC on the client; rationale: simple first slice with clean boundaries

### 4. Acceptance Criteria

- [x] homepage shows six sleek domain cards with one active option
- [x] software engineering route renders a scenario arena with the requested layout
- [x] response submission returns structured grading feedback
- [x] logic is organized with workflow, repository, policy, and router boundaries

---

## Architecture Plan

### File Structure

```text
apps
└─ nextjs
   └─ src
      ├─ app
      │  ├─ page.tsx
      │  └─ domains/[domainSlug]/page.tsx
      └─ features
         └─ esde
            ├─ components
            │  ├─ domain-selection.tsx
            │  └─ scenario-workspace.tsx
            └─ server
               └─ esde-queries.ts

packages
├─ api
│  └─ src
│     ├─ domain/esde-simulation
│     │  ├─ policies
│     │  ├─ types
│     │  └─ workflows
│     ├─ repositories/esde-simulation-repository.ts
│     ├─ router/esde-simulation.ts
│     └─ lib/result.ts
└─ ui
   └─ src
      └─ textarea.tsx
```

### Key Decisions

- **Router stays thin**: validates input and converts workflow errors into `TRPCError`
- **Workflow owns orchestration**: availability checks, active scenario retrieval, and submission validation live outside the router
- **Policy owns grading**: scoring logic is isolated so AI grading can replace it later
- **Repository owns content**: domains and the active scenario stay behind a single retrieval boundary

---

## Implementation Plan

### Subtasks

1. Add `Result<T>` and the ESDE domain slice in `packages/api`
2. Add a static repository and a deterministic grading policy
3. Wire the `esdeSimulation` router into the app router
4. Replace the starter homepage with a Breakpoint domain-selection page
5. Build the scenario workspace page with a large textarea and grading panel
6. Verify type safety and route flow
