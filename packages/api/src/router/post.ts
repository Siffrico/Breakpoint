import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq } from "@acme/db";
import { CreatePostSchema, Post } from "@acme/db/schema";

import { protectedProcedure, publicProcedure } from "../trpc";

export const postRouter = {
  all: publicProcedure.query(({ ctx }) => {
    return ctx.db.query.Post.findMany({
      columns: { userId: false },
      orderBy: desc(Post.id),
      limit: 10,
    });
  }),

  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.db.query.Post.findFirst({
        columns: { userId: false },
        where: eq(Post.id, input.id),
      });
    }),

  create: protectedProcedure
    .input(CreatePostSchema)
    .mutation(async ({ ctx, input }) => {
      const [post] = await ctx.db
        .insert(Post)
        .values({ ...input, userId: ctx.session.user.id })
        .returning({
          id: Post.id,
          title: Post.title,
          content: Post.content,
          createdAt: Post.createdAt,
          updatedAt: Post.updatedAt,
        });
      return post ?? null;
    }),

  delete: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      const [post] = await ctx.db
        .delete(Post)
        .where(and(eq(Post.id, input), eq(Post.userId, ctx.session.user.id)))
        .returning({
          id: Post.id,
        });
      return post ?? null;
    }),
} satisfies TRPCRouterRecord;
