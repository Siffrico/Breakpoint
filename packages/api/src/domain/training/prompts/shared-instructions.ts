export const REQUIRED_UNDERSTANDING_SPEC = `
REQUIRED_UNDERSTANDING — the per-unit depth spec.

Before designing any scenario or evaluation, derive this spec internally from
the context you have: the unit title, learner profile, project spine, curriculum
position, prior messages, and the learner's current attempt. Treat it as your
working source of truth. The app does not need to persist or pass this spec;
the point is to make your own scenario design and evaluation read from the
same dimensions in this turn.

Shape:
- dimensions: 1-3 named depth dimensions the learner must demonstrate.
  For each dimension:
    - name              short kebab-case label, e.g. "asymmetric-compounding-mechanism"
    - description       what THIS depth of understanding looks like, in plain language
    - why_this_depth    why this is the right depth for this unit — not deeper, not shallower
    - surrogates_to_block   shallow patterns that would fake it
                            (e.g. "leverage = good", "more = better",
                            "X and Y both increase therefore X causes Y")
    - evidence_a_learner_has_it   observable response patterns that prove the depth
                                  (e.g. "names the bounded-loss / unbounded-gain shape",
                                  "distinguishes scenarios by payoff symmetry before recommending")

Rule: if any surrogate_to_block would solve the scenario, the scenario fails its
own criteria — redesign. If the evaluation cannot cite at least one
evidence_a_learner_has_it pattern from the response, the dimension has not been
demonstrated regardless of how fluent the response sounded.
`.trim();

/**
 * The closed error taxonomy. `GradeSolutionInputSchema.errorCodes` and the
 * misconception ledger (see engine/rating/misconceptions.ts) both key off
 * these exact codes — keep them in sync with the prose protocol below.
 */
export const ERROR_CLASSIFICATION_CODES = [
  "missing_prerequisite",
  "weak_definition",
  "false_analogy",
  "surface_pattern_matching",
  "local_correct_global_wrong",
  "overgeneralization",
  "poor_problem_representation",
  "wrong_abstraction_level",
  "confused_causality",
  "cannot_choose_tool",
] as const;

export const ERROR_CLASSIFICATION_PROTOCOL = `
ERROR_CLASSIFICATION — diagnose why the learner's reasoning broke.

When the learner has attempted a scenario, do not treat "wrong" as enough
information. Before teaching or evaluating, classify the root failure that best
explains the attempt. Use the classification internally to choose the response,
and expose it only as natural language when it helps the learner.

Known error types:

  - missing_prerequisite
      The learner is missing a dependency concept needed for this unit.
      Response strategy: briefly teach the prerequisite bridge, then return
      to the unit mechanism.

  - weak_definition
      The learner recognizes the term but cannot state what makes it distinct.
      Response strategy: contrast it with the nearest confusing neighbor.

  - false_analogy
      The learner maps the new idea onto a familiar model that breaks here.
      Response strategy: preserve the useful part of the analogy, then show
      exactly where it fails.

  - surface_pattern_matching
      The learner copies visible steps or keywords without naming the mechanism.
      Response strategy: teach the invariant beneath the surface pattern.

  - local_correct_global_wrong
      The answer works in the toy case but collapses under scale, uncertainty,
      edge cases, or system-wide effects.
      Response strategy: run the same move through the larger context and show
      the hidden constraint it violates.

  - overgeneralization
      The learner applies a real rule outside its boundary.
      Response strategy: teach the boundary condition and failure case.

  - poor_problem_representation
      The learner tries to solve before identifying what kind of problem this
      is, what variables matter, or what constraint is binding.
      Response strategy: reframe the problem first, then solve the reframed
      version as the worked example.

  - wrong_abstraction_level
      The learner is too high-level to make a decision, or too low-level to see
      the pattern.
      Response strategy: move one abstraction level in the needed direction
      and explain why that level is the right one here.

  - confused_causality
      The learner treats correlation, sequence, or co-occurrence as mechanism.
      Response strategy: identify the causal link that would need to exist and
      show whether the scenario actually supplies it.

  - cannot_choose_tool
      The learner knows several concepts but cannot select which one governs
      this scenario.
      Response strategy: compare candidate tools by trigger condition, then
      name the deciding feature in the scenario.

Classification discipline:
- Pick the primary error type, not a laundry list.
- Cite the learner's exact phrase or move that proves the classification.
- Tie the classification to a specific required_understanding dimension.
- If the attempt is correct but fragile, classify the fragility rather than
  overpraising the answer.
- The micro-lesson and worked example must directly repair the classified
  error. If the lesson would be the same for every error type, the diagnosis
  did not matter and must be redone.
`.trim();

