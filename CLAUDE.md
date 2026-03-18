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

This is a **T3 Turbo** monorepo with the following layers:

### Apps
- `apps/nextjs` — Next.js 15 web app (React Server Components + tRPC client)
- `apps/expo` — React Native app (Expo SDK 54)
- `apps/tanstack-start` — TanStack Start alternative web app

### Packages
- `packages/api` — tRPC v11 router. Contains `publicProcedure` and `protectedProcedure`. The root router (`src/root.ts`) merges all sub-routers.
- `packages/auth` — Better Auth v1 configuration. Auth schema is auto-generated; run `pnpm auth:generate` after config changes.
- `packages/db` — Drizzle ORM + Supabase/PostgreSQL. Schema lives in `src/schema.ts`. Edge-runtime compatible via Vercel Postgres driver.
- `packages/ui` — Shared shadcn/ui component library with Tailwind CSS v4.
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

- `apps/nextjs/src/app/domains/` — Domain-specific route groups
- `apps/nextjs/src/features/` — Feature-level UI components
- `apps/nextjs/src/app/layout.tsx` — Root layout with tRPC + auth providers

## Environment Variables

Copy `.env.example` to `.env` and populate:
- `POSTGRES_URL` — Supabase PostgreSQL connection string
- `AUTH_SECRET` — Generate with `openssl rand -base64 32`
- `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET` — Discord OAuth credentials
