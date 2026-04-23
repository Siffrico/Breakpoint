import { z } from "zod/v4";

export const MEMORY_MAX_CONTENT_CHARS = 1_000;
export const MEMORY_MAX_IMPORT_BYTES = 200 * 1024;
export const MEMORY_MAX_IMPORT_ENTRIES = 200;
export const MEMORY_ALLOWED_FILE_EXTENSIONS = [".txt", ".md"] as const;
export const CHATGPT_MEMORY_IMPORT_PROMPT_VERSION = "v1";

export const MemorySourceSchema = z.enum([
  "manual",
  "file",
  "chatgpt_import",
  "profile_update",
  "unit_report",
]);

export const MemoryImportSourceSchema = z.enum(["file", "chatgpt_import"]);

export const MemorySchema = z.object({
  id: z.string().uuid(),
  content: z.string().min(1).max(MEMORY_MAX_CONTENT_CHARS),
  source: MemorySourceSchema,
  importId: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date().nullable(),
});

export const MemoryImportSchema = z.object({
  id: z.string().uuid(),
  source: MemoryImportSourceSchema,
  entryCount: z.number().int().min(0).max(MEMORY_MAX_IMPORT_ENTRIES),
  createdAt: z.date(),
});

export const CreateManualMemoryInputSchema = z.object({
  content: z.string().min(1).max(MEMORY_MAX_CONTENT_CHARS),
});

export const UploadMemoryFileInputSchema = z.object({
  filename: z
    .string()
    .min(1)
    .refine(
      (value) =>
        MEMORY_ALLOWED_FILE_EXTENSIONS.some((extension) =>
          value.toLowerCase().endsWith(extension),
        ),
      {
        message: "Upload a .txt or .md file.",
      },
    ),
  text: z.string().min(1),
});

export const ImportChatGptMemoriesInputSchema = z.object({
  pasted: z.string().min(1),
});

export const UpdateMemoryInputSchema = z.object({
  id: z.string().uuid(),
  content: z.string().min(1).max(MEMORY_MAX_CONTENT_CHARS),
});

export const RemoveMemoryInputSchema = z.object({
  id: z.string().uuid(),
});

export type Memory = z.infer<typeof MemorySchema>;
export type MemoryImport = z.infer<typeof MemoryImportSchema>;
export type MemorySource = z.infer<typeof MemorySourceSchema>;
export type MemoryImportSource = z.infer<typeof MemoryImportSourceSchema>;
