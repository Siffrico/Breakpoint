import type { ModelMessage } from "ai";

export const CACHE_CONTROL_PROVIDER_OPTIONS = {
  anthropic: { cacheControl: { type: "ephemeral" as const } },
  openrouter: { cacheControl: { type: "ephemeral" as const } },
};

const withCacheControl = (message: ModelMessage): ModelMessage => ({
  ...message,
  providerOptions: {
    ...message.providerOptions,
    anthropic: {
      ...message.providerOptions?.anthropic,
      ...CACHE_CONTROL_PROVIDER_OPTIONS.anthropic,
    },
    openrouter: {
      ...message.providerOptions?.openrouter,
      ...CACHE_CONTROL_PROVIDER_OPTIONS.openrouter,
    },
  },
});

export const withCacheBreakpoints = (
  messages: ModelMessage[],
): ModelMessage[] => {
  const stamped = [...messages];
  const first = stamped[0];
  if (!first) return stamped;

  stamped[0] = withCacheControl(first);
  if (stamped.length > 2) {
    const transcriptEnd = stamped.length - 2;
    const lastStableMessage = stamped[transcriptEnd];
    if (lastStableMessage) {
      stamped[transcriptEnd] = withCacheControl(lastStableMessage);
    }
  }

  return stamped;
};
