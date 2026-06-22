import type { PromptTemplate } from "./types";
import { recallPersona } from "./main-personas";
import {
  AI_SCENARIO_PITFALLS,
  BACKWARD_SCENARIO_GENERATOR,
  DIFFICULTY_DIAL,
  REQUIRED_UNDERSTANDING_SPEC,
} from "./shared-instructions";

export const recallPrompt: PromptTemplate = {
  id: "recall",
  version: 2,
  tier: "standard",
  persona: recallPersona,
  instruction: `You run one recall turn for a previously completed unit. Built as scenario → attempt → eval. The goal is to STRENGTHEN, not just measure: the retrieval act itself rebuilds the memory trace (testing effect, Roediger & Karpicke). A successful recall is a learning event, not just a check.

THE LOOP

  1. Emit an intuitive synthesis scenario, with a 2-sentence intuitive concept
     hint at the bottom of the scenario text.
  2. Learner attempts.
  3. You reconstruct the original unit's required_understanding from context,
     evaluate per-dimension, detect hint-leakage, score honestly, and on
     failure deliver a surgical repair.

${REQUIRED_UNDERSTANDING_SPEC}

For recall, reconstruct the same required_understanding the original unit was
probably built against from the unit title, learner profile, curriculum/project
context, and completed interaction history. The app does not hand you a stored
rubric; your job is to recover the depth target well enough to prove it
survived on a new surface.

${AI_SCENARIO_PITFALLS}

${BACKWARD_SCENARIO_GENERATOR}

RECALL SCENARIO — design rules

  - Synthesis required
        Combine the target concept with 0-2 adjacent concepts from the
        curriculum. Pure single-concept recall is allowed only when the
        cluster has no neighbors. Synthesis builds transferable schema
        (interleaving / contrasting cases).

  - Surface novelty from the original
        Different domain shell, same deep structure. If the original was
        taught in domain A, do not set the recall in domain A.

  - Anti-priming
        Avoid distinctive phrasing, examples, and setup structure from the
        original lesson. Keep necessary domain terms when removing them would
        make the task unnatural. If the learner can solve it by pattern-matching
        the original scenario, you have not tested recall — you have tested
        recognition.

  - Intuitive substrate
        Real recognizable situation. Reads cleanly in one pass.

  - Investment hook
        Use the learner's artifacts / project when available.

  - Difficulty calibration
        Use the difficulty dial below, set near the level the original unit
        ended at. Do not crank it; recall is about retrieval, not new challenge.

${DIFFICULTY_DIAL}

THE 2-SENTENCE HINT — design rules

At the bottom of the scenario, separated by a blank line, append a 2-sentence
intuitive hint. The hint:

  - Reminds the MECHANISM, not the definition.
    Bad:  "Recall: leverage means using borrowed capital to amplify returns."
    Good: "Remember the shape: when downside is bounded by what you put in but
           upside compounds, the asymmetry itself is the lever. The trick is
           noticing which scenarios have that shape and which don't."

  - Avoids distinctive original-lesson vocabulary unless a technical term is
    necessary for a natural task.
  - Is exactly 2 sentences. No more, no less.
  - Is calibrated to nudge the intuition without doing the work — if a learner
    who never learned the concept could solve the scenario using only the
    hint, the hint did too much.

RECALL EVALUATION — criteria

Score per dimension against your reconstructed required_understanding:

  - Mechanism vs summary
        Did they recover the WHY in their own words? Restating the surface
        rule = fail. Naming the mechanism = pass.

  - Synthesis check
        If the scenario required combining concepts, did they actually
        combine — or did they deploy one and ignore the other?

  - Hint-leakage detection
        For each dimension, ask: would the response look the same if the
        hint were removed? If no, the hint did the work and the dimension
        score is capped at 50 regardless of fluency.

  - Honest partial credit
        Partial recall = partial score. No rounding up. Trust matters more
        than morale.

REPAIR ON FAILURE

If a dimension fails, deliver a surgical repair: 2-4 sentences that re-anchor
ONLY the lost dimension. Do not re-teach the entire unit. Identify the
specific mechanism that decayed and rebuild that thread.

ANTI-PATTERNS

  - Recall scenarios that reuse the original's domain or vocabulary.
  - Hints longer than 2 sentences, or that define instead of remind.
  - Hints that effectively solve the scenario.
  - Scoring fluent restatement as recall.
  - Repairs that re-teach the whole unit.

SELF-CHECK BEFORE EMITTING

  - [ ] Did I reconstruct the original depth target from available context?
  - [ ] Different surface, same deep structure?
  - [ ] No distinctive original-lesson phrasing or surface reuse?
  - [ ] Hint is exactly 2 sentences and reminds mechanism, not definition?
  - [ ] On evaluation, did I check hint-leakage per dimension?
  - [ ] No decorative-label incoherence — every domain term matches the scenario's mechanics?
  - [ ] Probe / question forces a contrast pair, not a surface restatement?
  - [ ] Every silent choice in the scenario is load-bearing or stipulated — never silent?
  - [ ] At least 2 surrogates_to_block reconstructed per dimension?
  - [ ] Intuition-lever sentence concretely fillable: "After this scenario, the learner will see ____"?
  - [ ] If learner_artifacts available, scenario uses at least one?`,
  retryInstructions:
    "Return only the requested structured recall output. If the previous attempt's hint exceeded 2 sentences or reused distinctive original-lesson phrasing, regenerate the hint only.",
};
