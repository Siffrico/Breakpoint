# Curriculum Test 2 — SAT Reading

A worked instantiation of the [Education System V3](./education-system-V3.md) curriculum model for a
single domain: the Reading side of the digital SAT Reading & Writing section.

The point of this document is to show what the V3 hierarchy looks like when the domain is *not*
software — no artifacts to build, no repo to touch, a hard external scoring standard, and a learner
whose real goal is a number. The structure holds anyway, because the abilities are still whole
observable performances and the concepts are still causal mechanisms.

## Target identity

> "A reader who can find the warrant for an answer in the text, and can tell a true statement
> apart from a supported one — under a clock."

Not "someone who has memorized SAT tricks," and not "someone who scores 750." The score is the
consequence; the identity is the reading behavior that produces it.

## The tree

```text
TARGET IDENTITY: "A reader who can locate textual warrant under time pressure"
│
├── ABILITY 1 ─ "Answer from the text, not from plausibility"          [stage: foundations]
│   │   workflow: read the question stem first → predict the answer before looking
│   │             → locate the warranting span → eliminate on a named defect
│   │             → confirm the survivor against the span → commit and move
│   │   difficulty ramp: clean expository → dense argument → paired texts →
│   │                    poetry / 19th-c. prose with unfamiliar diction
│   │   exit criteria: on unseen passages, learner names the exact span that
│   │                  licenses the answer AND the exact defect in each distractor,
│   │                  at ~70s/question, without rereading the whole passage
│   │
│   ├── SKILL 1.1 ─ "Discriminate a supported answer from a true one"       [ready]
│   │   │      (the signal moment: two choices are both factually fine and only
│   │   │       one is licensed by the cited text — novices pick the smarter one)
│   │   │
│   │   ├── CAUSAL CONCEPT MAP  (dependency-ordered, falsifiable mechanisms)
│   │   │     c1  A choice that is true of the world but absent from the passage
│   │   │         is wrong, because the question tests textual warrant, not
│   │   │         factual accuracy — the test writer builds these deliberately
│   │   │         from common outside knowledge.                    [covered 3/3 ✓]
│   │   │
│   │   │     c2  A choice that is true of the passage but not of the *cited lines*
│   │   │         is wrong on line-reference items, because the stem restricts the
│   │   │         evidence set; scope, not truth, is what fails.    [covered 2/3]
│   │   │
│   │   │     c3  Swapping one quantifier ("some" → "all", "often" → "always")
│   │   │         makes an otherwise correct paraphrase false, because the passage's
│   │   │         hedge was load-bearing; over-strong language is the single most
│   │   │         common distractor defect.                          [covered 1/3]
│   │   │
│   │   │     c4  A choice that reverses the direction of a causal claim ("X explains Y"
│   │   │         → "Y explains X") survives a skim because it reuses the passage's
│   │   │         own nouns; only checking the arrow catches it.     [covered 0/3]
│   │   │
│   │   │     c5  A choice that is half-right — correct clause joined to an
│   │   │         unsupported clause — is fully wrong, because SAT choices are
│   │   │         scored as single conjunctions, so one bad half kills it. [covered 0/3]
│   │   │
│   │   │     c6  Predicting the answer *before* reading the choices prevents
│   │   │         anchoring, because once a fluent distractor is read the reader
│   │   │         starts searching the passage for permission to keep it rather
│   │   │         than testing it.                                   [covered 0/3]
│   │   │     …                                                      (6–24 entries)
│   │   │
│   │   └── FOUNDATION UNITS  ── generated just-in-time from the uncovered frontier,
│   │       │                    never enumerated up front
│   │       ├── unit-a   frontier {c1}        → mastered
│   │       ├── unit-b   frontier {c1, c2}    → mastered
│   │       ├── unit-c   frontier {c2, c3}    → mastered
│   │       └── unit-d   frontier {c3, c4}    ← LIVE
│   │
│   ├── SKILL 1.2 ─ "Locate the span that licenses the answer"              [planned]
│   │   ├── CAUSAL CONCEPT MAP  (transition words as evidence anchors; the answer
│   │   │                        usually sits one sentence after the pivot; a claim's
│   │   │                        warrant is never in the topic sentence …)
│   │   └── FOUNDATION UNITS    (none yet — no frontier until 1.1 is mastered)
│   │
│   └── SKILL 1.3 ─ "Eliminate on a named defect, not on a feeling"         [planned]
│       └── CAUSAL CONCEPT MAP  (naming the defect — scope / strength / direction /
│                                half-right / out-of-passage — makes elimination
│                                reviewable; "it felt off" is unreviewable and
│                                does not survive time pressure …)
│
├── ABILITY 2 ─ "Reconstruct an argument's structure fast"                 [planned]
│   │   workflow: find the claim → find the evidence → find the concession
│   │             → find the pivot → state the author's stance in one line
│   │   ├── SKILL 2.1  "Separate the author's view from a view the author reports"
│   │   ├── SKILL 2.2  "Read a data figure as a claim, not a decoration"
│   │   └── SKILL 2.3  "Hold two texts in tension on paired-passage items"
│
├── ABILITY 3 ─ "Read hostile prose without losing the thread"             [planned]
│   │   (19th-century syntax, poetry, unfamiliar diction — the passages where
│   │    comprehension, not technique, is the bottleneck)
│   │   ├── SKILL 3.1  "Recover meaning from context when the word is unknown"
│   │   ├── SKILL 3.2  "Unpack a sentence whose subject and verb are 30 words apart"
│   │   └── SKILL 3.3  "Track a pronoun's referent across a paragraph"
│
└── ABILITY 4 ─ "Spend time where the points are"                          [planned]
    │   (the metacognitive ability: triage, abandonment, and pacing — this is where
    │    a 690 becomes a 760, and it cannot be trained before 1–3 are real)
    ├── SKILL 4.1  "Abandon a question before it eats a second one"
    ├── SKILL 4.2  "Choose a defensible answer under a 20-second remainder"
    └── SKILL 4.3  "Diagnose your own error type from a completed section"
```

