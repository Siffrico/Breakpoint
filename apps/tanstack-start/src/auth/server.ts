import { reactStartCookies } from "better-auth/react-start";

import { initAuth } from "@acme/auth";

import { env } from "~/env";
import { getBaseUrl } from "~/lib/url";

const baseUrl = getBaseUrl();
const trustedOrigins = [
  baseUrl,
  env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
    : null,
  env.VERCEL_URL ? `https://${env.VERCEL_URL}` : null,
  ...(env.ALLOWED_ORIGINS?.split(",") ?? []),
]
  .filter((origin): origin is string => Boolean(origin))
  .map((origin) => origin.trim())
  .filter(Boolean);

export const auth = initAuth({
  baseUrl,
  productionUrl: `https://${env.VERCEL_PROJECT_PRODUCTION_URL ?? "turbo.t3.gg"}`,
  secret: env.AUTH_SECRET,
  discordClientId: env.AUTH_DISCORD_ID,
  discordClientSecret: env.AUTH_DISCORD_SECRET,
  trustedOrigins,

  extraPlugins: [reactStartCookies()],
});
