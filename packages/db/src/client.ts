import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString = process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error("Missing POSTGRES_URL for database runtime connection");
}

const client = postgres(connectionString, {
  connect_timeout: 10,
  idle_timeout: process.env.NODE_ENV === "development" ? 300 : 20,
  max: Number(process.env.POSTGRES_MAX_CONNECTIONS ?? 5),
  prepare: false,
  ssl: "require",
});

export const db = drizzle({
  client,
  schema,
  casing: "snake_case",
});
