import { authRouter } from "./router/auth";
import { becomingRouter } from "./router/becoming";
import { esdeSimulationRouter } from "./router/esde-simulation";
import { postRouter } from "./router/post";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  becoming: becomingRouter,
  esdeSimulation: esdeSimulationRouter,
  post: postRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
