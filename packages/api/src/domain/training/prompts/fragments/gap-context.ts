import type { FailureGap } from "../../types/training.types";

export const formatGapContext = (gap: FailureGap): string =>
  `Gap description: ${gap.description}
Gap type: ${gap.gapType}
Where it broke: ${gap.whereItBroke}`;
