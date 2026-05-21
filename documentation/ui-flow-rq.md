# UI Flow Requirements

## Product Frame

The UI should make one thing obvious: this product is about training a specific kind of person, not browsing lessons.

The primary user-facing arc is:

1. define target self
2. review generated path
3. run daily training loop
4. see gap clearly
5. update path as identity and performance evolve

## Core Screens

### 1. Landing / Entry

Purpose:

- explain the product in one clear idea
- start onboarding interview

Primary actions:

- start interview
- sign in

Required states:

- first-time visitor
- returning user

### 2. AI Onboarding Interview

Purpose:

- capture target identity and current state through conversation

UI requirements:

- chat-style interview, not a static form
- visible progress through interview phases
- ability to review or edit captured facts before finalizing

Interview phases:

- target identity
- context and ambitions
- desired traits and operating style
- hard moments they need to handle
- current strengths
- repeated failures and bottlenecks

Required outputs shown to user:

- target self summary
- current self summary
- candidate skill clusters
- confidence / missing info flags

### 3. Identity Model Review

Purpose:

- let user confirm the generated identity model before curriculum generation

UI requirements:

- editable identity summary
- editable traits / behaviors
- editable goals / contexts
- editable "things I want to add/remove"

Primary actions:

- approve model
- edit model
- regenerate model

### 4. Curriculum Path View

Purpose:

- show the generated architecture as a visible path

UI requirements:

- grouped progression stages
- ordered units with dependencies visible
- simulation markers every 5 units
- current position
- next recommended step

Required detail on each node:

- unit title
- capability being built
- why it matters for target self
- status

Primary actions:

- start next unit
- inspect locked future units
- ask mentor why this is next

### 5. Workspace / Today View

Purpose:

- act as the daily entry point after onboarding

Required modules:

- next recommended unit
- recent gaps
- upcoming simulation if relevant
- mentor diagnostic note
- progress against current transformation path

Primary actions:

- continue training
- review last debrief
- open profile
- open curriculum map

### 6. Education Unit View

Purpose:

- teach one concept cleanly before pressure starts

Sections:

- concept
- worked example
- retrieval check

UI requirements:

- one clear concept focus
- no noisy sidebars
- compact but dense presentation
- progress indicator across unit steps

Primary action:

- continue to retrieval

### 7. Retrieval Check

Purpose:

- force recall before application

UI requirements:

- short-answer or small structured questions
- no immediate coaching during answering
- fast pass/fail or graded result

Outcomes:

- pass -> unlock scenario
- weak -> quick repair and retry

### 8. Unit Scenario Workspace

Purpose:

- force application under pressure

UI requirements:

- scenario prompt at top
- world/AI response area if multi-turn
- main answer workspace
- minimal chrome
- pressure modifiers visible where relevant

Behavior requirements:

- no "you are doing well" hints mid-run
- AI can escalate the scenario
- user should feel friction and stakes

### 9. Debrief View

Purpose:

- make the gap visible and specific

Required sections:

- outcome summary
- what you did
- what target self would have done
- divergence points
- failure isolation
- next training recommendation

Optional but important:

- strength signals
- confidence / certainty markers on diagnoses

Primary actions:

- retry
- review linked concept
- continue to next unit
- ask mentor why this matters

### 10. Deep Simulation Entry

Purpose:

- mark the shift from unit practice to integrated performance test

UI requirements:

- clear framing that this is cumulative
- no heavy prep or hints
- visible stakes

### 11. Deep Simulation Workspace

Purpose:

- test multiple units and traits at once

UI requirements:

- full-screen focus
- branching or escalating scenario flow
- support for longform or turn-based interaction
- checkpoint-safe persistence if session drops

### 12. Simulation Debrief / Ghost Replay

Purpose:

- show moment-by-moment divergence from an ideal run

Required sections:

- overall result
- concept failures
- trait failures
- decision timeline
- ghost replay comparison
- recommended remediation path

### 13. Mentor View

Purpose:

- give diagnostic guidance from the full history

UI requirements:

- current bottlenecks
- recurring failure patterns
- why the next recommendation exists
- what has improved over time

Primary actions:

- accept recommendation
- inspect evidence
- ask follow-up questions

### 14. Profile / Identity Evolution

Purpose:

- let the user update who they want to become as they evolve

UI requirements:

- editable target self
- editable contexts and ambitions
- add/remove traits or capabilities
- view change history

Important behavior:

- profile edits may trigger curriculum recalculation
- user should understand what changed and why

## Cross-Cutting UX Requirements

### State and Progress

The UI must always make these visible:

- where the user is
- why this step exists
- what happens next
- how this connects to target self

### Personalization

The interface should repeatedly tie content back to identity model:

- "this unit matters because..."
- "this broke because..."
- "next because..."

### Failure Handling

Failure should feel diagnostic, not punitive.

Required behaviors:

- specific failure labels
- linked remediation
- no generic "review more"

### Empty / Loading / Recovery States

We need explicit UX for:

- interview generation loading
- curriculum generation loading
- unit generation loading
- AI response delays
- failed scenario submission
- failed debrief generation
- session recovery

## V1 UI Flow Order

1. Landing
2. AI onboarding interview
3. Identity model review
4. Curriculum path generation result
5. Today view
6. Education unit
7. Retrieval check
8. Unit scenario
9. Debrief
10. Repeat
11. Every 5 units: deep simulation
12. Simulation debrief
13. Mentor recommendation
14. Profile edits and path recalculation

## V1 Screens We Can Defer

- public proof profile
- artifact showcase
- social comparisons
- advanced mentor chat history explorer
- multi-domain switching
