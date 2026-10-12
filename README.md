# Breakpoint

Breakpoint is a chat-first AI learning app built by Safin Ahmed. A learner starts with a goal, gets a curriculum built around that goal, and practices through teaching, challenges, feedback, and recall inside one workspace.

This repository continues the original V1 of Breakpoint, an earlier implementation of the same project. The original V1 repository is now private.

The question behind the project is whether AI can turn expert workflows into short practice sessions that build useful judgment. The AI handles setup and scaffolding so the learner can focus on decisions, explanations, and diagnosing mistakes.

## Quick tour

1. Create an account and describe what you want to learn through onboarding chat.
2. Explore the generated curriculum and open a training unit in the workspace.
3. Explain your reasoning, answer challenges, and use feedback to revise your understanding.
4. Work through learn and exam rounds, with recall checkpoints and saved transcripts.

After starting the app, open `/ui/workspace` to inspect a sample workspace without creating an account or making AI calls. This preview uses fixture data and does not demonstrate live grading or persistence.

## My contribution

I built Breakpoint's learning experience on top of the create-t3-turbo starter. My work includes the onboarding and curriculum flows, the training workspace, the education-unit engine, AI orchestration, and the data model for learning progress and recall.

The starter supplied the monorepo foundation and initial app, authentication, and shared-package structure. The `@acme/*` package names remain from that foundation. The original MIT attribution is preserved in [LICENSE](LICENSE).

## Engineering decisions

- Learning progress needs an authority beyond the model's next response. The unit engine records steps, answers, and results in a persisted cursor, then derives the current mode and next action from that history. See [unit-state.ts](packages/api/src/domain/training/education-unit/unit-state.ts) and [unit-policy.ts](packages/api/src/domain/training/education-unit/unit-policy.ts).
- AI work takes time, so the chat streams text and typed status updates while a turn runs. Exam parts can be graded concurrently, but feedback streams in question order. See [workspace-chat.ts](packages/api/src/workspace-chat.ts) and [run-unit-turn.ts](packages/api/src/domain/training/education-unit/run-unit-turn.ts).
- Model output needs a contract before it can drive product behavior. Model selection goes through one router, and structured calls share one invocation path. See [model-router.ts](packages/api/src/domain/training/engine/model-router.ts) and [invoke-structured-model.ts](packages/api/src/domain/training/engine/invoke-structured-model.ts).
- Product decisions and database queries need separate ownership. Routers and streaming entrypoints wire domain workflows to repositories. The [architecture decision](documentation/architecture/0001-api-domain-boundaries.md) explains this boundary. [Contract tests](packages/api/src/domain/training/education-unit/run-unit-turn.contract.test.ts) exercise training transitions with controlled agent responses.

## Current implementation and limitations

The main Next.js app implements account login, goal onboarding, curriculum generation, a training workspace, learn and exam rounds, feedback, recall, chat history, and profile customization. The source links above show the core implementation; they are not evidence that every live model response is reliable.

Breakpoint is an experimental project. Faster learning and expert-level performance are goals, not demonstrated research results. AI explanations and grading can be wrong, latency varies by provider, and live training requires paid model access and a configured database.

The Expo and TanStack Start apps are starter surfaces, not complete Breakpoint clients. The `/ui/*` routes use sample data. Some tests require a real database and skip in CI, so a green CI run does not establish that the full learning flow works against a deployed database.

## Code map

The Next.js app currently includes the main Breakpoint training experience:

```text
apps/nextjs/src
├─ app
│  ├─ onboarding
│  ├─ curriculum
│  ├─ workspace
│  ├─ train/[unitId]
│  ├─ profile
│  ├─ settings
│  └─ ui
├─ features
│  ├─ auth
│  ├─ courses
│  ├─ marketing
│  ├─ settings
│  └─ training
└─ trpc
```

The backend domain is organized around the same product model:

```text
packages/api/src
├─ domain
│  ├─ memory
│  ├─ performance
│  ├─ profile
│  └─ training
├─ repositories
└─ router
```

