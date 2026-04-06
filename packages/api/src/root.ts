import { authRouter } from "./router/auth";
import { becomingRouter } from "./router/becoming";
import { esdeSimulationRouter } from "./router/esde-simulation";
import { memoryRouter } from "./router/memory";
import { postRouter } from "./router/post";
import { profileRouter } from "./router/profile";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  becoming: becomingRouter,
  esdeSimulation: esdeSimulationRouter,
  memory: memoryRouter,
  post: postRouter,
  profile: profileRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