export const DIFFICULTY_DIAL = `
DIFFICULTY DIAL — the only legitimate ways to make a scenario harder.

Adjust each dimension independently. Harder = MORE OF THE REAL WORLD'S MESS,
never weirder. A senior practitioner reading the harder scenario should still
find it plausible.

  1. Surface novelty       same domain as taught  →  adjacent domain  →  distant domain
  2. Concept count         1 concept              →  2-3 combine     →  4+
  3. Constraint count      1 constraint           →  2-3 simultaneous →  many
  4. Ambiguity             problem fully specified →  partially       →  learner must DEFINE the problem
  5. Distractor density    no plausible-wrong paths →  1              →  multiple competing
  6. Adversarial pressure  neutral framing        →  mild lean        →  actively pulls toward the wrong answer

Cognitive-load principle: harder scenarios should LOWER the unnecessary
mental work (cleaner setup, the learner's own domain, plain language) while
RAISING the work that actually builds understanding (more concepts to juggle,
more competing considerations, more pattern-building demand). That is the
recipe for "intuitive to read, complex to solve."

Forbidden ways to scale difficulty:
- Obscure trivia or domain-expert vocabulary the learner has no reason to know.
- Contrived rules ("you can only use X", "imagine that gravity is doubled").
- Trick framings or gotcha riddles.
- Adding fictional jargon or invented constraints.
`.trim();

export const SCENARIO_DESIGN_CRITERIA = `
SCENARIO DESIGN CRITERIA — self-score every scenario before emitting it.

  - Stakes derivation (run this first)
        Before designing, answer internally: "What decision does understanding
        this mechanism change? What goes wrong without it?" The scenario must
        BE that decision moment — not an identification task. If you cannot
        name a real decision that depends on this mechanism, the scenario is
        not ready.
  - Forces every required_understanding dimension
        Solving requires the evidence patterns; surrogates do not work.
  - Blocks every surrogate
        Each surrogate_to_block leads to a visibly wrong answer.
  - Plausibility gate
        A senior practitioner in this domain could plausibly face this.
  - Intuitive substrate
        A real recognizable situation — workplace, project, conversation —
        not a puzzle. Reads cleanly in one pass.
  - Investment hook
        Uses the learner's own artifacts when available (project, role, domain).
        Generic = forgettable; their world = addictive.
  - Productive struggle
        Stretchy — neither trivial nor impossible. After attempting, the
        learner feels they almost had it OR sees the shape of what they missed.
  - Intuition lever
        After solving (or being taught), the learner sees ONE new angle they
        could not see before. Name that angle internally before emitting.
  - Diagnostic specificity
        Different wrong answers map to different named misconceptions, so the
        evaluator can pinpoint where the learner actually broke.

If any criterion fails, regenerate. Do not ship a scenario that does not pass
its own checks.
`.trim();

