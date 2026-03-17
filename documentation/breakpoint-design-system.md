# Breakpoint Design System v0.1

## Brand Intent

### Working Brand Adjectives

- Surgical
- Demanding
- Calm
- Elite
- High-stakes

Breakpoint should feel like a serious training environment, not a playful edtech dashboard. The UI should communicate pressure, clarity, and earned progress.

---

## Core Product UI Principles

### 1. Focus Wins

- one dominant action per viewport
- minimal decorative noise
- strong hierarchy for what matters now

### 2. Pressure Without Chaos

- use contrast, spacing, and density to create seriousness
- avoid theatrical danger styling
- pressure should come from content and timing, not visual clutter

### 3. Feedback Must Feel Precise

- evaluations should look organized, not chatty
- diagnosis panels should feel clinical and trustworthy
- praise should be earned and specific

### 4. Progress Must Feel Real

- visible stage labels
- visible domain / level / state
- interfaces should imply movement through a system, not random screens

---

## Canonical Tokens

### Color

- **Base**: zinc / graphite neutrals
- **Primary accent**: electric-but-controlled blue
- **Danger**: restrained red-orange for real failure states only
- **Success / readiness**: avoid bright green dominance; use calm neutral + blue language first

### Surface Model

- **Page background**: near-black with subtle blue radial atmosphere
- **Primary panels**: dark elevated surfaces with low-gloss borders
- **Secondary panels**: slightly lighter muted surfaces
- **Interactive surfaces**: stronger border contrast and hover lift

### Radius

- sharp by default
- avoid soft playful rounding
- use square to minimally rounded surfaces only where readability needs it

### Shadows

- long, soft, low-color shadows
- shadows communicate depth and seriousness, not softness

### Typography

- **Display**: `Sora`
- **Body**: `Manrope`
- **Mono**: `Geist Mono`

Typography should feel modern and technical without becoming startup-generic.

### Spacing

- generous vertical spacing for thinking surfaces
- tighter spacing in meta/status bars
- avoid cramped form surfaces

### Motion

- short transitions
- no bouncy motion
- motion should clarify state changes, hover affordance, and system response

---

## Component Rules

### Buttons

- action buttons should feel decisive, not bubbly
- primary actions use blue fill
- secondary actions use outline or muted surface

### Badges

- use for state, stage, readiness, and capability
- keep compact and uppercase-leaning
- avoid rainbow badge systems

### Panels / Surfaces

- panels are the backbone of Breakpoint
- each panel should have a clear role: prompt, answer, evaluation, proof, repair
- use shared surface primitives rather than one-off card styling

### Inputs

- longform inputs must feel like workspaces, not tiny form fields
- default textarea should support dense but readable thinking
- avoid over-decorating writing surfaces

---

## Page Archetypes

### 1. Domain Select

- clear thesis at top
- grid of high-signal domain cards
- one dominant unlocked path when product breadth is still low

### 2. Arena / Scenario

- top half communicates the challenge
- bottom half is the response workspace
- evaluation is adjacent, not hidden behind navigation

### 3. Repair Mode

- narrower, more linear, more corrective
- one weakness at a time

### 4. Evaluation Report

- score + reasoning + root causes + next action
- must feel legible and earned

### 5. Proof Profile

- artifact-first
- benchmarks and feats should feel like public evidence, not vanity stats

---

## Voice Rules

### Product Voice

- direct
- precise
- demanding
- not cruel

### Anti-Patterns

- fake hype
- generic growth language
- therapy-speak in evaluation
- gamified fluff

---

## Current Decisions for v0.1

- blue/zinc is the initial token direction
- display/body typography split is enabled
- sharp corners are the default
- panels and status badges are the first shared primitives
- domain select and scenario arena are the first canonical screens

---

## Inputs Still Needed To Finalize v1

- final brand adjectives if different from the working set above
- whether blue remains the permanent accent
- whether Breakpoint should have a logo mark or wordmark-only identity
- preferred density: austere and sparse vs dense and command-center-like
- examples of products whose tone feels right and wrong
- final content voice examples for teach / diagnose / evaluate / repair
