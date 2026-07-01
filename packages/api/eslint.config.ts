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

export default defineConfig(
  {
    ignores: ["dist/**"],
  },
  baseConfig,
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
