const MAX_PROVISIONAL_PROJECT_TITLE_LENGTH = 64;

export const deriveProvisionalProjectTitle = (message: string) => {
  const normalized = message.trim().replace(/\s+/g, " ");
  if (!normalized) return null;

  if (normalized.length <= MAX_PROVISIONAL_PROJECT_TITLE_LENGTH) {
    return normalized;
  }

  const candidate = normalized.slice(
    0,
    MAX_PROVISIONAL_PROJECT_TITLE_LENGTH + 1,
  );
  const lastWordBoundary = candidate.lastIndexOf(" ");
  const clipped = candidate
    .slice(
      0,
      lastWordBoundary >= MAX_PROVISIONAL_PROJECT_TITLE_LENGTH / 2
        ? lastWordBoundary
        : MAX_PROVISIONAL_PROJECT_TITLE_LENGTH,
    )
    .replace(/[\s,;:.!?-]+$/g, "");

  return `${clipped}…`;
};
