# V1 Product Specification

## What This Document Is

This is the V1 build spec for Breakpoint. It defines what ships, what doesn't, how each surface works, and the quality bar for each piece of the engine. It is written against what's already in the codebase — the SACTRE unit builder, Forge workspace, Becoming flow, and identity modeling — and it defines what needs to be completed, added, or tightened to ship a product worth using.

---

## Product Angle

**Not:** a learning platform.
**Not:** an AI tutor.

**This is a performance training system.**

The core pitch: you tell us who you want to become. We close the gap between how you perform under pressure now and how that person performs under pressure. You train until your behavior looks more like theirs than your starting point.

The identity interview is what makes the training feel personal. The debrief is what makes it feel credible. The skill graph with pressure-tested states is what makes the proof mean something.

---

## V1 Scope

**One domain. One user. One loop.**

V1 proves the engine works. It does not prove the ecosystem.

### Ships in V1

- Onboarding interview → identity model → gap reveal
- AI-generated curriculum architecture with visible reasoning
- SACTRE unit loop (Seed → Build → Practice → Teach-back → Repair)
- Deep simulation / capstone every cluster end
- Spaced recall gates (every 5 units)
- Skill graph with pressure-tested vs. untested states
- Debrief as divergence visualization, not report card
- Mentor recommendations anchored to actual attempt history
- Private proof profile (auto-built, not curated)
- Session re-entry hook (home screen shows one thing: next move)

### Does Not Ship in V1

- Challenge mode or public ranking of any kind
- Groups, teams, or cohorts
- Competition creation tools
- Recruiter or manager portal
- Creator marketplace
- Public reputation layer
- Multi-domain support (schema exists, not exposed)
- Social graph of any kind

---

## System Shape

### 1. Onboarding Interview

**What it is:** An AI interview that constructs the user's identity model. Already built (`onboarding-flow.ts`, `onboarding-shell.tsx`).

**Quality bar for V1:**

The interview must feel like talking to a sharp mentor, not filling out a form. The AI should probe and challenge the user's self-assessment — not just collect answers. Specifically:

- When the user describes their target identity in vague terms ("I want to be a better leader"), the AI must push for specificity: "What does 'better' look like in a situation that's already gone wrong?"
- When the user describes past failure, the AI must follow the thread: "That's the pattern. Where else does it show up?"
- The interview should surface things the user hasn't articulated, not just confirm what they've said.

**Output that must exist after onboarding:**
- `behaviorSignals` — the specific observable behaviors that define the target identity (not vague traits)
- `hardMoments` — concrete failure situations, not categories of failure
- `confidenceFlags` — where the user's self-assessment is inconsistent or uncertain
- `beforeAfter` — a contrast pair: who they are now vs. who they are training to become

If `behaviorSignals` reads like a LinkedIn skills list, the onboarding has failed.

---

### 2. Gap Reveal

**What it is:** A designed moment between onboarding and first unit. Not currently built.

**What it shows:**
- The observable behaviors that define the target identity (from `behaviorSignals`)
- An honest estimate of where the user currently stands on each behavior
- Which behaviors are most likely to break first under pressure
- Why the curriculum is ordered the way it is — specifically referencing what was said in the interview

**Why it exists:** Without this moment, the curriculum is a list of things to do. With it, every unit feels like it's solving *your specific problem*. This is the moment the user commits to the training.

**UX:** This is a standalone screen after onboarding completes and before the curriculum tree is shown. It should feel like the system handing you a diagnosis, not a welcome screen. Spare, direct, anchored to the identity model. The user should leave this screen thinking: "It actually understood me."

**Implementation note:** The `BecomingIdentityProfileVersion` schema already stores `behaviorSignals`, `confidenceFlags`, and `beforeAfter`. The gap reveal screen reads from these fields. The "estimate of where you currently stand" can be AI-generated at curriculum time as part of the `generateCurriculum` workflow, stored on the curriculum plan, and surfaced here.

---

