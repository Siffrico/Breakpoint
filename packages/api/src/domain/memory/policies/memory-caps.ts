import { createHash } from "node:crypto";

import {
  MEMORY_MAX_CONTENT_CHARS,
  MEMORY_MAX_IMPORT_BYTES,
  MEMORY_MAX_IMPORT_ENTRIES,
} from "@acme/validators";

export const memoryCaps = {
  maxContentChars: MEMORY_MAX_CONTENT_CHARS,
  maxImportBytes: MEMORY_MAX_IMPORT_BYTES,
  maxImportEntries: MEMORY_MAX_IMPORT_ENTRIES,
} as const;

export const stripControlChars = (value: string) =>
  value.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "");

export const normalizeMemoryContent = (value: string) =>
  stripControlChars(value).replace(/\s+/g, " ").trim();

export const normalizeImportPayload = (value: string) =>
  stripControlChars(value).replace(/\r\n/g, "\n").trim();

export const getMemoryContentHash = (value: string) =>
  createHash("sha256").update(normalizeMemoryContent(value).toLowerCase()).digest("hex");

export const getUtf8ByteLength = (value: string) => Buffer.byteLength(value, "utf8");
