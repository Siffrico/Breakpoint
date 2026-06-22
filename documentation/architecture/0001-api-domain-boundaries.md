# 0001. Keep API domain code persistence-agnostic

## Status

Accepted

## Context

The API package is organized around thin tRPC/streaming edges, domain workflows
and orchestration, and repositories for persistence. That shape is valuable only
if the direction stays consistent:

1. Edges authorize, validate, translate transport errors, and wire dependencies.
2. Domain code owns product behavior, decisions, policies, prompts, and workflow
   sequencing.
3. Repositories own database tables, query shape, transactions, and schema
   mapping.

Without an executable rule, domain modules can slowly import repositories or
database clients directly. That makes behavior harder to test, forces domain
code to know about storage concerns, and turns later persistence changes into
cross-cutting edits.

## Decision

Domain modules under `packages/api/src/domain/**` must not import `@acme/db` or
`packages/api/src/repositories/**` directly.

When a domain workflow needs persisted state, the domain module defines the
small dependency interface it needs. API edges or repository-side adapters satisfy
that interface with concrete repository calls.

This is enforced by the API ESLint config.

## Consequences

- Domain behavior can be unit-tested with plain dependency fakes.
- Persistence changes are localized to repositories and adapters.
- Routers and streaming entrypoints remain responsible for dependency wiring.
- New domain features need a little more upfront interface design, but the
  interface documents the actual behavior dependency instead of exposing the
  whole database or repository object.