### 3. Curriculum Architecture

**What it is:** AI-generated skill clusters → units → capstones, dependency-ordered, personalized to identity model. Already built (`curriculum-flow.ts`, `BecomingCurriculumPlan`, `BecomingCurriculumNode`).

**Quality bar for V1:**

The first curriculum generated must feel like it was built for this specific person — not a generic syllabus. Concretely:

- The cluster ordering must be explained. The curriculum reveal screen must show *why* cluster 1 comes before cluster 2 in terms the user recognizes from their interview.
- Unit titles must not be generic. "Scoping before escalating" is right. "Communication skills" is not.
- Each cluster must have a clear behavioral outcome: "After this cluster, you'll be able to [observable behavior] in [pressure condition]."

**Cold start bar:** If the first curriculum output could have been generated for any user in the domain without reading the interview, it fails.

---

### 4. SACTRE Unit Engine

The five stages: **S**eed → bu**A**ld → pra**C**tice → **T**each-back → **R**epair (**E**nd).
Already fully built in `packages/api/src/domain/becoming/unit-builder/`.

**Quality constraints (non-negotiable):**

**Seed:**
- Must not name the concept. It's a concrete situation using only knowledge the learner already has.
- Must expose the learner's current mental model, not test whether they know the right term.

**Build:**
- Opens with a direct reference to the learner's actual seed response. Not "learners often..." — "In your response, you..."
- Dense, direct, built around how to think — not what to memorize.
- Word ceiling enforced by `complexityBudget`.

**Practice (3 prompts):**
- Tests application, not paraphrase.
- Identification: recognize the pattern in a new situation.
- Construction: apply the model to produce an output.
- Debugging: find where the model was violated and why.

**Teach-back (3-round ladder):**
- Round 1: Surface misconception — a common wrong reading of the concept.
- Round 2: Structural challenge — presses on the mechanism itself.
- Round 3: Edge case / transfer stress — does it hold in an adversarial variation?
- Objections must be real. Not strawmen. The learner should feel genuinely pressed.

**Repair (Ghost Scenario):**
- Triggers only on failure (teach-back rounds 2-3 failing or practice scoring off-track).
- Ghost scenario is in a **different domain** from the unit. The goal is to isolate the reasoning gap, not re-teach the topic.
- `gapType` must be specific: overgeneralization, underapplication, missing prerequisite, transfer block.

---

### 5. Capstone Simulations

Every cluster ends with a capstone simulation. Three formats: Build, Debate, Teach. Already built (`capstone-*`).

**Quality bar for V1:**

- The capstone must feel adversarial from line one. No scaffolding. No hints. This is where the learner finds out if the training held.
- Multi-round. The AI must escalate pressure across rounds — the third round should be harder than the first.
- The capstone scenario must use the user's specific `hardMoments` and domain context from the identity model. It is not a generic scenario.

**V1 capstone debrief (see Debrief Engine below):** The simulation debrief is the highest-value debrief in the product. It must explicitly compare the user's multi-round performance against the target identity's observable behaviors.

---

### 6. Spaced Recall Gates

Every 5 units, a recall gate triggers. Already built (`recall-flow.ts`, `BecomingRecallState`).

**Three probe types:**
- `seed_return` — return to an earlier scenario, without signaling which unit it's from.
- `interleave` — a scenario that requires pulling from two prior units simultaneously.
- `compression` — "explain X to someone who has never seen it" — tests whether the model is actually internalized.

**V1 behavior on failure:**
- Decay the skill's state in the graph.
- Route the user to a repair unit targeting the specific gap before advancing.
- The mentor layer must pick this up in next-action recommendations.

---

### 7. Debrief Engine

**This is the core differentiator. If it feels generic, the product fails.**

**What the debrief must show — per unit:**

