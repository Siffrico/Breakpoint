<p align="center">
  <img src="images/Breakpoint-dev.png" alt="Breakpoint" width="160" />
</p>

<h1 align="center">Breakpoint</h1>

<p align="center">
  An AI tutor built from the mechanics of how expertise is acquired.
</p>

---

Breakpoint takes a goal, works out what an expert at that goal actually does, and trains you on it. You explain a fix, rank options, or draft a plan, and an independent critic locates the exact point where your reasoning split from an expert's. A rating, a mastery gate, and a decay schedule track what you can actually do. The time you spend in the app shows up as more of those things you can do.

Every piece of the system answers one question: **what would have to be true for a person to get measurably better at this, and how would we know?**

## The idea

Most of what an expert knows is tacit: the cue they notice first, the check they never skip, the plausible move they know is a trap. Textbooks tend to leave this out because it is hard to write down. Practice is where it gets built: a realistic situation, a decision, and feedback that names the specific wrong idea.

Breakpoint is organized around five claims:

1. **Learning is defined by the outcome, not the subject.** "Pass the AP Calc BC free-response section" and "learn calculus" produce different curricula. The system pins down a concrete result before it builds anything.
2. **Curriculum comes from expert performance.** For each outcome, an agent researches primary sources, scoring guides, expert teardowns, and post-mortems. It extracts the skills, decision points, and intermediate-level traps that separate strong work from plausible work.
3. **Every exercise goes from a situation to a result.** Every scenario has an initial state A and a desired state B, and the learner does the thinking that connects them. The AI supplies the setup and boilerplate so the effort lands on judgment.
4. **Feedback names the first divergence.** The critic rebuilds the move sequence an expert would run, walks it beside the learner's, and reports where they split. It quotes the learner's own words as evidence. Almost every miss is one wrong idea, not a missing fact.
5. **Progress is measured, not asserted.** Difficulty is computed from a scenario's structure, not from the model's opinion of its own output. Ratings update from graded attempts, and every update logs what the engine predicted before it saw the outcome, so miscalibration is visible.

## How a learner moves through it

```text
 goal ──▶ onboarding chat ──▶ confirmed outcomes ──▶ outcome compiler ──▶ curriculum
              │                                          │
     starting-point probe                     Skill Map + Practice Contract
     (seeds the rating)                       (researched, per outcome)
                                                         │
                                                         ▼
                              ┌──────────── education unit ────────────┐
                              │                                        │
                              │  Teach ─▶ Learn round ─▶ Exam round    │
                              │    ▲          ▲              │         │
                              │    │          └── missed ────┤         │
                              │    └──── "never learned it" ─┘         │
                              │                              │ passed  │
                              └──────────────────────────────┼─────────┘
                                                             ▼
                                         mastery ─▶ rating update ─▶ recall schedule
                                                                       (3 · 7 · 21 · 60 days)
```

**Onboarding.** A chat agent works out what the learner wants to be able to do and why. It asks once where they are starting from, using concrete experiences from the domain rather than self-ratings, and turns the answer into a starting rating. It then proposes outcomes for the learner to confirm.

**Outcome compilation.** Each confirmed outcome compiles into two connected artifacts:

- **Skill Map**: the smallest repeatable moves the outcome depends on, the mechanisms behind them, high-leverage expert judgment, and the traps that catch intermediate learners (why the wrong move feels right, and the cue that exposes it).
- **Practice Contract**: the expert decision spine for a real task, whole-task types, observable evaluation criteria, three difficulty bands, and a `neverDo` list of ways a task could look valid while failing to measure the skill.

Before it returns, the compiler tries to construct a learner who could pass through rote recall, answer-pattern gaming, or fluent explanations with no causal content. If such a learner could pass, it revises the contract. See [outcome-compiler.ts](packages/api/src/domain/training/outcome-curriculum/outcome-compiler.ts).

**Education units.** Every unit has the same three phases:

| Phase           | What happens                                                                                                                    | Why                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Teach**       | An easy version of the idea, a worked example that shows the intuitive wrong move breaking, then an explain-back on a new case. | Installs a followable heuristic and checks it transferred before practice begins. |
| **Learn round** | Three parts on one scenario, with feedback after each. The next part targets the learner's most recent hypothesis.              | Practice with fast, specific correction. Unrated.                                 |
| **Exam round**  | Three parts at once, graded in parallel by independent critics, with feedback delivered in question order.                      | Rated evidence. All three must pass for mastery.                                  |

A failed exam sends the learner to a Learn round on only the criteria they missed. If the critic diagnoses that a concept was never learned, the unit goes back to Teach. After three failed exams the unit closes without mastery, and its targets return to the pool for a later unit. That way a grader that is too strict can't trap a learner in one unit.

**Recall.** Mastery starts a spaced-retrieval clock on each concept. When a concept comes due, the learner gets a new applied scenario that differs from any they have seen. A pass widens the interval (3 → 7 → 21 → 60 days). A miss starts a correction loop: the system teaches the gap and asks smaller application questions until the learner applies it. Agreeing or saying "I understand" doesn't count. Then the concept is rescheduled at a shorter interval.

## Architecture

