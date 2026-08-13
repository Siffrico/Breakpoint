# Aug 12th Test Errors

## Fixed and verified in this run

### E-01 — Opening mentor lesson renders as an unstructured wall of text

- Observed: Unit 2 opening lesson streamed as one dense paragraph despite prompt-only formatting instructions.
- Root cause: organization is encoded in prose instructions inside `assistantMessage`, so the model—not the product—owns layout.
- Fix direction: collect typed teaching fields and render the learner-facing Markdown deterministically on the server.
- Verified: the browser shows Heuristic, Worked example, Read, Predict, Compare, Decide, and Check as separate semantic sections, including after persistence and reload.

### E-02 — Opening mentor turn takes 22–56 seconds or fails after usable text appears

- Observed: valid learner-facing text appeared, but the request continued and later failed; one 200-word answer triggered a full schema-repair call because the boundary check rejected it.
- Root cause: the site keeps the critical path open for private structured fields and retries the whole generation for presentation-contract failures.
- Fix direction: eliminate brittle markdown/word-boundary repairs, measure model generation separately from persistence, and avoid repeating a completed learner-facing generation.
- Verified: after removing server pacing, a warm handoff showed feedback in 2.1 seconds and completed its full private scenario in about 8.5 seconds. Grading feedback appeared in 6.5 seconds. Local development compilation still adds cold-request noise and is not counted as production latency.

### E-03 — Failed automatic opening turn collapses to a blank lesson

- Observed: after a mentor error, speculative text/status disappeared and the composer remained with no prompt or retry affordance.
- Root cause: automatic `start_unit` has no user message receipt for the existing failed-send recovery path; opening failure cleanup also ran before authoritative finish-state classification.
- Fix direction: retain an inline opening failure with a one-click idempotent retry and remove uncommitted speculative text.
- Verified: a later opening failure retained “The mentor couldn't open this lesson. Nothing was lost.” and a working “Try again” action; speculative text was removed.

### E-05 — Valid scenario is discarded when the model appends trailing text

- Observed: the mentor produced a complete Lascaux scenario object, then the turn failed with `Unexpected non-whitespace character after JSON at position 2572`.
- Root cause: the shared structured-output boundary passes the entire response to the JSON parser, so harmless text after one complete root object invalidates otherwise schema-valid output.
- Fix direction: isolate the first complete JSON object during both partial and complete parsing, then retain the existing Zod validation.
- Verified: five parser cases cover prefixes, code fences, nested objects, braces inside strings, trailing text, incomplete partial objects, and unchanged invalid output. The browser retry reached the transaction instead of regenerating the scenario.

### E-06 — The server deliberately delays every structured-output word

- Observed: the learner-facing acknowledgement appeared, but the request remained open while the private scenario object streamed.
- Root cause: the unit agent enables `smoothStream({ delayInMs: 15, chunking: "word" })` for the entire structured response, including fields never rendered to the learner.
- Fix direction: remove server-side pacing; the client already batches visual updates and should receive parseable partials as soon as they exist.
- Verified: the warm trace measured 2.1 seconds to feedback and about 8.5 seconds to the complete scenario. No model selection or model setting changed.

### E-07 — Completed handoff fails during `commitEducationTurn`

- Observed: on a warm retry, feedback began in 2.1 seconds and the scenario finished generating in about 8.5 seconds, but the request ended with a typed `DbError` for `commitEducationTurn`.
- Root cause: `stampSolvePresentation` interpolates a JavaScript `Date` into a raw SQL fragment without the timestamp column encoder, so the Postgres driver rejects the parameter before the transaction can commit.
- Fix direction: bind the date through Drizzle's timestamp column encoder inside the existing idempotent `coalesce` expression.
- Verified: the same preserved learner answer committed successfully; a fresh localhost tab reloaded the durable feedback and Bi Sheng scenario.

### E-09 — Complete structured opening is rejected only for word count

- Observed: the next unit generated every typed teaching section and a valid one-question check, then discarded it because the complete lesson exceeded 240 words.
- Root cause: a hard presentation-length refinement turns a soft concision preference into a full generation failure and repair.
- Fix: retain per-field size bounds, exact structured sections, and the 120–180 word prompt target, but remove the brittle aggregate word-count rejection.
- Verified: retry persisted the full Heuristic, Worked example, Read, Predict, Compare, Decide, and Check structure instead of failing over aggregate length.

## Fixed earlier in the run

### E-04 — Invalid persisted Unit 2 scaffold

- Observed: raw HTML, a revealed coral worked-example answer, and unrelated garden-city options were persisted together.
- Root cause: the unit task builder received the mentor-only worked-example directive, and readiness validation did not reject HTML or exposed answers.
- Fix: separated task/mentor context, added readiness invariants, and force-refreshed through the existing build lifecycle.
- Verified: rebuild completed in about 3 seconds and invalid content is no longer learner-visible.

### E-08 — Old preview tab leaves the workspace Suspense shell visible

- Observed: one localhost reload delivered the full ready workspace and scenario in the server payload, but left the resolved workspace hidden.
- Root cause: the old collaborative preview tab stopped executing `requestAnimationFrame`; Next's streamed-boundary reveal remained queued. A clean tab executed animation frames normally.
- Action: no product change. A fresh localhost tab rendered the durable Bi Sheng scenario interactively.
