# Effect Migration Plan

## Decision

Adopt Effect incrementally in the API package, beginning with the workspace-turn persistence path. Keep tRPC as the transport boundary, Drizzle as the database layer, and the AI SDK for model calls. Do not perform a repository-wide rewrite.

The migration has two goals:

1. Make expected failures and infrastructure requirements explicit in types.
2. Replace repeated dependency plumbing with domain-owned Effect services and edge-composed live layers.

The current workspace-turn adapter is the best first slice: `workspace-turn-repository-deps.ts` is approximately 540 lines and wires many database-bound closures into orchestration workflows.

## Corrections to the Initial Proposal

### Database scope

Do not capture the singleton database client in one startup `ManagedRuntime` and assume transactions can override it later. Transactional work requires a layer built from the transaction client for that operation. Otherwise repository services can accidentally execute against the root client and escape the transaction.

Use these scopes:

- Request/query: compose repository layers with the request's root `Db` client.
- Transaction: compose the same repository layers with the transaction client.
- Pure tests: provide test repository services directly; no `Db` service should remain in workflow requirements.

Repository implementations may require `Db` while being constructed, but their public methods should normally return effects with no remaining `Db` requirement:

```ts
// Domain contract
getActivePlan: (sessionId: string) =>
  Effect.Effect<Option.Option<CurriculumPlan>, DbError>;

// Live adapter
const CurriculumRepoLive: Layer.Layer<CurriculumRepo, never, Db>;
```

This keeps persistence out of domain workflow requirements and prevents callers from needing both `CurriculumRepo` and `Db`.

### Not-found semantics

Use `Option` only when absence is an ordinary outcome. Use a tagged error when the workflow requires the record to exist.

- Lookup/search: `Effect<Option<Row>, DbError>`
- Required entity: `Effect<Row, DbError | CurriculumNotFoundError>`

Do not mechanically replace every `null` with `Option`.

### Retry classification

Do not retry every `DbError`. The current `DbError` wraps an unknown cause, so it cannot safely distinguish transient failures from constraints, invalid queries, or permanent connection configuration errors.

Introduce a classified database error before enabling retries:

```ts
type DbFailureKind =
  | "serialization"
  | "deadlock"
  | "connection"
  | "timeout"
  | "constraint"
  | "query"
  | "unknown";
```

Preserve the PostgreSQL SQLSTATE and original cause for logs. Only retry explicitly transient kinds.

### Interruption and leases

`Effect.ensuring` and `Effect.acquireRelease` only react to interruption if request cancellation is connected to the Effect fiber. `Effect.runPromise` alone does not guarantee that a tRPC/client disconnect interrupts the running workflow.

Before relying on finalizers for lease safety:

1. Pass the request `AbortSignal` into the Effect runtime boundary.
2. Prove with a test that aborting the request interrupts the fiber.
3. Make the lease finalizer idempotent and ownership-checked by `leaseId`.
4. Preserve the distinction between completed and failed turns; an unconditional release must not overwrite completion state.

## Target Architecture

```text
tRPC / streaming edge
  authenticate + authorize + validate
  compose request or transaction layers
  run Effect and translate tagged failures
          |
domain workflow
  requires domain-owned repository services
  contains orchestration and business decisions
          |
repository service contract (owned by domain)
  typed success and failure channels
          |
live adapter (repositories/)
  Drizzle queries + database error classification
```

Rules:

- Domain code must not import `@acme/db` or `repositories/**`.
- Domain modules own repository service contracts and domain errors.
- `repositories/**` owns live Drizzle layers and row-to-domain mapping.
- Only edges execute effects with `runPromise`, `runPromiseExit`, or a runtime.
- Transport errors such as `TRPCError` must not enter domain code.
- Expected failures use tagged errors, not message strings.
- Defects remain defects; do not convert arbitrary exceptions into retryable typed failures.

## Phase 0: Lock the Conventions

Before migrating workspace turns:

1. Document the service/layer/error layout in the API architecture decision record.
2. Add lint restrictions:
   - no database or repository imports from `domain/**`;
   - no Effect runners inside domain and repository modules;
   - no `Effect<any, ...>` or expected `Error`/`unknown` failure channels;
   - no transport errors in domain modules.
3. Add shared test helpers for providing service implementations and inspecting exits.
4. Pin the exact Effect v4 beta version until v4 is stable, and treat upgrades as explicit migrations.

Exit gate: the current profile Effect slice and all API tests remain green.

## Phase 1: Typed Database Boundary

Extend the existing `Db` adapter rather than migrating repositories immediately.

1. Define `DbError` with failure kind, SQLSTATE when present, operation name, safe public message, and retained cause.
2. Centralize Drizzle promise lifting in one helper.
3. Add tests for classification of serialization (`40001`), deadlock (`40P01`), connection, constraint, and unknown failures.
4. Add structured logging at the transport boundary before returning a safe public error.

Exit gate: no retry exists yet; classification tests prove which failures would be eligible.

## Phase 2: Workspace Repository Services

Create domain-owned capabilities based on workflow needs, not one service per database table. Start with the smallest set that covers one vertical turn path, for example:

- `WorkspaceTurnRepo`
- `CurriculumRepo`
- `OnboardingRepo`
- `RatingRepo`
- `UnitRunRepo`

For each service:

1. Move only the interface/tag into the relevant domain module.
2. Implement its live layer in `repositories/**`.
3. Capture `Db` while constructing the live layer so service methods have no `Db` requirement.
4. Represent optional reads with `Option` and required reads with domain-specific tagged errors.
5. Add contract tests for live adapters and unit tests using provided test services.

Do not migrate all repository methods up front. Migrate only methods used by the selected workspace-turn path.

Exit gate: one workspace-turn workflow runs with test services and has no database requirement in its final `R` channel.

## Phase 3: Replace the Dependency Factory Incrementally

Do not delete `createWorkspaceTurnRepositoryDeps` in one step. It currently serves tRPC, workspace chat, and unit-coach entry points and also contains transaction and lease behavior.

1. Convert one orchestration branch, preferably `commitNextScenarioPrompt`.
2. Replace its closure dependencies with domain services yielded inside `Effect.gen`.
3. Compose its live layers at each existing edge.
4. Keep a compatibility adapter for unmigrated branches.
5. Repeat for education-turn and recall-turn commits.
6. Delete factory entries as their final consumer migrates.
7. Delete the factory only after `rg createWorkspaceTurnRepositoryDeps` finds no consumers.

Exit gate: tRPC, `workspace-chat.ts`, and `unit-coach.ts` all use the new composition path, and existing workflow behavior tests still pass.

## Phase 4: Transaction Effects

Create a transaction combinator that replaces `Db` with the transaction client for the entire nested effect:

```ts
const transaction = <A, E, R>(effect: Effect.Effect<A, E, R | Db>) =>
  // open Drizzle transaction, construct transaction-scoped Db layer,
  // run the nested effect, and propagate typed failure to roll back
```

Requirements:

- No `tx as unknown as Database` outside the database adapter.
- Every nested repository service must be constructed from the transaction layer.
- A failure in the second or third write must roll back earlier writes.
- Defects and interruption must also roll back.
- Transaction retry, when added, wraps the whole transaction—not individual writes.

Required integration tests:

- successful commit persists every write;
- failure after the first write persists none;
- failure after the second write persists none;
- transaction-scoped repositories never call the root client;
- competing lease owners cannot commit.

Exit gate: the three workspace commit paths contain no transaction-client threading or unsafe casts.

## Phase 5: Lease Lifecycle and Cancellation

Model lease ownership with tagged errors such as `LeaseMissing`, `LeaseLost`, and `LeaseConflict`.