The database schema is split by product domain under `packages/db/src/schema`. Training modules cover onboarding, profiles, curriculum, units, recall, ratings, and missions.

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

## Getting started

Use Node.js 22.21 or a newer Node.js 22 release and pnpm 11.2.2. Run these commands from the repository root. The instructions below start the Next.js app locally with Supabase PostgreSQL.

Install dependencies:

```bash
pnpm i
```

Create local environment variables:

```bash
cp .env.example .env
```

Fill in `.env` before continuing:

- `POSTGRES_URL`: your Supabase transaction-pooler connection on port 6543. Replace the project, region, and password placeholders with values from your project's connection settings. The database client requires SSL.
- `AUTH_SECRET`: generate a secret with `openssl rand -base64 32`.
- `AUTH_DISCORD_ID` and `AUTH_DISCORD_SECRET`: your Discord application's OAuth2 credentials. Register `http://localhost:3000/api/auth/callback/discord` as a redirect URI. Both credentials are required by the current configuration, even for email/password login.
- `OPENROUTER_API_KEY`: an API key with credit and access to `z-ai/glm-5.2`, the default model. Default background AI calls also use OpenRouter. Provider usage incurs charges.

Keep `ALLOWED_ORIGINS=http://localhost:3000` for local development. Add `OPENAI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` if you want to select those providers' models. Mission proof image uploads require `UPLOADTHING_TOKEN`; text-only use does not. Search is enabled for workflows that use it and can add provider charges. Set `AI_DISABLE_SEARCH_TOOLS=true` to disable it.

Push the committed schema to a new development database:

```bash
pnpm db:push
```

The push command currently derives its connection from `POSTGRES_URL` by replacing port 6543 with 5432. It uses `DIRECT_DATABASE_URL` only when `POSTGRES_URL` is absent. Ensure your Supabase session pooler accepts that connection. Review any schema changes before applying them to an existing database.

The Better Auth schema is already committed. Run `pnpm auth:generate` only when changing the auth configuration.

Run the Next.js app:

```bash
pnpm dev:next
```

Open `http://localhost:3000`, create an account, and start onboarding. If startup reports missing auth variables, check the required credentials above. If an AI turn reports a missing provider key, set the key for the selected model; the default needs OpenRouter.

Useful validation commands:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format
```

Some repository tests use a real database and load `POSTGRES_URL` from the root `.env`. Use a disposable development database for those tests. CI runs tests before creating `.env`, so database-dependent tests skip there. Builds fetch Google Fonts and require network access.

## Workspace layout

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

## Product principles

- Start from the learner's goal and intended use, not a generic topic catalog.
- Build curriculum from expert jobs, workflows, judgment, and failure modes.
- Keep learning units realistic and compressed; do not turn them into tiny disconnected concept slices.
- Let AI scaffold artifacts and carry boilerplate while the learner makes the important decisions.
- Measure improvement through evidence of better judgment, diagnosis, and transfer.

## Key documentation

- [AGENTS.md](AGENTS.md) defines project-specific agent behavior.
- [Project goal](documentation/project-goal.md) states the product thesis.
- [Backend requirements](documentation/backend-rq.md) describe backend responsibilities.
- [UI flow requirements](documentation/ui-flow-rq.md) describe the intended user journey.
- [Engineering protocol](documentation/breakpoint-engineering-protocol.md) defines engineering standards for product work.

## Notes for contributors

Prefer feature-local code in the Next.js app and domain-local workflows in `packages/api`. Keep prompts, rubrics, scoring policies, and curriculum logic treated as product logic, not throwaway strings. When documentation and code disagree, verify the code first, then update the docs or file a clear implementation gap.

Open bugs, questions, and feature requests in this repository's [issue tracker](https://github.com/Siffrico/Breakpoint/issues).

## License

Breakpoint is available under the [MIT license](LICENSE). Copyright notices cover Julius Marminge's starter and Safin Ahmed's contributions.