1. **What the user actually did** — in specific terms, not category labels.
2. **What the target self would have done** — anchored explicitly to a `behaviorSignal` from the identity model.
3. **The divergence point** — the exact moment in the scenario where the response went off the target path, and why.
4. **The root gap** — which concept, reasoning pattern, or judgment call broke. Named specifically.
5. **What happens next** — one concrete next step, generated by the mentor layer.

**UX — film review, not report card:**

The debrief is not a text summary. The user should be able to trace through their response and see, at each key decision point, how it compared to the target behavior. Think film review: here's what you did, here's the frame where it diverged, here's what the other path looked like.

Implementation: the debrief response from `getForgeDebrief` already returns structured output. The frontend `unit-debrief.tsx` needs to render this as an annotated response walkthrough — not a bulleted list.

**What the debrief must NOT do:**
- Use words like "great attempt" or "good effort."
- Give generic advice ("consider being more decisive").
- Summarize without anchoring to the specific moment of failure.
- Treat all failure types as equivalent.

**Capstone debrief (higher bar):**
- Covers the full multi-round arc, not just the final round.
- Shows which behaviors held across rounds and which degraded under pressure.
- Explicitly states whether the target identity behaviors from the cluster are now pressure-tested.
- Triggers mentor recommendation update.

---

### 8. Skill Graph and Mastery State

**What it is:** A first-class model of capability, not a course completion log. DB schema exists. UI and scoring logic need to be built or completed.

**Four skill states (must be first-class UX concepts, not just data fields):**

| State | Meaning |
|---|---|
| **Untrained** | Not yet touched. |
| **Learned** | Covered in a unit. Never tested in a scenario. |
| **Scenario-tested** | Tested once under pressure (unit scenario or practice). |
| **Pressure-tested** | Demonstrated across multiple attempts; consistent under adversarial conditions. |

**Rules for state transitions:**
- `Untrained → Learned`: unit build phase completed.
- `Learned → Scenario-tested`: unit scenario passed (seed + teach-back pass).
- `Scenario-tested → Pressure-tested`: appears in a capstone simulation AND a recall gate — both passed.
- Any state → decays back one level if a recall gate fails on that skill.

**UX requirement:** The user must be able to see their skill graph at any time and read, at a glance, which skills are genuinely proven vs. theoretically known. The distinction between "I know this" and "I've proven this holds under fire" is the entire credibility argument of the product. Make it visible.

**Proof profile reads from this graph.** A skill only appears as "proven" on the proof profile if it is `Pressure-tested`. Anything else is labeled clearly as in-progress.

---

### 9. Mentor Layer

**What it is:** The diagnostic engine that decides what happens next. Uses identity model, unit history, simulation history, recall gate results, and repeated failure patterns. Already partially built.

**What the mentor must do — not just describe:**
- After every capstone: explicitly decide whether the curriculum path should change based on the simulation results.
- After any repair unit: decide whether the gap was actually closed or just masked.
- After a recall decay: flag it, re-prioritize affected units.
- After 3+ units with the same `failureTags`: surface the pattern explicitly and change the path.

**What the mentor must NOT do:**
- Recommend "keep going, you're doing well."
- Generate motivational output.
- Give the same recommendation twice in a row without a performance signal that justifies it.

**The mentor output always has this shape:**
1. What pattern this recommendation is responding to (specific, not generic).
2. What the next action is and why.
3. Whether the curriculum path is changing as a result.

---

### 10. Home Screen / Session Re-Entry

**What it is:** The surface the user sees when they return between sessions. Not currently designed as a first-class surface.

**Design constraint:** The home screen shows one thing — the user's next move, anchored to the gap.

**Not:**
- A course catalog.
- A progress dashboard with percentages.
- A streak counter.
- Motivational copy.

**Is:**
- The single most important unit or action to take right now.
- Why it matters — one sentence, anchored to the identity model.
- Where the user stands in the gap — not a progress bar, but the honest read: "Your blast-radius containment has been tested once. It hasn't been tested under pressure yet. That's next."

The home screen is where the mentor layer surfaces its recommendation. If the mentor has flagged a pattern, the home screen reflects it.