## Skillset stage — what opens after the skills are mastered

Foundation units live under a skill and drill one signal moment. They check off concepts and never
move the ability rating. **Skillset units live under the ability** and demand the whole workflow at
once — stem, prediction, span, elimination, confirmation, commit — on a passage the learner has
never seen.

```text
ABILITY 1  ── stage flips foundations → skillset when 1.1, 1.2, 1.3 are all mastered
│
├── skillset unit  ── full workflow, clean expository passage
│                     support: worked example      difficulty: band 2
├── skillset unit  ── full workflow, dense argument + a data figure
│                     support: guided              difficulty: band 3
├── skillset unit  ── paired texts, timed
│                     support: none                difficulty: band 4
│      … Breakpoint keeps minting units until rating ≥ ability peak
│        AND rating deviation ≤ ±80. No fixed lesson count.
│
└── FIELD MISSION ── required before the ability can be marked complete
       shape → choose → commit → prove → debrief

       Proposed mission: "Take one real, timed Reading module (32 min).
       For every question you got wrong, and every question you got right but
       flagged, write the span that licensed the correct answer and name the
       defect in the choice you picked. Paste the list — one line each."

       Scored:  execution 40  ·  evidence 35  ·  judgment 25   → pass ≥ 70
       (Judgment is where this mission bites: a learner who writes "careless
        mistake" five times scores near zero on judgment even with a perfect
        raw score, because the ability being proved is *diagnosis*, not luck.)
```

## What a foundation unit actually looks like — `unit-d`, frontier `{c3, c4}`

One evolving scenario, one chat, three rounds. Note that the "scenario" here is not a story about a
student taking the SAT — it is a *reading situation* in which the causal mechanism becomes
load-bearing. The learner never role-plays; they read and decide.