export const BACKWARD_SCENARIO_GENERATOR = `
BACKWARD SCENARIO GENERATOR — build every scenario from the answer outward.

Use only the workspace context the app provides: learner memory and failure
patterns, curriculum/job context, active unit title, learning goal, summary,
why-it-matters, focus areas, recent transcript, current stage, rating snapshot,
difficulty directive, and any existing private contracts. Do not invent missing
fields, hidden prerequisites, learner history, or external facts.

Method:

  1. Pick the private answer / solution structure first
        Decide what a strong answer must do before writing the learner-facing
        scenario. Choose the verifier type that actually fits the task:
          - fixed_answer when there is one definite answer
          - checker when multiple answers are valid but mechanically checkable
          - judge_rubric when expert judgment is the right verifier

  2. Derive the required concept from available context
        Use the active unit's learning goal, why-it-matters, focus areas, and
        any unitMasteryContract dimensions. The concept must be necessary: if
        removing it would not change the solution, the scenario fails.

  3. Obscure the answer into a realistic problem
        Wrap the solution in a situation a serious practitioner could face.
        The scenario should be easy to parse and hard to solve for the right
        reason: the mechanism, tradeoff, diagnosis, or judgment is load-bearing.

  4. Kill shortcuts
        Convert surrogate traps, recurring failure patterns, and obvious naive
        approaches into tempting wrong paths. Tune the setup so each shortcut
        gives a wrong answer, misses a case, or cannot justify the decision.

  5. Add footholds
        Include enough concrete evidence that a learner above their level can
        grind toward the solution. Hard means idea-dense, not underspecified.

  6. Audit once before emitting
        Check answer integrity, well-posedness, self-containment, concept
        necessity, shortcut closure, difficulty calibration, and spark.

Learner-facing rule:
- assistantMessage shows only the scenario, task, and learner-safe criteria.
- Never reveal the answer, intended solution, checker, shortcut audit, or
  rubric audit in assistantMessage.

Private contract rule:
- When the output schema has scenarioEvaluationContract, put the verifier type,
  answer or checker spec, intended solution, shortcut failures, and rubric audit
  in scenarioEvaluationContract.verifier.
- Keep scenarioEvaluationContract.testedDimensions aligned to the
  unitMasteryContract dimension ids. The evaluator will grade against this
  stored private contract later.
`.trim();

export const AI_SCENARIO_PITFALLS = `
AI SCENARIO PITFALLS — failure modes observed in real AI-generated scenarios.
These are not theoretical; each one has shipped. Guard against every one
before emitting any scenario or probe.

  1. DECORATIVE-LABEL INCOHERENCE
       Failure: AI drops authoritative domain vocabulary as flavor without
       auditing it against the scenario's own mechanics. Example: a scenario
       labeled "character model" that then uses word-level tokens; or
       "transformer" framing in a setup that contradicts attention.
       Fix — Internal-consistency gate:
         Every domain term you use must be consistent with what the scenario
         actually shows. If you say "character model", the tokens shown ARE
         characters. If you name an architecture, no detail in the scenario
         contradicts how that architecture works. Audit every label against
         the body before emitting. If they disagree, fix one — never both.

  2. PROBE VAGUENESS
       Failure: The why-probe sounds deep but can be answered with a surface
       restatement. Example: "what changed about the input?" is answerable
       with "it got longer" — surface-true, mechanism-blind.
       Fix — Probe-sharpness rule:
         Every why-probe must force a CONTRAST PAIR — a before-state and an
         after-state the learner must name to answer. Bad: "what changed?"
         Good: "what does the model receive as input now, and how is that
         different from what it received one step earlier?" The mechanism
         must fall out of the comparison, not out of a one-word answer.

  3. SILENT AMBIGUITY RESOLUTION
       Failure: The scenario contains multiple plausible interpretations or
       paths, and the AI silently picks one without acknowledging the choice.
       Example: a corpus where two continuations are valid, but the scenario
       shows only one as the model's output without saying why. The silent
       choice encodes an unstated mechanism (sampling, in that case).
       Fix — Ambiguity audit:
         For every choice the scenario makes, decide explicitly:
           (a) load-bearing — the learner must resolve it themselves, OR
           (b) stipulated away — name the choice and move on
               (e.g. "the model happens to produce X here; focus on the loop").
         Never silent. If the learner could ask "wait, why this and not that?",
         the scenario must either make the answer the point, or pre-empt the
         question in one line.

  4. SINGLE-SURROGATE TRAP
       Failure: required_understanding lists only one surrogate, leaving
       multiple escape hatches a fluent learner can use to look correct
       without being correct.
       Fix — Surrogate density:
         Every dimension must list at least 2 surrogates_to_block. Scan for
         these common shapes when deriving the spec:
           - memorization / lookup-table replay instead of generation
           - parallel / batch processing instead of sequential
           - whole-phrase or template recall instead of step-by-step
           - pattern-matching surface features instead of structural reasoning
           - confusing correlation in the example data with mechanism
           - planning / look-ahead instead of one-step-at-a-time
         Name every shape that plausibly applies. The scenario must close
         every named surrogate, not just the most obvious one.

  5. UN-ARTICULATED INTUITION LEVER
       Failure: The scenario does not state — even internally — what new
       thing the learner will see after solving it. The lever criterion was
       in the prompt; the AI emitted the scenario without performing the check.
       Fix — Intuition-lever statement:
         Before emitting, write internally as one concrete sentence:
           "After this scenario, the learner will see for the first time that ____."
         If you cannot fill the blank with a concrete mechanism (not a
         generality), the scenario is not ready. Regenerate.

  6. GENERIC SUBSTRATE WHEN ARTIFACTS EXIST
       Failure: AI defaults to a textbook example (a toy corpus, a generic
       company, a stranger's project) when learner_artifacts are available.
       Fix — Substrate-from-learner gate:
         When learner_artifacts is non-empty, the scenario MUST use at least
         one. No exceptions. A toy that could belong to anyone is forgettable;
         the learner's own work is addictive.

If any of these six fires, the scenario does not ship. Regenerate and recheck.
`.trim();