---

### 11. Private Proof Profile

**What it is:** An auto-built evidence surface. The user does not curate it. The system builds it from training data.

**What it shows:**
- Target identity (from `BecomingIdentityProfileVersion`)
- Skill graph — showing pressure-tested vs. in-progress skills
- Simulations passed — by format (Build, Debate, Teach) and difficulty
- Recall gate performance — showing retention over time, not just initial pass
- Before/after contrast — who the user was at start vs. now, in observable behavior terms

**What it does NOT show:**
- Badges.
- Completion percentages.
- Arbitrary points or streaks.
- Anything the user hasn't actually demonstrated under pressure.

**V1:** Private only. The user can see it. No sharing, no recruiter access. That comes after the quality of the proof is worth sharing.

---

## Quality Bars Across the System

These are the specific failure conditions. If any of these are true, the product isn't ready.

| Area | Failure condition |
|---|---|
| Onboarding | `behaviorSignals` reads like a generic skills list |
| Gap Reveal | The screen could have been generated for any user in the domain |
| Curriculum | Unit titles are generic or cluster ordering isn't explained |
| Seed | The concept is named before the learner has engaged with it |
| Build | Doesn't reference the learner's actual seed response |
| Teach-back | Round 2/3 objections are strawmen rather than real challenges |
| Debrief | Uses words like "great effort" or gives advice without a specific divergence point |
| Skill graph | No visible distinction between "learned in theory" and "pressure-tested" |
| Mentor | Gives the same recommendation twice without a new performance signal |
| Home screen | Shows anything other than the next single most important action |
| Proof profile | Shows anything the user hasn't actually demonstrated under pressure |

---

## AI Responsibilities (Per System)

| Agent | Responsibility |
|---|---|
| Onboarding interviewer | Conduct identity discovery. Probe. Challenge vague self-assessments. |
| Curriculum architect | Generate dependency-ordered skill clusters from identity model. Explain the ordering. |
| `education-unit-builder` (SACTRE) | Generate all 5 stages per unit. Enforce quality constraints on each stage. |
| Capstone runner | Run adversarial multi-round simulation. Escalate pressure across rounds. |
| Debrief engine | Produce precise divergence analysis anchored to identity model. No generic output. |
| Mentor | Read attempt history + recall + failure tags. Produce diagnostic recommendation, not motivation. |
| Recall gate generator | Generate probes that test actual retention — not surface recognition. |

**Model choice principle:** Use the best available model for debrief generation and onboarding. The seed/build/practice generation can run on a faster model. The teach-back evaluation runs on the same model as the teach-back generation. Never trade quality for latency on the debrief.

---

## Out of Scope for V1

The following are real parts of the long-term product. They do not ship in V1.

- **Challenge mode / ranking** — Ranking without an audience is hollow. Ranking before training quality is proven creates noise. Ships when the engine has users.
- **Groups / teams / cohorts** — Social mechanics before the solo engine is proven kills focus. Ships after solo mastery loop is validated.
- **Competition creation tools** — No creator infrastructure until quality controls are designed.
- **Recruiter / manager portal** — The proof layer needs to be worth trusting before external viewers are invited.
- **Public reputation** — Earned from real performance signals that don't yet exist at scale.
- **Multi-domain** — One domain must work completely before expanding. Domain routing infrastructure exists; do not expose it.

---

## Success Condition for V1

V1 is working when a user who completes 10+ units can say all of the following are true:

1. The system understood the specific operator I was trying to become — not a category, a person.
2. The scenarios felt like they were built for my specific failure patterns.
3. The debriefs showed me exactly where I diverged and why — not generic advice.
4. The simulations were hard in a way that felt real, not artificial.
5. The skill graph reflects what I can actually do vs. what I've only read about.
6. The mentor changed the path at least once based on something I actually did wrong.
7. My proof profile shows something I'm willing to point to as evidence.

If users complete 10 units and can't say all seven, the engine isn't working yet.
