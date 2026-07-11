import { cache } from "react";
import { headers } from "next/headers";

import { appRouter, createTRPCContext } from "@acme/api";

import { auth } from "~/auth/server";

const caller = cache(async () =>
  appRouter.createCaller(
    await createTRPCContext({ headers: new Headers(await headers()), auth }),
  ),
);
export const getMissionForUnitRun = async (unitRunId: string) =>
  (await caller()).missions.getForUnitRun({ unitRunId });