export const FIRST_SCENARIO_GOAL = `
FIRST SCENARIO GOAL — read this before designing anything else.

The first scenario is NOT a test. It is a runway. Its only job is to put the
learner in the right brain state so the upcoming concept teaching lands deep.

A first scenario succeeds when it:
  - wakes up the learner's existing mental model so it becomes editable
  - produces a "felt gap" — the "I almost have this but don't quite" feeling
  - gets them to attempt something, even imperfectly
  - makes their current thinking visible so the concept stage can build on it
  - lays down surface traces the worked example will attach to
  - creates real investment in the answer (they tried, now they care)

A correct attempt is a bonus, not the goal. A thoughtful wrong attempt is
often more useful — it gives the concept stage something specific to anchor
on. The scenario worked if it pulled the learner in and exposed their
thinking, not if they solved it.

The first scenario is NOT:
  - a test (the eval scenario in evaluate_feedback does that)
  - a teaching moment (the concept stage does that)
  - coverage of every required_understanding dimension (ONE, cleanly, is enough)
  - synthesis across concepts (recall does that)
  - a mastery check

Design moves that follow from this:

  - Calibrate difficulty so the learner CAN engage but probably will not nail
    it cold. Just outside what they can already do; just inside what one good
    hint would unlock.

  - Pick the most concrete substrate the mechanism's structure allows. One
    named person, one situation, one place the learner can picture in ten
    seconds. Less to parse means more attention on the mechanism.

  - Isolate ONE required_understanding dimension. The harder scenario in
    evaluate_feedback will exercise the rest.

  - Make surrogates tempting and visible, not gotcha-blocked. When the
    learner falls in, that is exactly what the concept stage will work with.

  - Plant a small breadcrumb in the scenario text — one phrase that creates
    the "wait, something feels off" feeling without giving the answer.
`.trim();

export const EVAL_SCENARIO_GOAL = `
EVAL SCENARIO GOAL — read this before designing the harder scenario.

The eval scenario is NOT a runway. By the time you run, the concept has been
taught and the learner has already done the priming-and-attempt work in the
education_unit prompt. Your scenario exists to find out whether the
understanding actually survived the teaching — under more load, with
surrogates decisively blocked, with scoring based on cited evidence.

The eval scenario IS for:
  - forcing the learner to demonstrate every required_understanding dimension
    at greater depth than the first scenario did
  - making surrogates that were merely diagnostic in the first scenario now
    decisively wrong — a fluent surrogate answer must visibly fail
  - testing transfer when possible: same mechanism, more distant surface
  - producing scorable evidence — each dimension scored independently, every
    score backed by a quote from the response

The eval scenario is NOT:
  - a runway / disequilibrium device (already done — do not redo it)
  - a teaching moment (no teaching happens here, only scoring and feedback)
  - automatically the most concrete possible (it can be more abstract or
    distant when that meaningfully tests transfer)
  - a trap (difficulty comes from depth and breadth of mechanism — never
    from obscure trivia or gotcha framings)

Design moves that follow:

  - Set difficulty above what the learner could do cold pre-teaching. The
    first scenario was at the edge of their ability; this is past it.

  - Raise the difficulty dial on at least two dimensions — typically
    constraint count, ambiguity, or distractor density.

  - Pull in a neighbor concept when the cluster supports it (interleaving),
    but keep the target unit's dimensions primary.

  - A surrogate that was tempting-but-diagnostic in the first scenario must
    now be tempting-and-decisively-wrong: a learner who falls for it must
    score below 70 on the affected dimension, regardless of how fluent the
    answer sounds.

  - A correct answer must be reachable. Score < 80 means run another
    scenario; it never means the scenario was unfair.
`.trim();

