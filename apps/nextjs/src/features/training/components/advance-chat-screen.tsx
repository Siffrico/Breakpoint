import { CHAT_COLUMN_CLASS, PromptTurn } from "./education-unit/pass-messages";

export function AdvanceChatScreen({
  error,
  onRetry,
  retryPending = false,
}: {
  error: string | null;
  onRetry?: () => void;
  retryPending?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col pt-5 pb-8" aria-live="polite">
      <PromptTurn
        prompt={error ?? ""}
        statusLabel={error ? undefined : "Preparing your next practice…"}
        copyable={false}
      />
      {error && onRetry ? (
        <div className={CHAT_COLUMN_CLASS}>
          <button
            type="button"
            onClick={onRetry}
            disabled={retryPending}
            className="text-foreground/70 hover:text-foreground mt-3 text-[13px] underline underline-offset-4"
          >
            {retryPending ? "Trying again…" : "Try again"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
