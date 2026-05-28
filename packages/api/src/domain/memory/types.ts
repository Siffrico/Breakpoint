import type { Memory, MemoryImport } from "@acme/validators";

export type {
  Memory,
  MemoryImport,
  MemoryImportSource,
  MemorySource,
} from "@acme/validators";

export interface MemoryImportResult {
  import: MemoryImport;
  entries: Memory[];
}

export type MemoryErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "PAYLOAD_TOO_LARGE"
  | "CONFLICT"
  | "INTERNAL_SERVER_ERROR";

export interface MemoryError {
  code: MemoryErrorCode;
  message: string;
}
