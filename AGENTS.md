# AGENTS.md

This file defines project-specific guidance for agents working on Breakpoint.

## Working Agreement

- Do not edit code or run mutating commands unless the user explicitly asks for implementation.
- Before proposing a solution, restate the intent, inspect the relevant existing flow, and ask about missing information that could change the design.
- Before implementation, propose the smallest plan and stress-test its failure modes, edge cases, data flow, and tests. Wait for approval unless the user explicitly asks to implement immediately.
- Do not add speculative abstractions, dependencies, configuration, refactors, or scope.
- Do not use or inspect a skill unless the user explicitly names it.
- Keep responses short, direct, and in plain language. State uncertainty instead of inventing requirements.

## Breakpoint Philosophy

Breakpoint is built inside one product: a zero-friction AI learning experience. Assume every learner-facing workflow happens in Breakpoint, primarily through a chat-first interface. Do not design flows that require the learner to leave the product, manually write huge artifacts, or spend long sessions producing thousands of lines of code just to advance.

The core product question is:

> How can a chat-first AI system use an adaptive curriculum to make a person perform beyond expert level in a domain, faster than normal apprenticeship?

This means the curriculum is not a conventional course outline and the education unit is not a small school lesson. Breakpoint starts from the learner's goal, identifies the real jobs experts perform, the workflows inside those jobs, and the knowledge required to execute those workflows. The system then trains the learner through high-leverage, low-friction interaction.

## Education Unit Constraints

Education units must not become tiny isolated concept slices. They should train expert workflow judgment under realistic pressure while staying fast enough for a chat product.

When designing education-unit behavior:

- Do not ask learners to manually build large production systems inside chat.
- Do not split expertise into disconnected micro-lessons such as "graphs", "queues", or "caching" unless they appear as needed inside a real workflow.
- Do not confuse artifact-chaining with manual artifact production. The AI may generate, scaffold, summarize, simulate, or maintain artifacts while the learner makes the important decisions.
- Keep friction low: the learner should think, decide, explain, diagnose, revise, and transfer, not perform busywork.
- The unit should compress expert practice into a short interaction without losing the structure of the real workflow.
- The AI should carry operational load where appropriate: setup, boilerplate, examples, scaffolds, code drafts, scenario state, evaluation, and artifact persistence.
- The learner should carry cognitive load where it matters: framing, tradeoffs, causal explanation, error diagnosis, strategy, judgment, and transfer.

## Curriculum Shape

A Breakpoint curriculum should be generated from:

1. The learner's goal.
2. The jobs experts actually perform to achieve that goal.
3. The workflows inside those jobs.
4. The knowledge, judgment, and failure modes required by those workflows.
5. The sequence of compressed practice needed to build expert-level performance.

The product should optimize for mastery, not content coverage. A unit succeeds when the learner can make better expert decisions and explain why, not when they have typed a large artifact.

## Practical Design Rule

For every proposed learning flow, ask:

> Is the learner doing the irreplaceable expert thinking, or are we making them do low-value production work?

If the task is low-value production work, the AI should scaffold or automate it. If the task reveals expert understanding, the learner should do it directly.

## Engineering

### Before writing any code

State in 2-3 sentences: the actual goal, the smallest change that achieves it, and which existing code you will reuse or extend. If the request fights the existing architecture, say so and propose the aligned version instead of implementing the misaligned one. You have standing permission to push back.

Read the closest existing feature end-to-end (router → domain → repository) before writing a new one. Imitate it; do not invent a parallel structure.

### Where code goes

- tRPC routers in `packages/api/src/router/` are thin: validate input, check ownership, call one domain workflow. See `packages/api/src/router/profile.ts`. Business logic never lives in a router.
- Business logic lives in `packages/api/src/domain/<area>/workflows/`. Data access lives in `packages/api/src/repositories/`. Register new routers in `src/root.ts`.
- Zod schemas shared between API and apps go in `packages/validators`, never duplicated inline.
- DB schema modules go in `packages/db/src/schema/` and are re-exported by `src/schema.ts`.

### Effect v4 (target style for new server slices)

This repo uses **Effect v4** (`effect@4.0.0-beta.x`), not v3. Your training data largely predates v4 — when an API you remember doesn't typecheck, the codebase and the installed package are right and your memory is wrong. Verify against existing usage in `packages/api/src/effect/` and the domain workflows before reaching for docs.

The profile slice is the reference implementation of the modernized path — mirror it for new fallible domain logic:

- Errors are tagged classes via `Data.TaggedError` with typed fields — see `packages/api/src/effect/errors.ts`. Never throw strings; never discriminate on message text, only on `_tag`.
- Workflows are `Effect.gen` functions that yield Context services — see `packages/api/src/domain/profile/workflows/get-general.ts` and `domain/profile/profile-repo.ts`.
- Effect errors are translated to `TRPCError` in exactly one edge module per slice via `Effect.catchTags` — see `packages/api/src/effect/profile-edge.ts`. Domain code never imports `TRPCError`.
- Legacy async/await code remains in the training domain. When editing it, match local style; when building a new slice, use the Effect pattern. Do not half-convert a file in passing.

### AI calls

- Never instantiate a provider inline. Every model call resolves through `packages/api/src/domain/training/engine/model-router.ts` (`requireAiModelForPurpose` with a declared purpose → tier).
- Structured output goes through `invokeStructuredModel` in `packages/api/src/domain/training/engine/invoke-structured-model.ts` — it is deliberately the only place `streamText` + `Output.object` is constructed. Do not build a second one; extend it.
- Learner-facing chat streams via `createUIMessageStream` with typed status data parts — see `packages/api/src/workspace-chat.ts`. Clients consume with `useChat`.
- Never await a full model completion while a learner is waiting on screen. Stream, and emit a status part so the UI can say what is happening.

### Latency

- Justify every awaited round-trip. Independent calls run in parallel (`Promise.all` / `Effect.all`); non-blocking writes (analytics, persistence after a stream closes) are fire-and-forget with error logging, not awaited.
- For any new learner-facing flow, state its expected latency profile in the PR/plan (e.g. "first token < 500ms, persistence after stream close").

### Error handling

- Every external call (DB, model provider, third-party) has a typed failure the caller can discriminate. No bare `catch (e) { console.log(e) }`, no catch-and-rethrow that adds nothing.
- Errors crossing to the client are mapped to specific tRPC codes with messages written for a learner, not a stack trace.

### Over-engineering bans

- No abstraction until the third concrete usage. Two similar blocks may stay similar.
- No interface/registry/factory with a single implementation. No config options, parameters, or feature flags nobody asked for.
- No backwards-compat shims or deprecated re-exports — this is pre-launch; delete the legacy path in the same change.
- No comments that narrate what the code does or why the change is correct. A comment states a constraint the code cannot show — see the header comment on `invokeStructuredModel` for the expected register.
- Exhaustive switches over unions with no `default`, so the compiler forces updates — see `getEducationTurnLabel` in `workspace-chat.ts`.

### Definition of done

A change is not done until `pnpm typecheck` and `pnpm lint` pass, `vitest run` passes in the touched package, and you have exercised the actual flow you changed. Tests are colocated `.test.ts` files next to the module; orchestration-level behavior gets a contract test (see `orchestrate-unit-turn.contract.test.ts`).

Always `pnpm`, never `npm`/`yarn`. Cross-package imports use `@acme/*` workspace aliases. Check existing dependencies before adding a new one.
