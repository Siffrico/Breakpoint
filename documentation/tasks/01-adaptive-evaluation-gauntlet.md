# Adaptive Evaluation Gauntlet

## Goal

Replace the single fixed education-unit evaluation with a bounded adaptive evaluation system. The learner should still experience one continuous unit chat, but the backend should choose the right evaluation format for the skill being tested.

This task only replaces the current post-teaching gate:

```txt
diagnostic scenario attempt -> concept teaching + check -> static scenario + eval -> pass means unit complete
```

with:

```txt
diagnostic scenario attempt -> concept teaching + check -> adaptive evaluation gauntlet -> pass means unit complete
```

Do not replace the initial diagnostic scenario attempt or the concept teaching + check flow.

## Product Theory

Breakpoint should teach the mechanism slowly enough for understanding, then evaluate with adaptive pressure to test whether the mechanism became usable.

The evaluation system should support:

- intuition-heavy skills: rapid varied probes that test pattern recognition
- deep reasoning skills: fewer longer attempts that test construction and explanation
- standard concepts: one normal scenario when extra pressure is unnecessary

The mode is based on the topic's real mastery signal, not generic difficulty.
Some advanced topics are intuition-dominant because the highest-value skill is
fast recognition under varied surfaces. Some beginner topics may still be
deep-reasoning-dominant if the core work is careful derivation or multi-step
construction.

The AI may choose the evaluation format, but code must enforce strict limits.

## Target Design

Add an evaluation-planning step for `performance_evaluation`, after the learner has already completed the scenario attempt and concept teaching/check portion of the unit.

The evaluator chooses from a bounded schema:

```ts
type EvaluationPlan = {
  mode: "intuition_sprint" | "deep_reasoning" | "standard";
  scenarioCount: 1 | 2 | 3;
  timeLimitSeconds: 30 | 45 | 60 | 300 | 600;
  feedbackMode: "full_after_each";
  reason: string;
};
```

Make the AI's choice easy by giving it explicit mode-selection rules:

- first identify what the scenario actually requires the learner to do at mastery level
- choose the mode that best tests that action, not the mode that sounds hardest
- choose `intuition_sprint` when the unit tests fast recognition, judgment, debugging smell, pattern matching, taste, triage, or selecting the right mechanism under surface variation
- choose `deep_reasoning` when the unit tests math, proof, derivation, architecture, planning, multi-step implementation, tradeoff analysis, or anything where correctness depends on sustained reasoning
- choose `standard` when the skill is neither clearly intuition-heavy nor deep-reasoning-heavy, or when the learner needs a lower-pressure evaluation

Decision heuristic:

```txt
If mastery means "spot the governing pattern quickly across different surfaces"
  -> intuition_sprint

If mastery means "build, derive, prove, plan, or reason through multiple linked steps"
  -> deep_reasoning

If mastery needs both but neither dominates
  -> standard
```

Code enforces:

- fixed scenario count by mode: `intuition_sprint` = 3, `standard` = 2, `deep_reasoning` = 1 by default
- allowed timer values only
- full feedback after every attempt
- after feedback, the learner explicitly clicks `Next scenario`; the timer starts only after the new scenario finishes generating
- valid stage transitions only
- no arbitrary prompt/model selection by the AI
- one aggregate final evaluation after the planned attempts

## Suggested Runtime Mapping

- `intuition_sprint`
  - 3 short scenarios
  - 30-60 seconds each
  - one decision plus one-sentence why
  - full evaluator feedback after each attempt
  - `Next scenario` button appears after feedback until all planned attempts are done
  - aggregate pattern-stability evaluation at the end

- `deep_reasoning`
  - 1 longer scenario by default, assuming a passing score
  - 600 seconds
  - fuller reasoning response
  - full evaluator feedback after each attempt

- `standard`
  - 2 scenarios
  - 300 seconds each
  - normal evaluator feedback
  - `Next scenario` button appears after the first feedback

## Architecture Notes

Use the stage runtime infrastructure:

- teacher stages keep using `education_unit`
- evaluator stages use `evaluate_feedback`
- evaluator context stays cold and filtered
- evaluation plan is persisted in phase-response metadata
- UI owns the timer
- backend owns stage legality and scoring persistence

Recommended flow:

```txt
performance_evaluation
  -> evaluator creates bounded EvaluationPlan
  -> app runs timed scenario attempt(s)
  -> evaluator gives full feedback after each attempt
  -> learner clicks Next scenario when the plan has another scenario
  -> app generates the next scenario, then starts the timer
  -> evaluator produces aggregate score and routing decision
  -> code advances, retries, or repairs
```

## Edge Cases

- If learner times out, persist an empty/timed-out attempt and let evaluator score evidence honestly.
- If learner submits too little text, keep the same scenario unless timeout already happened.
- If the evaluator asks for the wrong count for the selected mode, coerce to the mode default.
- If the evaluator asks for more than the allowed time, clamp to schema limits.
- If the evaluator asks for any feedback mode other than `full_after_each`, reject or coerce to `full_after_each`.
- If the learner is moving to the next scenario, do not start the timer until the next assistant scenario has rendered.
- If deep reasoning fails or is borderline, the evaluator may route to repair or retry the stage, but the default plan stays one 10-minute scenario.
- If the learner shows anxiety or repeated time-pressure failure, fall back to `standard` or `deep_reasoning`.
- If repair is needed, route back only to `concept_instruction` or `guided_application`.

## Why Not Current Eval

One scenario is cheap and simple, but weak as a mastery signal. It can be passed through luck, short-term priming, scenario familiarity, or fluent shallow reasoning.

## Why Not Fixed Three-Probe Eval

Three rapid probes are strong for intuition and pattern recognition, but bad as a universal default. Math, proof, architecture, and other construction-heavy skills often need longer reasoning windows.

## Best Version

Build bounded adaptive evaluation:

```txt
AI chooses the evaluation plan.
Code enforces the boundaries.
UI runs the timer.
UI exposes the Next scenario control.
Evaluator grades the evidence.
```
