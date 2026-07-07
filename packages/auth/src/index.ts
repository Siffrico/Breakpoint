import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { oAuthProxy } from "better-auth/plugins";

import { db } from "@acme/db/client";

export function initAuth<
  TExtraPlugins extends BetterAuthPlugin[] = [],
>(options: {
  baseUrl: string;
  productionUrl: string;
  secret: string | undefined;

  discordClientId: string;
  discordClientSecret: string;
  trustedOrigins?: string[];
  extraPlugins?: TExtraPlugins;
}) {
  const trustedOrigins = Array.from(
    new Set(["expo://", ...(options.trustedOrigins ?? [])]),
  );

  const config = {
    database: drizzleAdapter(db, {
      provider: "pg",
    }),
    baseURL: options.baseUrl,
    secret: options.secret,
    plugins: [
      oAuthProxy({
        productionURL: options.productionUrl,
      }),
      expo(),
      ...(options.extraPlugins ?? []),
    ],
    emailAndPassword: {
      enabled: true,
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 300,
      },
    },
    socialProviders: {
      discord: {
        clientId: options.discordClientId,
        clientSecret: options.discordClientSecret,
        redirectURI: `${options.baseUrl}/api/auth/callback/discord`,
        prompt: "consent",
      },
    },
    trustedOrigins,
    rateLimit: {
      enabled: true,
      window: 60,
      max: 120,
      customRules: {
        "/sign-in/email": {
          window: 60,
          max: 10,
        },
        "/sign-up/email": {
          window: 60,
          max: 5,
        },
        "/forget-password": {
          window: 60 * 10,
          max: 3,
        },
      },
    },
    advanced: {
      useSecureCookies: options.baseUrl.startsWith("https://"),
      ipAddress: {
        ipAddressHeaders: ["x-forwarded-for", "x-real-ip", "cf-connecting-ip"],
      },
    },
    onAPIError: {
      onError(error, ctx) {
        console.error("BETTER AUTH API ERROR", error, ctx);
      },
    },
  } satisfies BetterAuthOptions;

  return betterAuth(config);
}

export type Auth = ReturnType<typeof initAuth>;
export type Session = Auth["$Infer"]["Session"];
