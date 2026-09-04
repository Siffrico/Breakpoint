import { TRPCError } from "@trpc/server";

type TRPCErrorCode = TRPCError["code"];

export const recoverTRPCError = async <T, F>({
  promise,
  codes,
  fallback,
}: {
  promise: Promise<T>;
  codes: readonly TRPCErrorCode[];
  fallback: F;
}): Promise<T | F> => {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof TRPCError && codes.includes(error.code)) {
      return fallback;
    }
    throw error;
  }
};