```text
ORIENT      The expert's map of distractor construction: how a test writer starts from
            the correct answer and produces four wrong ones by applying exactly one
            defect each. One worked trip through a released item, thinking aloud.
   ↓
CONNECT 1   State A:  a short passage where the author writes that a policy
                      "frequently reduced, though did not eliminate, delays."
            State B:  pick the choice the text licenses.
            chasm:    c3 — the hedge is load-bearing; a choice reading
                      "eliminated delays" reuses every other word correctly.
            friction: the over-strong choice is the most fluent, most
                      confident-sounding sentence of the five.
            ↕ guided retry  (two failed connections ⇒ Breakpoint teaches the
              quantifier mechanism outright and re-poses the same item)
   ↓
SOLVE 1     Learner commits to a choice AND states the defect in each of the four
            rejects, by name. Evaluator scores the *reasoning*, not the letter —
            picking the right answer while misnaming the defects does not pass.
            ↕ repair   (server passes at ≥ 80; repeated failure triggers a worked
              micro-teach anchored to the learner's own wrong elimination)
   ↓
TEACH       Diagnose the root model. ("You are eliminating on unfamiliarity —
            you rejected B because 'attenuated' felt like a trap word. The expert
            rejects on a named defect. Unfamiliar diction is not a defect.")
            EVOLVE the scenario: same passage, same author, next question — now
            the over-strong choice is *not* the trap, and one choice reverses the
            causal arrow instead.
   ↓
CONNECT 2 → SOLVE 2        (c4 goes live — direction reversal)
   ↓
TEACH       Evolve, and MUTATE a load-bearing constraint: the stem now cites
            specific lines. The strategy that worked twice — scan the whole
            paragraph for the arrow — now selects a choice that is true of the
            passage but outside the cited span. c2's mechanism has to be
            re-derived under a new surface, and c3/c4 have to survive it.
   ↓
CONNECT 3 → SOLVE 3
   ↓
MASTERED    The final scored solve checks off only the concepts the learner made
            load-bearing. If c4 carried the answer but c3 never did, c3 does not
            advance toward its 3-of-3 coverage target — and Breakpoint mints
            another unit whose frontier still contains it.
```

## Recall — outside the tree

Every mastered concept starts a reinforcement clock (`3d → 7d → 21d → 60d maintenance`). When one
comes due, it is injected **at a unit boundary** — never mid-loop — as a bare Solve on a fresh
transfer item. No Orient, no Connect.

```text
day 0    c1 mastered in unit-a
day 3    c1 due  ── recall interlude: one new passage, one item whose only defect
                    is an out-of-passage true statement.  Pass → next interval 7d.
day 10   c1 due  ── composed with c3 (strong, not due, same skill) so the item
                    punishes both an outside-knowledge choice and an over-strong
                    one. This is deliberate: forgetting in reading is loss of the
                    *relationships* between defect types, not loss of a fact.
                    Fail → strength drops one step, c1 returns sooner, prior
                    evidence is not erased.
```

## Why this domain stresses the model

Three places where SAT Reading pushes on V3 harder than a build-something domain does:

**The score is not the evidence.** A learner can hit 750 by pattern-matching and still fail every
concept check-off, because the units score the *stated reasoning* and a lucky letter earns nothing.
That is the intended behavior — the system is measuring the reading identity, and the identity is
what generalizes to the next test form. But it means a high-scoring learner may be told they have
not mastered a skill, and the workspace has to make that legible rather than insulting.

**Ability 4 is not independent.** Pacing and triage cannot be trained before the first three
abilities exist, because "abandon this question" is only a correct decision when the learner can
tell a hard question from a slow one. The dependency is real, not stylistic — attempting it early
teaches guessing.

**The field mission has no artifact.** There is nothing to ship. The mission is therefore a
*diagnosis* deliverable, not a production one, and the 25-point judgment dimension is doing all the
work. This is the general shape for any exam-shaped or judgment-shaped domain: when the real world
offers no artifact, ask for the learner's own error post-mortem and grade the post-mortem.

## Invariants this instantiation is checking

| V3 invariant | How it shows up here |
| --- | --- |
| Start from desired performance | Target identity is a reading behavior, not a score |
| Keep only decision moments | "Read the passage" is not a skill; "tell supported from true" is |
| Concepts as causal mechanisms | `c3` is a mechanism with a failure mode, not the label "quantifiers" |
| Generate units from the frontier | `unit-d` exists because `c3`/`c4` are uncovered — nothing was pre-authored |
| Require transfer via constraint mutation | Round 3 cites specific lines, breaking the scan-the-paragraph habit |
| Separate foundation coverage from rating | 1.1's concept check-offs never touch the Glicko rating; skillset units do |
| Require concise real-world proof | One timed module + a named-defect post-mortem, not a study log |
