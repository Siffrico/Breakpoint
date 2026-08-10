import { defineConfig } from "eslint/config";

import { baseConfig } from "@acme/eslint-config/base";

const domainImportRestrictions = [
  {
    group: ["@trpc/server", "@trpc/server/*"],
    message:
      "Domain code must stay transport-agnostic. Translate domain failures at the tRPC edge instead.",
  },
  {
    group: ["@acme/db", "@acme/db/*"],
    message:
      "Domain code must stay persistence-agnostic. Inject repository-backed dependencies from an API edge or repository adapter instead.",
  },
  {
    group: [
      "../repositories/*",
      "../../repositories/*",
      "../../../repositories/*",
      "**/repositories/*",
    ],
    message:
      "Domain code must not import repositories directly. Define a dependency interface in the domain module and satisfy it from an edge adapter.",
  },
];

/**
 * Entering Effect's runtime discards the typed error channel, the context, and
 * interruptibility, so it is only worth doing where an Effect region genuinely
 * begins or ends. This codebase has exactly two such places:
 *
 * 1. Transport — a tRPC procedure or chat handler, where a request ends.
 * 2. External call / resource — the model layer and the lease scope, where
 *    retry, timeout, interruption, and finalizers are load-bearing.
 *
 * Everything between them is plain async over the database. Domain errors are
 * `Data.TaggedError` subclasses, which extend `Error`, so throwing and catching
 * them preserves the exhaustive `_tag` switches the copy tables already use.
 */
const effectRuntimeEntryRestriction = {
  selector:
    "MemberExpression[object.name='Effect'][property.name=/^(runPromise|runPromiseExit|runSync|runSyncExit|runFork)$/]",
  message:
    "Effect's runtime may only be entered at a transport boundary (src/router/**, src/*-chat.ts) or an external-call boundary (the model layer, the lease scope). Sequential business logic over the database is plain async — an internal runPromise erases typed errors, context, and interruption.",
};

/**
 * The external-call boundary: where the model-turn Effect region is entered.
 * Below this line Effect is load-bearing — `run-unit-turn` races the mentor
 * against a speculative prefill, `run-unit-agent` owns retry, schema repair,
 * and three stream-aware timeouts, and interruption propagates from the
 * client's abort signal down into the provider fetch. Above it, the turn is
 * sequential work over the database and stays plain async.
 */
const effectRuntimeEntryFiles = [
  "src/domain/training/education-unit/run-unit-turn.ts",
];

export default defineConfig(
  {
    ignores: ["dist/**"],
  },
  baseConfig,
  {
    files: ["src/**/*.ts"],
    ignores: [
      // Transport boundaries: a request ends here, so the runtime starts here.
      "src/router/**",
      "src/*-chat.ts",
      // External-call boundaries: retry, timeout, interruption, finalizers.
      ...effectRuntimeEntryFiles,
      // Tests drive effects directly; they are their own boundary.
      "src/**/*.test.ts",
    ],
    rules: {
      // `warn`, not `error`, and deliberately so: ten call sites still violate
      // this, all of them in the turn path and the `*-repository-deps.ts`
      // factories, and converting those is a single large change rather than
      // ten small ones. Making it an error today would only buy ten
      // `eslint-disable` comments. Flip to `error` the moment that count
      // reaches zero — the rule is the drift detector, so it must not be able
      // to go quietly stale.
      "no-restricted-syntax": ["warn", effectRuntimeEntryRestriction],
    },
  },
  {
    files: ["src/domain/**/*.ts", "src/domain/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: domainImportRestrictions,
        },
      ],
    },
  },
  {
    files: [
      "src/domain/training/**/*-tools.ts",
      "src/domain/training/**/*-agent.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...domainImportRestrictions,
            {
              group: [
                "**/education-unit/fsm",
                "**/education-unit/fsm.ts",
                "**/repositories/*",
                "**/workspace-turn-persistence",
                "**/workspace-turn-persistence.ts",
              ],
              message:
                "Phase agents and AI tools may not mutate FSM state or persistence directly. Emit validated events only — the turn orchestrator is the only layer allowed to map a tool call into a UnitEvent, call fsm.transition(), and persist the result.",
            },
          ],
        },
      ],
    },
  },
);
