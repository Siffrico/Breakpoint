import { authRouter } from "./router/auth";
import { trainingRouter } from "./router/training";
import { esdeSimulationRouter } from "./router/esde-simulation";
import { memoryRouter } from "./router/memory";
import { postRouter } from "./router/post";
import { profileRouter } from "./router/profile";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  training: trainingRouter,
  esdeSimulation: esdeSimulationRouter,
  memory: memoryRouter,
  post: postRouter,
  profile: profileRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
