---
id: education-system-v4
title: Education System V4 — Three Modular Unit Systems
status: open
labels: [wayfinder:map]
assignee:
---

## Destination

A decision-complete mental model and minimal refactor plan for replacing V3's generalized education unit with modular Knowledge, Skillset, and Integration systems, and for generating curricula from topic → abilities → jobs → generalized skills → first principles → scenarios.

## Notes

- Domain: Breakpoint's chat-first curriculum and education-unit runtime.
- Read `documentation/education-system-V3.md` and the closest implementation path before resolving a ticket.
- Use `/grilling` one question at a time for HITL decisions. Domain-modeling is preferred if it becomes available.
- This map plans the V4 specification and refactor route; it does not implement V4.
- Knowledge rapidly teaches a coherent subtopic's rules, vocabulary, objects, representations, mechanics, and mental models through active reasoning and native-format quizzes. A Knowledge Batch is a mastery target; one unit usually lands it, with further units targeting remaining gaps. Mastery requires a 90+ mixed check with no required item uncovered. Knowledge uses coverage, decay, and recall, not Goldilocks.
- Skillset trains 1–2 first principles through two scenario passes. Each pass uses Connect → Solve → expert comparison → reasoning-gap diagnosis → revisions. Pass two targets the diagnosed gaps; its final 90+ score determines mastery. Failures shape the next challenge rather than count against mastery.
- Integration presents whole, messy, unlabeled problems with minimal support. It combines skills and principles and owns ability-level Goldilocks.
- Progress skill by skill: Knowledge Batches → Skillset units; after all generalized skills, open Integration. Later units may interleave mastered skills; not-yet-taught skills are scaffolded and not assessed.
- Each unit system owns its schemas, state machine, context policy, agents, evaluation, evidence, and Effect v4 workflows. Only infrastructure is shared. Plugins are developer-authored code modules selected exhaustively by unit kind, not runtime-configurable definitions.
- Shared context services load facts; each unit system selects, budgets, validates, and renders phase-specific context.
- The project is pre-launch: the final route should delete the superseded V3 path rather than add compatibility shims.
- Local tracker operations are defined in `tracker.md`.

## Decisions so far

## Not yet specified

- The exact internal phases, events, evidence records, and prompt/agent boundaries inside each unit system will sharpen as their workflow tickets resolve.
- The final database shape and migration sequence depend on the curriculum, progression, and modular runtime contracts.
- The learner-facing presentation of three unit systems may require distinct status and receipt semantics; the necessary differences are not yet clear.

## Out of scope

- Implementing the V4 refactor.
- A UI or database for changing unit workflows without a code deployment.
- Redesigning onboarding, field missions, or unrelated workspace features unless a resolved V4 contract requires a narrow compatibility decision.

