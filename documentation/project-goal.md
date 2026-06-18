# Project Goal: Breakpoint

## What Breakpoint Is

Breakpoint is a zero-friction AI learning product for helping a person become able to do something real. The learner starts with a goal, clarifies what they want to do with that learning, and trains through adaptive curriculum inside the product.

Breakpoint is not a topic picker, course catalog, or generic chatbot wrapper. It is a training system that turns a learner's desired outcome into compressed practice, diagnosis, repair, and evidence of progress.

## Core Product Question

How can a chat-first AI system use an adaptive curriculum to make a person perform beyond expert level in a domain, faster than normal apprenticeship?

This question should shape product decisions. The system should reduce low-value production work while preserving the hard thinking that builds expertise.

## Product Goals

1. Help the learner identify what they want to learn.
2. Help the learner define what they want to do with that learning.
3. Build a curriculum from expert jobs, workflows, knowledge, judgment, and failure modes.
4. Train the learner through short, realistic interactions that require expert decisions.
5. Measure whether the learner is actually improving.

## Product Shape

The broad learner journey is:

```text
goal discovery
└─ applied outcome
   └─ identity and context model
      └─ adaptive curriculum
         └─ daily training loop
            └─ evaluation, debrief, repair, and recalibration
```

The exact UI and pedagogy may change, but the learner should not be pushed out of Breakpoint to do large amounts of manual setup or artifact production. The product should feel like guided apprenticeship compressed into chat-first practice.

## Education Unit Standard

Education units should train real workflow judgment under realistic pressure. They should not become disconnected micro-lessons such as "graphs", "queues", or "caching" unless those ideas appear inside a meaningful workflow.

A strong unit asks the learner to:

- frame the situation
- choose a strategy
- explain tradeoffs
- diagnose what failed
- revise their reasoning
- transfer the lesson to a new case

The AI can generate examples, scaffold code or documents, maintain scenario state, summarize decisions, and evaluate responses. The learner should spend effort on the decisions and explanations that reveal competence.

## Curriculum Standard

Breakpoint curriculum should be generated from:

1. The learner's goal.
2. The expert jobs required to achieve that goal.
3. The workflows inside those jobs.
4. The knowledge, judgment, and failure modes required by those workflows.
5. The sequence of compressed practice needed to build expert-level performance.

The product should optimize for mastery, not content coverage. A unit succeeds when the learner can make better expert decisions and explain why.

## Measurement

Breakpoint must measure whether a learner is getting better. The metric may be domain-specific and may not match standard education, engagement, or completion metrics.

The system should preserve evidence such as:

- decisions made under uncertainty
- explanations of cause and tradeoff
- repeated failure patterns
- repair quality after feedback
- transfer to related but unfamiliar cases
- performance across integrated capstones or simulations

Do not prematurely lock the product to a single universal score. The measurement layer should stay flexible enough to discover the right evidence for each domain.

## Important Constraint

Do not hard-code product details that have not been explicitly accepted.

Avoid prematurely fixing:

- a rigid onboarding ideology
- a rigid curriculum structure
- a universal scoring model
- a social, ranking, hiring, or competition layer
- long manual project-building flows as the default learning unit

Those ideas may exist later, but they are not the core definition unless stated elsewhere.

## Canonical Framing

Breakpoint helps people clarify what they want to learn, define what they want to do with that learning, train through adaptive expert-workflow practice, and measure whether they are truly improving.
