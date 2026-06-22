import { defineConfig } from "eslint/config";

import { baseConfig } from "@acme/eslint-config/base";

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
          patterns: [
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
          ],
        },
      ],
    },
  },
);
