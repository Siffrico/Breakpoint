import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { nextCookies } from "better-auth/next-js";

import { initAuth } from "@acme/auth";

import { env } from "~/env";

const baseUrl =
  env.VERCEL_ENV === "production"
    ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
    : env.VERCEL_ENV === "preview"
      ? `https://${env.VERCEL_URL}`
      : "http://localhost:3000";

const trustedOrigins = [
  baseUrl,
  ...(env.VERCEL_PROJECT_PRODUCTION_URL
    ? [`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`]
    : []),
  ...(env.VERCEL_URL ? [`https://${env.VERCEL_URL}`] : []),
  ...(env.ALLOWED_ORIGINS?.split(",") ?? []),
].flatMap((origin) => {
  const trimmed = origin.trim();
  return trimmed ? [trimmed] : [];
});

export const auth = initAuth({
  baseUrl,
  productionUrl: env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
    : baseUrl,
  secret: env.AUTH_SECRET,
  discordClientId: env.AUTH_DISCORD_ID,
  discordClientSecret: env.AUTH_DISCORD_SECRET,
  trustedOrigins,
  extraPlugins: [nextCookies()],
});

export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);
