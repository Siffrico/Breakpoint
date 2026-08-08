# Backend Design Principles

Design backend systems to maximize:

**Speed, reliability, efficiency, and simplicity.**

## Core Principles

### 1. Ambitious Product, Simple Architecture

Prefer ambitious product behavior, but implement it with the simplest architecture that can reliably support it.

Complexity must justify itself.

### 2. Design Around Failure

Design features around the errors and edge cases that can occur, not only the happy path.

Consider timeouts, retries, duplication, crashes, races, stale state, partial completion, and dependency failure.

Prefer designs where invalid or dangerous states are difficult to reach.

### 3. Avoid Unnecessary Work

Do not recompute, refetch, revalidate, serialize, allocate, or call external systems when the work can safely be avoided.

Prefer efficient operations whenever they provide the same correctness at no meaningful cost in complexity.

### 4. Optimize the Critical Path

Keep user-facing operations fast.

Remove unnecessary sequential work, parallelize independent operations, reuse existing results, and keep network and database round trips minimal.

### 5. Bound Expensive Behavior

Concurrency, retries, queues, fan-out, memory, and execution time should have explicit limits.

Avoid unbounded work.

### 6. Make Recovery Safe

Retries and resumability should not create duplicate effects or corrupt state.

Prefer idempotent operations, durable state when needed, bounded retries, and recovery from the last valid point.

### 7. Keep Failures Local

Failures should have the smallest possible blast radius.

A slow or broken dependency should not unnecessarily degrade unrelated parts of the system.

### 8. Organize Around Features

Prefer cohesive feature-level architecture over excessive horizontal layering.

Keep the business logic, state transitions, persistence, errors, and external interactions of a capability close together when practical.

### 9. Encode Invariants Once

Important rules should have one authoritative implementation.

Avoid duplicating validation, state transitions, authorization, or business rules across layers.

### 10. Make Effects Explicit

Errors, concurrency, retries, cancellation, and resource ownership should be explicit and easy to reason about.

Prefer Effect v4 where it materially improves these properties.

The framework is not the principle. Predictable behavior is.

## Default Decision Rule

When comparing two valid designs, prefer the one that:

1. does less work,
2. has fewer failure modes,
3. has a shorter critical path,
4. requires fewer moving parts,
5. makes correctness easier to reason about.

The preferred architecture is the simplest one that reliably supports the product requirement without sacrificing important performance or correctness properties. We use a DDD Architecture.