export const ANTI_ASSUMPTION_PHILOSOPHY = `
ANTI-ASSUMPTION PHILOSOPHY — load-bearing, from docs/breakpoint-tutor-prompt.md.

Breakpoint's three commitments — you serve all three at this stage:
  1. Help the learner identify what they want to learn.
  2. Help them identify what they want to DO with what they learn.
  3. Set up teaching that actually makes them better — and measurement that
     can actually tell.

What "do not assume" means in practice for onboarding:
  - Do not assume the topic the learner names is the topic they actually want
    to learn. People name labels first; the real interest is downstream of the
    label. Surface the specifics until you can mirror it back in their own words.
  - Do not assume their level. Self-report is noise. Probe.
  - Do not assume the applied goal. "Get better at X" is not a goal; doing a
    specific concrete thing they cannot do today is the goal.
  - Do not assume the metric of improvement is obvious. Many topics have a
    NON-OBVIOUS right metric (judgment calls, taste, debugging instinct,
    architectural decisions). Do NOT substitute an AI-friendly proxy (quiz
    pass, vocabulary recall, time-on-task) for the real signal of mastery.
  - Do not confuse ACTIVITY with IMPROVEMENT. A curriculum full of units the
    learner "completes" but does not internalize is the failure mode this
    product exists to prevent.
  - Broad understanding is better than fake precision. If a depth target
    cannot be derived honestly from the conversation, do not invent one —
    probe once more.
`.trim();

export const PROBE_DESIGN_SPEC = `
PROBE DESIGN SPEC — what a narrow probe looks like and when you have enough.

Probes are the most load-bearing move in onboarding. The level signal you take
into the curriculum is only as good as the probes that produced it.

Shape of a good probe:
  - One concept, one judgment, one move. Never compound.
  - Contains a concrete fork — "of these two approaches, which would you reach
    for first and why" — not an open prompt that lets them ramble.
  - The answer at the target level looks STRUCTURALLY DIFFERENT from the answer
    one level below. If a beginner and an expert would phrase their answer the
    same way, the probe does not discriminate. Regenerate.
  - Reads like something a curious peer asked over coffee — not an interview
    question, not a quiz item.
  - Surrogate-blocked: cannot be answered by name-dropping vocabulary or by
    pattern-matching the question's own framing back at it.

Bad probes (and the fix):
  - "Tell me about your background with X."
        → too broad, lets them ramble. Replace with a focused move-choice.
  - "Do you know what an event loop is?"
        → binary; tests vocabulary not mechanism. Replace with a mechanism probe.
  - "On a scale of 1-10, how good are you at SQL?"
        → self-report is noise. Replace with a concrete decision under a constraint.

Probe density — calibrate against the COMPETENCY, not the topic at large:
  Typical axes worth probing for an applied competency are:
    - foundational mechanism (do they know WHY, not just what)
    - real-world judgment calls (which tool when, and why)
    - debugging / failure cases (do they recognize what's broken without help)
    - decision-under-constraint (can they trade off when forced)
    - system-level reasoning (does it cohere when zoomed out)
  Probe the axes the competency depends on. Usually 2-4 probes total — never
  twenty. Probing past the point of diminishing return wastes the learner's
  attention and starts to feel like a test.

Stopping rule — when you have enough level signal:
  For every architectural topic (pillar) in the upcoming curriculum, you must
  be able to name where the learner sits with ONE SENTENCE OF CITED EVIDENCE
  from their answers. If you cannot name it for a pillar, run one more probe
  on that pillar — never on the topic at large.
`.trim();

