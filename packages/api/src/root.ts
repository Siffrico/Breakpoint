import { authRouter } from "./router/auth";
import { trainingRouter } from "./router/training";
import { memoryRouter } from "./router/memory";
import { postRouter } from "./router/post";
import { profileRouter } from "./router/profile";
import { createTRPCRouter } from "./trpc";

import type {} from "@acme/db/schema";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  training: trainingRouter,
  memory: memoryRouter,
  post: postRouter,
  profile: profileRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
