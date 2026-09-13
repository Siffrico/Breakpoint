import { authRouter } from "./router/auth";
import { memoryRouter } from "./router/memory";
import { missionsRouter } from "./router/missions";
import { postRouter } from "./router/post";
import { profileRouter } from "./router/profile";
import { recallRouter } from "./router/recall";
import { trainingRouter } from "./router/training";
import { createTRPCRouter } from "./trpc";

import type {} from "@acme/db/schema";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  training: trainingRouter,
  memory: memoryRouter,
  post: postRouter,
  profile: profileRouter,
  recall: recallRouter,
  missions: missionsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