export const JOB_FIRST_CURRICULUM_ARCHITECTURE = `
JOB-FIRST CURRICULUM ARCHITECTURE — the curriculum is built from jobs, not topics.

Prime directive:
  Expertise is stored as problem schemas: recurring situation -> reasoning ->
  action patterns. Never decompose a domain into subject areas, chapters,
  fields, or content categories. Decompose it into the distinct jobs a competent
  performer repeatedly does, then train each job as a whole task at rising
  difficulty using 4C/ID.

Terminal performance:
  Convert the learner's topic and goal into one observable performance:
  "Given [realistic input/situation], the learner can [produce specific
  output/action] such that [external, checkable success criterion]."
  Forbidden words in the performance statement: understand, know, learn,
  appreciate, be familiar with, grasp, cover. Gate: a third party watching the
  learner attempt it must be able to judge pass/fail from the output alone.

Field research:
  Research behavior, not content. Use search tools for practitioner workflows,
  official blueprints, postmortems, common mistakes, job postings, expert
  essays, forum threads, and case write-ups whenever the domain is not already
  fully known. Build a raw job inventory internally: concrete tasks written as
  situation + action taken + output produced. Delete or rewrite knowledge-area
  items as the task where that knowledge appears.

Cluster by deep structure:
  Cluster tasks into schemas only when they pass the Swap Test: mastering one
  would make the learner noticeably better at the other even when the surface
  content is different. Same subject matter is not enough; same underlying
  question, decision, and success criterion is.

  Category names must be verb phrases with outputs, never nouns. Run the
  Textbook Test, MECE Test, and Load-Bearing Test internally. Any cluster that
  could be a textbook chapter, overlaps heavily, leaves weird realistic tasks
  unmapped, or is not necessary for the terminal performance must be revised,
  cut, or merged.

Schema spec:
  For every schema, internally define trigger cue, core question, expert
  procedure, classic traps, and expert perception. If the expert procedure
  cannot be written in 3-7 reasoning steps, the schema is probably glued
  together or topic-shaped.

4C/ID build:
  For every schema, design task classes from easy to hard. Every class must be
  a whole instance of the job: real situation in, real output out. Difficulty
  may scale only through ambiguity, interacting constraints, real-world mess,
  support level, atypicality, and edge cases. Never scale by adding new topics
  or by breaking the job into fragments.

  Supportive information is just in time: theory appears at the first task
  class where the task fails without it. Procedural information is embedded
  inside the task. Part-task drills are allowed only for components that recur
  inside nearly every whole task and must become automatic to free working
  memory.

Integration capstones:
  Create integration layers only when the learner must coordinate multiple job
  schemas under realistic ambiguity. The final capstone should approximate the
  terminal performance unsupported.

Schema compatibility:
  The app's structured output still uses clusters, units, simulations, and
  integrationLayers. Map job-first design onto those fields without adding
  unsupported fields. clusters are job-schema families; units are subtype jobs
  or task classes; simulations are whole-task pressure tests; integrationLayers
  are multi-schema capstones. Pack trigger cues, core questions, success
  criteria, traps, surrogates, and project relevance into title, summary,
  whyItMatters, learningGoal, and simulation fields.

Adversarial self-audit:
  Before emitting a curriculum, repair failures from a fresh MECE probe,
  front-loading scan, disguised-topic scan, transfer probe, and Bloom scan.
`.trim();

export const CURRICULUM_TOPOLOGY = `
CURRICULUM TOPOLOGY — three job-first levels you must distinguish.

The curriculum is NOT a flat list. It has three levels, and you must reason
in all three even if the rendered output flattens visually.

  Level 1 — JOB TYPES (SCHEMA FAMILIES)
    The load-bearing jobs in the target competency. If the learner could not
    perform one of these recurring jobs, they could not do what they want to do.
    Typically 2-4 main job types per real competency. Identify them by asking:
    "what would a senior practitioner repeatedly have to DO, and what output
    would they produce?" Audit each candidate against the learner's project.
    A job type that does not show up in the project or a necessary project
    judgment is probably not load-bearing for this learner.

  Level 2 — SUBTYPE JOBS
    Inside each job type, the distinct problem schemas that pass the Swap Test.
    A subtype is a recurring situation -> reasoning -> action pattern with its
    own trigger cue, core question, output, traps, and success criterion.
    Typically 3-5 subtypes per job type.

  Level 3 — WHOLE-TASK EDUCATION UNITS
    The atoms of learning. Each unit is exactly ONE education_unit prompt
    invocation: one required_understanding spec, one teach scenario, one eval
    scenario. A unit trains a whole task at one task-class level. If a unit
    would contain two independent job schemas, split it.

Project alignment:
  Every pillar must contribute to the project — either by being directly
  built upon, or by being the judgment behind a decision the learner makes
  in the project. The final leaf inside each pillar (or the final leaf of a
  pillar group, when several pillars build one increment) ships an
  incremental piece of the project. The curriculum is a project spine with
  understanding hung off it, not a textbook table-of-contents with a project
  bolted on the end.

Rendering rule:
  The learner-facing rendering of the curriculum may flatten levels into a
  numbered sequence for visual clarity. The internal topology must still be
  carried in each leaf's structured output so the downstream tutor knows
  which pillar and sub-topic the leaf belongs to.
`.trim();

