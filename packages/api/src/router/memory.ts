import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import {
  CreateManualMemoryInputSchema,
  ImportChatGptMemoriesInputSchema,
  RemoveMemoryInputSchema,
  UpdateMemoryInputSchema,
  UploadMemoryFileInputSchema,
} from "@acme/validators";

import { createManualMemoryWorkflow } from "../domain/memory/workflows/create-manual-memory";
import { deleteMemoryWorkflow } from "../domain/memory/workflows/delete-memory";
import { importChatGptMemoryWorkflow } from "../domain/memory/workflows/import-chatgpt-memory";
import { importFileMemoryWorkflow } from "../domain/memory/workflows/import-file-memory";
import { listMemoriesWorkflow } from "../domain/memory/workflows/list-memories";
import { updateMemoryWorkflow } from "../domain/memory/workflows/update-memory";
import { memoryImportRepository } from "../repositories/memory-import-repository";
import { memoryRepository } from "../repositories/memory-repository";
import { protectedProcedure } from "../trpc";

const throwOnMemoryFailure = <T>(result: {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}) => {
  if (result.success) {
    return result.data as T;
  }

  throw new TRPCError({
    code: (result.error?.code ?? "INTERNAL_SERVER_ERROR") as TRPCError["code"],
    message: result.error?.message ?? "Memory request failed.",
  });
};

export const memoryRouter = {
  list: protectedProcedure.query(async ({ ctx }) =>
    throwOnMemoryFailure(
      await listMemoriesWorkflow({
        deps: {
          listMemories: () =>
            memoryRepository.listByUserId({
              db: ctx.db,
              userId: ctx.session.user.id,
            }),
        },
      }),
    ),
  ),

  createManual: protectedProcedure
    .input(CreateManualMemoryInputSchema)
    .mutation(async ({ ctx, input }) =>
      throwOnMemoryFailure(
        await createManualMemoryWorkflow({
          content: input.content,
          deps: {
            createMemory: ({ content, contentHash }) =>
              memoryRepository.create({
                db: ctx.db,
                userId: ctx.session.user.id,
                source: "manual",
                content,
                contentHash,
              }),
          },
        }),
      ),
    ),

  uploadFile: protectedProcedure
    .input(UploadMemoryFileInputSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const db = tx as unknown as typeof ctx.db;

        return throwOnMemoryFailure(
          await importFileMemoryWorkflow({
            text: input.text,
            deps: {
              getExistingHashes: (contentHashes) =>
                memoryRepository.listContentHashes({
                  db,
                  userId: ctx.session.user.id,
                  contentHashes,
                }),
              createImport: ({ rawPayload, entryCount }) =>
                memoryImportRepository.create({
                  db,
                  userId: ctx.session.user.id,
                  source: "file",
                  rawPayload,
                  entryCount,
                }),
              createMemories: ({ importId, entries }) =>
                memoryRepository.createMany({
                  db,
                  userId: ctx.session.user.id,
                  importId,
                  source: "file",
                  entries,
                }),
            },
          }),
        );
      }),
    ),

  importChatgpt: protectedProcedure
    .input(ImportChatGptMemoriesInputSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const db = tx as unknown as typeof ctx.db;

        return throwOnMemoryFailure(
          await importChatGptMemoryWorkflow({
            pasted: input.pasted,
            deps: {
              getExistingHashes: (contentHashes) =>
                memoryRepository.listContentHashes({
                  db,
                  userId: ctx.session.user.id,
                  contentHashes,
                }),
              createImport: ({ rawPayload, entryCount }) =>
                memoryImportRepository.create({
                  db,
                  userId: ctx.session.user.id,
                  source: "chatgpt_import",
                  rawPayload,
                  entryCount,
                }),
              createMemories: ({ importId, entries }) =>
                memoryRepository.createMany({
                  db,
                  userId: ctx.session.user.id,
                  importId,
                  source: "chatgpt_import",
                  entries,
                }),
            },
          }),
        );
      }),
    ),

  update: protectedProcedure
    .input(UpdateMemoryInputSchema)
    .mutation(async ({ ctx, input }) =>
      throwOnMemoryFailure(
        await updateMemoryWorkflow({
          content: input.content,
          deps: {
            updateMemory: ({ content, contentHash }) =>
              memoryRepository.update({
                db: ctx.db,
                userId: ctx.session.user.id,
                id: input.id,
                content,
                contentHash,
              }),
          },
        }),
      ),
    ),

  remove: protectedProcedure
    .input(RemoveMemoryInputSchema)
    .mutation(async ({ ctx, input }) =>
      throwOnMemoryFailure(
        await deleteMemoryWorkflow({
          deps: {
            removeMemory: () =>
              memoryRepository.remove({
                db: ctx.db,
                userId: ctx.session.user.id,
                id: input.id,
              }),
          },
        }),
      ),
    ),
} satisfies TRPCRouterRecord;