```text
apps/nextjs                 Next.js 16 app: onboarding, curriculum, workspace, settings
   │  tRPC + streaming chat
   ▼
packages/api
   ├─ router/               thin tRPC procedures
   ├─ workspace-chat.ts     streaming entrypoint for unit turns
   ├─ domain/training/
   │   ├─ agents/                 onboarding chat, starting-point probe
   │   ├─ outcome-curriculum/     outcome → Skill Map + Practice Contract
   │   ├─ education-unit/         unit state, policy, mentor + critic agents
   │   ├─ engine/
   │   │   ├─ model-router.ts         one place models are chosen
   │   │   ├─ invoke-structured-model one path for schema-checked calls
   │   │   └─ rating/                 Glicko-2, Goldilocks ladder, difficulty priors
   │   └─ recall/                 spaced retrieval + correction loop
   └─ repositories/         all Drizzle access
packages/db                 Drizzle schema (Supabase Postgres), split by domain
packages/validators         Zod v4 contracts shared by API, DB, and UI
packages/auth               Better Auth
packages/ui                 shared Tailwind v4 primitives
```

### Design decisions

**The unit is facts, a policy, and a runner.** A unit's persisted cursor records only what happened: lessons given, explanations, parts, and grades. The current position is never stored; it is derived from that history. [`unit-policy.ts`](packages/api/src/domain/training/education-unit/unit-policy.ts) holds a single function, `nextMove(steps)`, which is the only place the Teach → Learn → Exam structure exists. The runner in [`run-unit-turn.ts`](packages/api/src/domain/training/education-unit/run-unit-turn.ts) carries out whatever move it returns. Reshaping a unit means editing one file.

**The model never chooses difficulty.** A deterministic ladder in [`engine/rating/decide.ts`](packages/api/src/domain/training/engine/rating/decide.ts) reads the learner's Glicko-2 rating and recent evidence. It then picks the band, the support level (worked example → guided → none), and the target. Scenario difficulty comes from counted structure: reasoning steps, withheld givens, and plausible alternatives. It does not come from the generator's estimate of its own output. All the tuning lives in [`engine/rating/policy.ts`](packages/api/src/domain/training/engine/rating/policy.ts).

**Grading is separate from teaching.** The mentor that teaches and poses parts never grades them. Each part goes to a critic running in a fresh context, with a private verifier the learner never sees. The critic must quote the learner verbatim as evidence for every criterion it marks. Its error codes come from a closed taxonomy, so they can feed the misconception ledger.

**Model output has a contract before it drives behavior.** Every structured call goes through one invocation path and is checked against a Zod schema from `@acme/validators`. The database stores the same shapes, so the engine and the storage can't drift apart.

**Domain logic doesn't touch the database.** Routers wire requests to domain workflows, and workflows call repositories. The rating engine, unit policy, and recall scheduler are pure functions that take `now` and their inputs as arguments, which makes them directly testable. See the [architecture decision record](documentation/architecture/0001-api-domain-boundaries.md).

**Long turns stream.** Unit turns stream text along with typed status events. Exam parts are graded concurrently, and their feedback is delivered in question order.

### Stack

Next.js 16 · React 19 · tRPC v11 · Vercel AI SDK · Effect · Drizzle ORM · Supabase Postgres · Better Auth · Zod v4 · Tailwind CSS v4 · Turborepo + pnpm

## Running it locally

Requirements: Node.js 22.21+ and pnpm, a Postgres database (Supabase works out of the box), and an [OpenRouter](https://openrouter.ai) API key.

```bash
pnpm i
cp .env.example .env
```

Fill in `.env`:

| Variable                                          | Purpose                                                                                                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_URL`                                    | Pooled connection string (Supabase transaction pooler, port 6543). SSL is required.                                                                |
| `AUTH_SECRET`                                     | Generate with `openssl rand -base64 32`.                                                                                                           |
| `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET`         | Discord OAuth app. Register `http://localhost:3000/api/auth/callback/discord` as a redirect URI. Currently required even for email/password login. |
| `OPENROUTER_API_KEY`                              | The default model (`z-ai/glm-5.2`) and background jobs run through OpenRouter.                                                                     |
| `OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` | Optional. Only needed if you select those providers' models in settings.                                                                           |
| `AI_DISABLE_SEARCH_TOOLS`                         | Optional. Set to `true` to turn off web search during curriculum generation.                                                                       |
| `UPLOADTHING_TOKEN`                               | Optional. Only needed for image uploads.                                                                                                           |

Push the schema to a fresh database, then start the app:

```bash
pnpm db:push
pnpm dev:next
```

Open `http://localhost:3000`, create an account, and describe what you want to learn. To look at the workspace UI without an account or any model calls, open `/ui/workspace`, which renders fixture data.

Validation:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Some tests run against a real database and load `POSTGRES_URL` from `.env`. Point them at a disposable database. Those tests skip in CI.

## Status

Breakpoint is experimental, and it says so plainly:

- Learning faster or reaching expert level is the goal, not a demonstrated result.
- Explanations and grades come from language models and can be wrong. The grader is also a ceiling: rubrics are written beside a strong reference answer, so they measure distance from a good answer and can't certify a better one.
- Live use costs money in model calls, and latency depends on the provider.
- `apps/expo` and `apps/tanstack-start` are starter surfaces, not working clients.

## Further reading

- [Project goal](documentation/project-goal.md): the product thesis in full
- [Architecture decision: API domain boundaries](documentation/architecture/0001-api-domain-boundaries.md)
- [Engineering protocol](documentation/breakpoint-engineering-protocol.md)
- [AGENTS.md](AGENTS.md): conventions for AI coding agents working in this repo

## Contributing

Issues and pull requests are welcome in the [issue tracker](https://github.com/Siffrico/Breakpoint/issues). Treat prompts, rubrics, scoring policy, and curriculum logic as product logic: they get the same review as code. When the docs and the code disagree, trust the code and fix the docs.

## License

[MIT](LICENSE). Built by Safin Ahmed on the [create-t3-turbo](https://github.com/t3-oss/create-t3-turbo) foundation by Julius Marminge; the `@acme/*` package names come from that starter.
