import type { Config } from "drizzle-kit";

const migrationUrl =
  process.env.DIRECT_DATABASE_URL ??
  process.env.POSTGRES_URL?.replace(":6543", ":5432");

if (!migrationUrl) {
  throw new Error("Missing DIRECT_DATABASE_URL or POSTGRES_URL");
}

export default {
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: { url: migrationUrl },
  casing: "snake_case",
} satisfies Config;
