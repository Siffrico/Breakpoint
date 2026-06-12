# AGENTS.md

This file defines project-specific guidance for agents working on Breakpoint.

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
