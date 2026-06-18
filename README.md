# Breakpoint

Breakpoint is a chat-first AI learning product for building real capability, not just moving through lessons. A learner starts with a goal, defines what they want to be able to do with it, and is guided through adaptive training that compresses expert practice into short, high-leverage interactions.

The product assumes the AI should carry operational load: scaffolding, setup, examples, scenario state, evaluation, and persistence. The learner should carry the expert load: framing the problem, making tradeoffs, diagnosing failures, explaining causality, and transferring judgment to new cases.

## Current Product Surface

The Next.js app currently includes the main Breakpoint training experience:

```text
apps/nextjs/src
├─ app
│  ├─ onboarding
│  ├─ curriculum
│  ├─ workspace
│  ├─ train/[unitId]
│  ├─ profile
│  └─ ui
├─ features
│  ├─ auth
│  ├─ courses
│  ├─ marketing
│  ├─ profile
│  └─ training
└─ trpc
```

The backend domain is organized around the same product model:

```text
packages/api/src
├─ domain
│  ├─ memory
│  ├─ profile
│  └─ training
├─ repositories
└─ router
```

The database schema is split by product domain under `packages/db/src/schema`, with training tables for onboarding, identity profiles, curriculum plans, units, recall, ratings, attempts, and capstones.

## Stack

- Next.js 16 App Router
- React 19
- tRPC v11
- Drizzle ORM
- Supabase PostgreSQL
- Better Auth
- Zod v4
- Tailwind CSS v4
- Turborepo and pnpm workspaces
- Shared UI primitives in `@acme/ui`

The repository still uses the `@acme/*` workspace package namespace inherited from the starter. Treat that as an internal package namespace, not a product name.

## Getting Started

Install dependencies:

```bash
pnpm i
```

Create local environment variables:

```bash
cp .env.example .env
```

Generate Better Auth database schema:

```bash
pnpm auth:generate
```

Push the Drizzle schema:

```bash
pnpm db:push
```

Run the Next.js app:

```bash
pnpm dev:next
```

Useful validation commands:

```bash
pnpm typecheck
pnpm lint
pnpm format
```

## Workspace Layout

```text
apps
├─ nextjs            # Primary Breakpoint web app
├─ expo              # Mobile starter surface
└─ tanstack-start    # Starter reference surface

packages
├─ api               # tRPC routers, domain workflows, AI orchestration
├─ auth              # Better Auth configuration and CLI schema generation
├─ db                # Drizzle client and schema
├─ ui                # Shared UI primitives
└─ validators        # Shared input/output schemas

tooling
├─ eslint
├─ prettier
├─ tailwind
└─ typescript

documentation        # Product, architecture, and implementation notes
docs                 # Prompt and system-message drafts
```

## Product Principles

- Start from the learner's goal and intended use, not a generic topic catalog.
- Build curriculum from expert jobs, workflows, judgment, and failure modes.
- Keep learning units realistic and compressed; do not turn them into tiny disconnected concept slices.
- Let AI scaffold artifacts and carry boilerplate while the learner makes the important decisions.
- Measure improvement through evidence of better judgment, diagnosis, and transfer.

## Key Documentation

- [AGENTS.md](/Users/safinahmed/Breakpoint/AGENTS.md) defines project-specific agent behavior.
- [documentation/project-goal.md](/Users/safinahmed/Breakpoint/documentation/project-goal.md) states the product thesis.
- [documentation/backend-rq.md](/Users/safinahmed/Breakpoint/documentation/backend-rq.md) describes backend responsibilities.
- [documentation/ui-flow-rq.md](/Users/safinahmed/Breakpoint/documentation/ui-flow-rq.md) describes the intended user journey.
- [documentation/breakpoint-engineering-protocol.md](/Users/safinahmed/Breakpoint/documentation/breakpoint-engineering-protocol.md) defines engineering standards for product work.

## Notes for Contributors

Prefer feature-local code in the Next.js app and domain-local workflows in `packages/api`. Keep prompts, rubrics, scoring policies, and curriculum logic treated as product logic, not throwaway strings. When documentation and code disagree, verify the code first, then update the docs or file a clear implementation gap.