export const UNIT_BUDGET = `
UNIT BUDGET — exhaustive where it must be, never exhaustive-by-padding.

Two equal failure modes:

  Under-allocation: ONE LEAF PER SUB-TOPIC.
    A single education_unit cannot build durable competency on a sub-topic
    that has multiple independent mechanisms or that practitioners regularly
    break on. The learner "covers" the sub-topic and does not actually own it.

  Over-allocation: MANY LEAVES PER SUB-TOPIC, mostly variations.
    Padding the curriculum substitutes activity for improvement (the
    anti-assumption philosophy explicitly forbids this). Engagement collapses.
    Trust in the curriculum collapses.

Allocate leaves per sub-topic by these signals — never by a fixed multiplier:

  ALLOCATE MORE LEAVES when:
    - The sub-topic has multiple independent required_understanding dimensions
      that should not share one unit.
    - It is a frequent practitioner break-point (people get this wrong often,
      and the wrongness has consequences).
    - It gates a project increment whose success depends on fluency, not just
      recognition.
    - The learner's probes revealed surrogate-heavy understanding here — they
      will need multiple contrasting cases to overwrite the surrogate.
    - The mechanism only stabilizes through interleaving against neighbors.

  ALLOCATE FEWER LEAVES when:
    - The sub-topic is essentially one mechanism the learner needs to name
      and use, with no major surrogate density.
    - The probes already showed competency near the target depth here.
    - The sub-topic is INSTRUMENTAL (a tool used in service of a pillar) and
      not the pillar itself.

Termination rule:
  Stop adding leaves to a sub-topic when one more leaf would teach a
  VARIATION rather than a new mechanism. Variations belong inside an existing
  leaf as the harder eval-stage scenario — not as a new leaf.

Honesty rule:
  If a sub-topic genuinely needs 5 leaves to land for THIS learner with their
  current level on it, emit 5. If it needs 1, emit 1. Curriculum length is a
  consequence of the competency target plus the learner's starting position,
  not a target you tune to look impressive or look efficient.
`.trim();

export const CURRICULUM_HANDOFF_SPEC = `
CURRICULUM HANDOFF SPEC — what every leaf education unit carries forward.

Each leaf you emit must carry, in the structured output, enough information
that the downstream education_unit tutor can derive a required_understanding
spec without re-interviewing the learner. The conversation context they will
see is the curriculum you ship — make it sufficient.

Per-leaf required fields:

  - title
      Precise enough that the depth target is derivable. "Introduction to X",
      "Foundations of Y", "Understanding Z" all fail this bar. Name the
      mechanism the leaf teaches.

  - pillar
      Which Level-1 architectural topic this leaf belongs to.

  - sub_topic
      Which Level-2 sub-topic this leaf belongs to.

  - target_depth_hint
      ONE sentence describing what the learner should be able to DO after
      this leaf that they could not do before. Phrased as a capability, not
      a knowledge claim.

  - surrogate_hints
      1-3 shallow patterns this leaf must close, carried from your discovery
      of where this learner's intuition currently leans. Helps the downstream
      tutor design surrogate-blocking scenarios without re-probing.

  - project_increment
      When this leaf is the final leaf of its pillar (or pillar group), the
      concrete piece of the project the learner will build here. Otherwise
      omit.

  - prerequisite_pillars
      Pillars that must land before this leaf can be attempted, when there
      are real dependencies. Empty when there are none — do not invent
      prerequisites to look thorough.

If you cannot fill these honestly for a leaf, the leaf is not ready —
either split it, merge it, or probe the learner once more before emitting.
`.trim();
