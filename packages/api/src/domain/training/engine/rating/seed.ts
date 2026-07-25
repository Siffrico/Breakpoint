import type { SeedRating, StartingPointTier } from "@acme/validators";

import { DEFAULT_RATING_POLICY } from "./policy";

/**
 * Map an onboarding starting-point tier to a Glicko seed. Pure — no DB, no AI.
 *
 * Each tier lands on the midpoint of a default band (goldilocks bands: Band 1 =
 * 850–1050, Band 2 = 1050–1250, Band 3 = 1250–1450) so a learner starts roughly
 * where their self-reported experience sits. Deviation is a deliberately wide
 * 250 (not the policy's 350 "know nothing" nor a tight value): we trust the tap
 * enough to shift the mean, but the ladder should still probe to localise the
 * true rating before optimising challenge. Volatility is the policy default.
 */
export const seedFromStartingPoint = (tier: StartingPointTier): SeedRating => ({
  rating: SEED_RATING_BY_TIER[tier],
  ratingDeviation: 250,
  volatility: DEFAULT_RATING_POLICY.initialVolatility,
});

const SEED_RATING_BY_TIER: Record<StartingPointTier, number> = {
  fundamentals: 950,
  skip_basics: 1150,
  advanced: 1350,
};
