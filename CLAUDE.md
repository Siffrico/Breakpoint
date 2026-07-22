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

## How to Work

**Only do what was asked.** If it wasn't specified, it isn't in scope — no unrequested refactors, abstractions, files, tests, or "while I'm here" fixes. Report adjacent problems instead of fixing them. A "don't do X" holds for the rest of the session; never work around it.

**Ask instead of assuming.** Ambiguity — unclear data shape, two valid readings, undefined edge case — means one direct question before any work, not a guess you proceed on. Before starting, state the interpretation you're acting on in one line. When done, say what changed and what you deliberately left out.

**Understand the intent.** Before designing, state in one sentence what the user is actually trying to achieve and what must hold true for it to work. Build for that, not for the literal wording.

**Break it before building it (backend).** List how the design fails — concurrent writes, retries and double submits, timeouts, rate limits, malformed provider responses, missing or stale rows, unapplied migrations — then reshape the design so those states can't exist. Structural fixes, not `try/catch` sprinkled everywhere.

**Don't overengineer.** Simplest thing that satisfies the request. No registry/factory/config layer for a hypothetical second caller, no new file when an existing one is the right home, no generic solution when the concrete one was asked for. Fewer moving parts wins.

## Plan Format

**ASCII mockups first** — UI change? Lead with ASCII art of the layout. Nothing before it.

**One bullet per step, blank line between every bullet** — 1-2 sentences each, every step listed, nothing hand-waved. Never a wall of text; each step breathes.

**Name the files** — every bullet names the file(s) created or modified.

**Three pillars** — Modularity (name the seam, only where this request needs one). Error handling (for each external call: what fails, what catches it, what the user sees — typed tRPC/custom errors, not catch-alls). Latency (justify each round-trip; stream, parallelize, fire-and-forget non-blocking writes).

**No fluff** — no preamble, no restating the request, no options you won't pursue. ASCII, then bullets.
