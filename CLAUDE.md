# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Package Manager & Runtime

- **pnpm** (v10.19.0) with workspaces — always use `pnpm`, never `npm` or `yarn`
- Node.js `^22.21.0` required
- Monorepo managed by **Turborepo**

## Common Commands

```bash
pnpm dev              # Start all apps in watch mode
pnpm dev:next         # Start only the Next.js app
pnpm build            # Build all packages
pnpm typecheck        # TypeScript type checking across all packages
pnpm lint             # ESLint (cached)
pnpm lint:fix         # Auto-fix ESLint issues
pnpm format:fix       # Auto-fix Prettier formatting

pnpm db:push          # Push Drizzle schema to database
pnpm db:studio        # Open Drizzle Studio
pnpm auth:generate    # Regenerate Better Auth schema

pnpm ui-add           # Add shadcn/ui components to packages/ui
```

## Architecture Overview

This is a Breakpoint monorepo built on the T3 Turbo workspace structure, with the following layers:

### Apps
- `apps/nextjs` — Primary Breakpoint Next.js 16 web app (React Server Components + tRPC client)
- `apps/expo` — React Native starter surface (Expo SDK 54)
- `apps/tanstack-start` — TanStack Start starter surface

### Packages
- `packages/api` — tRPC v11 router. Contains `publicProcedure` and `protectedProcedure`. The root router (`src/root.ts`) merges all sub-routers.
- `packages/auth` — Better Auth v1 configuration. Auth schema is auto-generated; run `pnpm auth:generate` after config changes.
- `packages/db` — Drizzle ORM + Supabase/PostgreSQL. Schema modules live under `src/schema/` and are re-exported by `src/schema.ts`.
- `packages/ui` — Shared UI primitives with Tailwind CSS v4.
- `packages/validators` — Shared Zod v4 schemas used across API and apps.

### Tooling
Shared configs in `tooling/` for ESLint, Prettier, Tailwind, and TypeScript — these are referenced by all packages.

## Domain-Driven API Structure

The API package uses a layered DDD approach:
- `packages/api/src/domain/` — Business logic workflows
- `packages/api/src/repositories/` — Data access (wraps Drizzle queries)
- `packages/api/src/router/` — tRPC procedure definitions (thin layer calling domain)
- `packages/api/src/lib/` — Shared utilities

New features follow this pattern: add a router in `src/router/`, wire domain logic in `src/domain/`, and register in `src/root.ts`.

## Next.js App Structure

- `apps/nextjs/src/app/` — App Router pages for onboarding, curriculum, workspace, training, profile, auth, and UI previews
- `apps/nextjs/src/features/` — Feature-level UI components
- `apps/nextjs/src/app/layout.tsx` — Root layout with tRPC + auth providers

## Environment Variables

Copy `.env.example` to `.env` and populate:
- `POSTGRES_URL` — Supabase PostgreSQL connection string
- `AUTH_SECRET` — Generate with `openssl rand -base64 32`
- `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET` — Discord OAuth credentials

## Plan Format Requirements

When the user asks for a plan, follow this format strictly:

1. **ASCII mockups first** — If the change involves any UI, lead with ASCII art showing the layout/component structure before anything else.
2. **Detailed step-by-step bullet points** — Every single step must be listed. Each bullet is 1-2 sentences explaining what happens. A single bullet can inherently cover 1-2 tightly coupled sub-steps by design (e.g. "Create `foo.ts` and export the helper used by the next step"), so a 30-step change can be 10-15 bullets if all 30 steps are genuinely explained — but never hand-wave or skip.
3. **Files touched** — Each bullet must name the file(s) being created or modified.
4. **Three pillars check** — Every plan must explicitly address all three. If the current approach is missing any, do the research or reasoning needed to fix it before presenting the plan.
   - **Modularity**: Where are the seams? Each new piece should be independently testable, swappable, and importable without pulling in unrelated code. Name the abstractions (registry, factory, plugin map, etc.) and explain why they exist. If a file does two jobs, split it. If three files share logic, extract it.
   - **Error handling**: For every external call (DB, AI provider, third-party API, user input), state what can fail, how it's caught, and what the user sees. Timeouts, rate limits, malformed responses, network drops — all addressed. Errors should be typed (tRPC error codes, custom error classes) not generic catch-alls. Client-side: how does the UI surface errors (toast, inline, redirect)?
   - **Fast latency**: Justify every round-trip. Use streaming (SSE, `streamText`, React Suspense) instead of awaiting full responses. Fire-and-forget for non-blocking writes (analytics, persistence). Parallel calls where independent. Cache where idempotent. State the expected latency profile (e.g. "first token in <200ms, full response streams over 2-5s, DB write happens after stream closes").
5. **No fluff** — No preamble, no "here's what I'm thinking", no restating the request. Just the ASCII (if applicable) and the bullets.
6. **Spacing** — Put a blank line between every bullet point. Each step should breathe — no wall-of-text paragraphs.