1. Make acquire/renew/complete/fail operations compare the current `leaseId` atomically.
2. Wrap the owned lease lifetime with an interruption-safe finalizer.
3. Wire request abort signals to Effect interruption for tRPC and streaming endpoints.
4. Make cleanup idempotent so it is safe after partial failure.
5. Add interruption tests and a stale-lease recovery test.

Exit gate: aborting a request cannot leave a processing lease indefinitely, and cleanup cannot release another worker's lease.

## Phase 6: Selective Retry Policy

Define reusable schedules only after database error classification and transaction tests exist.

Policy:

- Retry serialization, deadlock, selected connection resets, and explicit timeouts.
- Never retry not-found, validation, authorization, constraints, lease conflicts, query defects, or unknown failures by default.
- Retry reads when safe.
- Retry writes only at an idempotent operation boundary or around the complete transaction.
- Use bounded exponential backoff with jitter and a total deadline.
- Record attempt count, error kind, operation, and final outcome.

Recommended initial limits:

- Maximum three retries after the initial attempt.
- Short base delay (for example 50 ms) with exponential growth and jitter.
- A transaction-level deadline appropriate to the request SLA.

Required tests:

- transient failures retry and eventually succeed;
- permanent failures execute once;
- not-found executes once;
- exhausted retries return the original typed failure;
- a retried transaction does not duplicate messages, attempts, ratings, or turn completion.

## Phase 7: Error Translation

Replace `getErrorCode` and message matching only after the corresponding workflows expose complete tagged error unions.

1. Define domain errors close to the domain service/workflow that owns them.
2. Translate errors once at each transport boundary with `catchTags` or an equivalent exhaustive mapper.
3. Log infrastructure details server-side while returning stable public messages.
4. Add compile-time or test coverage for every error tag.

Exit gate: no router status depends on `error.message.includes(...)`.

## Phase 8: Retire `Result` Carefully

Do not delete `lib/result.ts` after migrating only `getHomeStateWorkflow`; it has consumers in memory, training workflows, and project orchestration.

For each consumer:

1. Decide whether the current error represents an expected domain failure, optional state, or a transport response.
2. Convert expected failures to tagged errors and ordinary absence to `Option` where useful.
3. Update all callers and tests in the same slice.
4. Delete `Result`, `ok`, and `err` only after repository-wide search shows no consumers.

## Verification for Every Slice

Every migration pull request must pass:

- API typecheck, lint, formatting, and complete tests.
- Existing behavior tests unchanged unless the contract intentionally changes.
- Tests for success, not-found/absence, database failure, authorization, and transaction rollback where applicable.
- A test proving the workflow runs with test services and no live database.
- A dependency scan proving domain modules do not import repositories or Drizzle.
- No new blanket retry or message-based error classification.

## Rollout Order

1. Database error classification.
2. `commitNextScenarioPrompt` vertical slice.
3. `commitEducationTurn`.
4. Recall-turn commit.
5. Remaining workspace reads and writes.
6. Delete `createWorkspaceTurnRepositoryDeps` after all three entry points migrate.
7. Wire cancellation and lease finalizers.
8. Enable transaction-level retries.
9. Migrate message-based transport error mapping.
10. Migrate remaining `Result` consumers domain by domain.

## Non-Goals

- Rewriting pure functions as Effects.
- Moving AI SDK calls merely for uniformity.
- Retrying every database failure.
- Creating one service for every table.
- Migrating every repository in one pull request.
- Treating Effect as a substitute for database constraints, idempotency keys, authorization, or integration tests.

## Completion Criteria

The migration is complete when:

- workspace workflows expose typed domain/infrastructure failures;
- domain workflows depend only on domain-owned capabilities;
- request and transaction database clients are scoped correctly;
- the workspace dependency factory and unsafe transaction casts are gone;
- leases are safe under failure and verified interruption;
- retries are selective, bounded, observable, and transaction-safe;
- transport error mapping is tag-based rather than message-based;
- `lib/result.ts` has no remaining consumers and is deleted;
- all critical workflows have failure and rollback coverage.
