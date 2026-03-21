# Backend Requirements

## Product Frame

The backend has to support an identity-first adaptive training system, not a static lesson tree.

It must be able to:

- capture and version identity models
- generate curriculum architecture from that identity
- generate or refine units for each progression stage
- run scenarios and simulations
- persist attempts and debriefs
- isolate failures precisely
- recalculate recommendations over time

## Core Backend Responsibilities

### 1. Identity Modeling

The system needs a durable identity model per user.

Required capabilities:

- store onboarding interview transcript or structured summary
- store target self model
- store current self model
- store desired traits as observable behaviors
- store target contexts / domains / hard moments
- version edits over time

Important rule:

Traits must be resolved into trainable and testable behaviors, not only abstract adjectives.

### 2. Curriculum Architecture Generation

The system needs an AI-driven curriculum architecture generator.

Inputs:

- identity model
- current state
- prior failures
- selected domain or track

Outputs:

- progression stages
- dependency graph
- units
- simulation checkpoints every 5 units
- rationale for ordering

Important behavior:

- architecture can be regenerated when identity model changes
- architecture should preserve completed evidence where possible

### 3. Education Unit Builder

We should treat unit creation as a backend capability, not hardcoded content only.

Need an internal `education-unit-builder` agent/service that can create or refine:

- concept explanation
- worked example
- retrieval items
- scenario setup
- evaluation expectations

Inputs:

- curriculum node
- identity model
- prior unit outcomes
- mentor guidance

Outputs:

- personalized unit payload ready for UI

### 4. Scenario and Simulation Orchestration

The backend must support both:

- unit-level scenario runs
- multi-unit deep simulations

Capabilities needed:

- create scenario session
- persist session state
- support escalating turns
- support pressure modifiers
- support branch state if the scenario changes based on user choices

### 5. Debrief and Failure Isolation

This is core.

The backend must generate structured debriefs, not only scores.

Required outputs:

- outcome summary
- strengths
- divergence points
- target-self comparison
- failure categories
- linked concepts or traits that broke
- recommended next action

Failure isolation must map back to:

- concept node
- behavioral trait
- scenario decision point

### 6. Mentor Recommendation Engine

The mentor layer needs a service that reads:

- identity model
- curriculum architecture
- unit history
- simulation history
- repeated failure patterns

It should output:

- next best action
- why it is next
- whether curriculum should be recalibrated
- evidence behind the recommendation

## Domain Model

Suggested core entities:

- `user_identity_profile`
- `identity_profile_version`
- `identity_behavior`
- `identity_context`
- `curriculum_plan`
- `curriculum_stage`
- `curriculum_node`
- `unit_content`
- `retrieval_item`
- `scenario_template`
- `simulation_template`
- `training_session`
- `session_turn`
- `attempt`
- `debrief`
- `failure_tag`
- `mentor_recommendation`

## Data Requirements

### Identity Data

Need to store:

- target role / operator archetype
- desired operating traits
- observable behaviors
- relevant environments
- difficult situations to train for
- current strengths
- self-reported failures

### Curriculum Data

Need to store:

- plan version
- nodes and dependencies
- node type
- node status
- simulation checkpoints
- rationale

### Attempt Data

Need to store:

- unit or simulation id
- session transcript
- submitted responses
- scoring dimensions
- debrief output
- failure tags
- recommended remediation

## API / Service Requirements

### Identity APIs

Need endpoints or procedures for:

- start onboarding interview
- continue interview
- finalize identity model
- fetch latest identity model
- update identity model from profile
- fetch identity version history

### Curriculum APIs

Need endpoints or procedures for:

- generate curriculum architecture
- fetch active curriculum
- fetch curriculum map
- regenerate curriculum after profile change
- fetch next recommended node

### Unit APIs

Need endpoints or procedures for:

- fetch active unit
- fetch unit content
- submit retrieval answers
- fetch retrieval result
- start unit scenario
- submit scenario turn or final response

### Debrief APIs

Need endpoints or procedures for:

- fetch latest debrief
- fetch ghost replay
- fetch failure isolation details
- fetch linked remediation targets

### Mentor APIs

Need endpoints or procedures for:

- fetch current recommendation
- fetch recurring gap patterns
- explain why this is next

## Evaluation Structure

We should keep evaluation structured rather than one vague score.

Likely dimensions:

- correctness
- reasoning quality
- prioritization
- communication
- robustness
- transfer
- composure under pressure

The exact dimensions can vary by domain, but the backend needs a common envelope for storing them.

## Memory Requirements

AI quality depends on memory and retrieval.

Need reliable context assembly for:

- identity profile
- latest curriculum plan
- recent unit outcomes
- repeated failure patterns
- current stage constraints

This should be deterministic and inspectable, not hidden prompt soup.

## Orchestration Requirements

We will likely need separate backend capabilities for:

- interview orchestration
- curriculum generation
- unit building
- scenario runtime
- debrief generation
- mentor recommendation

These can share infra, but should remain logically separate.

## Auth and Access

Need authenticated persistence for:

- identity profiles
- curriculum plans
- attempts
- debrief history
- mentor state

Anonymous mode can exist later, but V1 should assume signed-in persistence if we want real longitudinal adaptation.

## Observability and Quality Control

Need backend logging for:

- generation failures
- malformed AI outputs
- session drop-offs
- regeneration events
- repeated low-confidence debriefs

Need basic admin/debug visibility into:

- current identity model
- current curriculum version
- generated unit payloads
- debrief payloads
- mentor recommendation rationale

## V1 Backend Slice

For V1, we need:

- identity model persistence
- one curriculum generator
- one education-unit-builder path
- unit content fetch
- retrieval submission
- scenario session + attempt persistence
- debrief persistence
- simulation every 5 units
- mentor recommendation generation
- profile-driven curriculum recalculation

## Explicit Non-Requirements for V1

- broad multi-domain marketplace infra
- social/public profile systems
- full autonomous agent swarm
- perfect real-time world modeling
- unlimited freeform memory without structure
