# Project Goal: Identity-Driven Mastery Platform

## Product Thesis

This product is not a course platform.

It is an identity-driven mastery platform: the user says who they want to become, Forge-like onboarding turns that into an identity model, and the system builds training backward from that target.

The core promise is not "learn more."

The core promise is: train until your behavior under pressure looks more like your target self than your starting self.

The product should not feel like isolated learning.

It should let people:

- train seriously
- get measurably better
- prove what they can do
- compete against others
- join groups and teams
- build reputation inside a skill domain
- give recruiters and managers credible ways to verify ability
- let trusted organizers create competitions and skill tests

The engine comes first, but the long-term product is an ecosystem:

- engine
- arena
- proof
- competition
- groups
- creation

## Core Loop

The product runs on one loop:

1. Learn one unit
2. Apply it in a scenario
3. Receive a precise debrief
4. Repeat
5. Every 5 units, run a deep simulation that interleaves everything learned so far

Everything else exists to strengthen that loop.

On top of the core loop, the platform should support adjacent loops:

- mastery loop: diagnostic -> scenario -> score -> debrief -> mastery update -> next best action
- status loop: challenge entry -> ranked result -> reputation gain -> stronger future opportunities
- group loop: teams identify weakness clusters -> assign training -> improve together -> compete together
- opportunity loop: verified proof of skill -> recruiter or manager trust -> real-world opportunity
- creator loop: trusted authors publish scenarios and competitions -> others participate -> the ecosystem deepens

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

### 7. Skill Graph and Mastery Layer

The platform needs a first-class model of capability, not just a sequence of units.

It must maintain:

- top-level skills
- subskills
- dependencies between subskills
- mastery estimates
- confidence levels
- pressure-tested vs untested states
- evidence attached to demonstrated capability

The user should be able to see not only what they completed, but what they can actually do.

### 8. Challenge and Ranking Layer

The platform should let users test themselves in competitive environments.

Challenges must:

- target explicit skills or subskills
- carry credibility weight based on difficulty and quality
- produce ranked results
- update public reputation carefully
- create return reasons beyond solo learning

Ranking should not be shallow points for activity.

It should be based on performance signal. The strongest candidates are:

- Elo or skill-rating style systems for direct or repeated competitive comparison
- currency-style score only when it is tied to scarce, meaningful clears and not raw engagement

Default principle:

- reputation should come from demonstrated performance
- rankings should reward hard wins, consistency, and pressure-tested clears
- activity alone should not inflate status

### 9. Group and Team Layer

The product should support users learning and competing inside groups, not only as individuals.

Groups should make it possible to:

- join teams, guilds, or company cohorts
- see shared strength and weakness clusters
- assign drills and challenges
- compare internal standings
- coordinate around competitions and goals
- build identity around shared improvement

Social interaction should exist to strengthen mastery and competition, not distract from them.

### 10. Proof and Verification Layer

The profile should become a proof surface, not a vanity page.

It should help:

- recruiters verify skill
- managers assess readiness
- peers recognize credibility
- organizers qualify participants for competitions

Verification should rely on:

- challenge performance
- pressure-tested clears
- evidence artifacts
- domain specialties
- recent growth
- trusted competition and creator standards

### 11. Competition Creation Layer

The platform should eventually allow trusted creators, recruiters, and organizations to create competitions and skill evaluations.

These competitions should be:

- scoped to real competencies
- rubric-driven
- difficulty-calibrated
- suitable for public, private, or sponsor-backed use
- strong enough to carry reputational value

## Product Principles

- Start from identity, not content.
- Convert vague traits into observable behaviors.
- Train under pressure, not only in clarity.
- Make the gap visible.
- Route remediation precisely.
- Keep the curriculum adaptive.
- Let the user evolve their target self over time.
- Make proof credible, not decorative.
- Make competition performance-based, not engagement-based.
- Make groups and social systems strengthen training quality.
- Treat public reputation as earned evidence, not self-assertion.

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
- skill graph and mastery state
- unit loop
- deep simulation every 5 units
- strong debrief
- mentor recommendations based on actual attempts
- private proof profile
- basic challenge mode with performance-based ranking

## Out of Scope for Now

- generic course marketplace behavior
- broad multi-domain expansion before one domain works
- fully open creator marketplace before quality controls exist
- large social graph mechanics that distract from mastery
- recruiter portal as the primary wedge before proof is strong
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
- the mastery graph reflects real strengths and weak points
- challenge outcomes feel credible and worth caring about
- groups help people improve and compete together
- outside observers can trust the proof, not just the claims

That is the goal.
