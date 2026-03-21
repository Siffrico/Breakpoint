# Project Goal: Identity-Driven Becoming Engine

## Product Thesis

This product is not a course platform.

It is an identity-driven becoming engine: the user says who they want to become, Forge-like onboarding turns that into an identity model, and the system builds training backward from that target.

The core promise is not "learn more."

The core promise is: train until your behavior under pressure looks more like your target self than your starting self.

## Core Loop

The product runs on one loop:

1. Learn one unit
2. Apply it in a scenario
3. Receive a precise debrief
4. Repeat
5. Every 5 units, run a deep simulation that interleaves everything learned so far

Everything else exists to strengthen that loop.

## System Shape

### 1. Identity Modeling

The first user experience is an AI interview.

The system learns:

- who the user wants to become
- what kind of operator that identity is
- what situations they need to perform inside
- what skills and traits define that identity
- where the user is now
- where they have failed before
- what constraints or strengths already exist

This produces an identity model that can evolve over time. The user must be able to edit or refine this model later from their profile.

### 2. Curriculum Architecture

The AI reverse-engineers the skills, concepts, and pressure patterns required for the target identity.

It then builds a curriculum architecture:

- dependency-ordered
- personalized to current state
- adjustable as performance changes
- explicit enough for the user to understand the path forward

This architecture can be AI-generated. It does not need to be manually authored first.

### 3. Unit Engine

Each unit teaches one concept cleanly.

The required structure is:

- concept
- worked example
- retrieval check
- scenario
- debrief

The unit should be dense, direct, and built around how to think.

### 4. Simulation Engine

Every 5 units, the user gets a deep simulation.

This is where multiple concepts and traits must work together under pressure. The simulation should feel adversarial, realistic, and difficult from line one.

### 5. Debrief Engine

This is the core differentiator.

The system must show:

- what the user did
- what the target self would have done
- where they diverged
- what concept, trait, or judgment pattern broke
- what should happen next

If the debrief feels generic, the product fails.

### 6. Mentor Layer

The mentor is diagnostic, not motivational.

It uses identity model, unit history, simulation history, and repeated failure patterns to decide:

- what to work on next
- whether the path should change
- what the user's real bottlenecks are

## Product Principles

- Start from identity, not content.
- Convert vague traits into observable behaviors.
- Train under pressure, not only in clarity.
- Make the gap visible.
- Route remediation precisely.
- Keep the curriculum adaptive.
- Let the user evolve their target self over time.

## Observable Behaviors Over Vague Traits

The system should not stay at the level of labels like "resilient" or "strategic."

It must resolve them into behaviors that can be trained and evaluated, such as:

- contains blast radius before optimizing
- asks a decisive clarifying question before acting
- communicates tradeoffs clearly under conflict
- verifies before declaring success
- stays coherent under incomplete information

## AI Strategy

AI is not just grading output.

It is responsible for:

- conducting onboarding interview
- generating curriculum architecture
- generating or refining units for progression stages
- running dynamic scenarios
- producing debriefs
- updating mentor recommendations

An internal `education-unit-builder` agent can be used to generate personalized units from the curriculum architecture, user history, and identity model.

Quality should come from:

- strong prompt architecture
- memory of the user's history and gaps
- explicit tool use
- robust evaluation structure
- model choice where it matters

Model quality matters, but the system design matters more.

## V1 Scope

V1 should prove the engine, not the entire vision.

Focus on:

- one primary domain
- AI onboarding interview
- editable identity/profile page
- AI-generated curriculum architecture
- unit loop
- deep simulation every 5 units
- strong debrief
- mentor recommendations based on actual attempts

## Out of Scope for Now

- generic course marketplace behavior
- broad multi-domain expansion before one domain works
- proof/profile features as the main wedge
- heavy "success layer" real-world action prompts
- motivational coaching masquerading as diagnosis

## Success Condition

The product is working when a user can point to evidence that:

- the system understands the operator they are trying to become
- the path feels personalized and logically ordered
- scenarios feel relevant and hard in the right way
- debriefs expose real gaps instead of generic advice
- simulations reveal genuine integration progress
- the mentor changes the path based on real performance

That is the goal.
