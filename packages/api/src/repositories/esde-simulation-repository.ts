import {
  and,
  asc,
  eq,
  max,
} from "@acme/db";
import { db } from "@acme/db/client";
import {
  EsdeDomain,
  EsdeLevel,
  EsdeLevelProgress,
  EsdeScenario,
  EsdeScenarioAttempt,
} from "@acme/db/schema";

import { esdeCatalog } from "../domain/esde-simulation/catalog/esde-catalog";
import { err, ok, type Result } from "../lib/result";
import type {
  ActiveScenario,
  LearningDomainCard,
  ScenarioEvaluation,
} from "../domain/esde-simulation/types/esde-simulation.types";

type Database = typeof db;
type DomainRow = typeof EsdeDomain.$inferSelect;
type LevelRow = typeof EsdeLevel.$inferSelect;
type ScenarioRow = typeof EsdeScenario.$inferSelect;
type LevelProgressRow = typeof EsdeLevelProgress.$inferSelect;

let seedPromise: Promise<void> | null = null;

const LEVEL_COMPLETE_THRESHOLD = 85;

const ensureCatalogSeeded = async (db: Database) => {
  if (seedPromise) {
    await seedPromise;
    return;
  }

  seedPromise = (async () => {
    const existingDomain = await db.query.EsdeDomain.findFirst({
      columns: { id: true },
    });

    if (existingDomain) {
      return;
    }

    for (const domain of esdeCatalog) {
      const [insertedDomain] = await db
        .insert(EsdeDomain)
        .values({
          slug: domain.slug,
          title: domain.title,
          description: domain.description,
          unlockOrder: domain.unlockOrder,
        })
        .returning();
      if (!insertedDomain) {
        throw new Error(`Failed to seed domain ${domain.slug}.`);
      }

      for (const level of domain.levels) {
        const [insertedLevel] = await db
          .insert(EsdeLevel)
          .values({
            domainId: insertedDomain.id,
            slug: level.slug,
            title: level.title,
            description: level.description,
            levelNumber: level.levelNumber,
            unlockOrder: level.unlockOrder,
          })
          .returning();
        if (!insertedLevel) {
          throw new Error(`Failed to seed level ${level.slug}.`);
        }

        await db.insert(EsdeScenario).values(
          level.scenarios.map((scenario) => ({
            id: scenario.id,
            levelId: insertedLevel.id,
            variantKey: scenario.variantKey,
            variantOrder: scenario.variantOrder,
            title: scenario.title,
            narrative: scenario.narrative,
            focusAreas: scenario.focusAreas,
            successCriteria: scenario.successCriteria,
            pressureModifiers: scenario.pressureModifiers,
            stageSequence: scenario.stageSequence,
            responseMode: scenario.responseMode,
          })),
        );
      }
    }
  })();

  try {
    await seedPromise;
  } catch (error) {
    seedPromise = null;
    throw error;
  }
};

const getOrderedDomains = async (db: Database) =>
  db.query.EsdeDomain.findMany({
    orderBy: asc(EsdeDomain.unlockOrder),
  });

const getLevelsForDomain = async (db: Database, domainId: string) =>
  db.query.EsdeLevel.findMany({
    where: eq(EsdeLevel.domainId, domainId),
    orderBy: asc(EsdeLevel.levelNumber),
  });

const getProgressRowsForUser = async (db: Database, userId: string) =>
  db.query.EsdeLevelProgress.findMany({
    where: eq(EsdeLevelProgress.userId, userId),
  });

const isDomainUnlocked = (
  domains: DomainRow[],
  levelsByDomain: Map<string, LevelRow[]>,
  completedLevelIds: Set<string>,
  domain: DomainRow,
) => {
  const orderedDomains = domains
    .slice()
    .sort((left, right) => left.unlockOrder - right.unlockOrder);
  const domainIndex = orderedDomains.findIndex((entry) => entry.id === domain.id);

  if (domainIndex <= 0) {
    return true;
  }

  const previousDomain = orderedDomains[domainIndex - 1];
  if (!previousDomain) {
    return false;
  }
  const previousLevels = levelsByDomain.get(previousDomain.id) ?? [];

  return (
    previousLevels.length > 0 &&
    previousLevels.every((level) => completedLevelIds.has(level.id))
  );
};

const getUnlockedLevel = (
  levels: LevelRow[],
  progressByLevelId: Map<string, LevelProgressRow>,
) => {
  for (const [index, level] of levels.entries()) {
    const progress = progressByLevelId.get(level.id);
    if (progress?.status === "completed") {
      continue;
    }

    if (index === 0) {
      return level;
    }

    const previousLevel = levels[index - 1];
    if (!previousLevel) {
      continue;
    }
    const previousProgress = progressByLevelId.get(previousLevel.id);
    if (previousProgress?.status === "completed") {
      return level;
    }
  }

  return null;
};

const buildDomainCard = ({
  domain,
  levels,
  progressByLevelId,
  status,
}: {
  domain: DomainRow;
  levels: LevelRow[];
  progressByLevelId: Map<string, LevelProgressRow>;
  status: "available" | "locked";
}): LearningDomainCard => {
  const completedLevels = levels.filter(
    (level) => progressByLevelId.get(level.id)?.status === "completed",
  ).length;
  const unlockedLevel = status === "available"
    ? getUnlockedLevel(levels, progressByLevelId)
    : null;

  return {
    slug: domain.slug,
    title: domain.title,
    description: domain.description,
    status,
    stageLabel: unlockedLevel
      ? `E.S.D.E. Level ${unlockedLevel.levelNumber}`
      : completedLevels === levels.length && levels.length > 0
        ? "Domain Complete"
        : "Coming Soon",
    difficultyLabel:
      status === "locked"
        ? "Locked"
        : `${completedLevels}/${levels.length} cleared`,
    totalLevels: levels.length,
    completedLevels,
    currentLevelNumber: unlockedLevel?.levelNumber ?? null,
    currentLevelTitle: unlockedLevel?.title ?? null,
  };
};

const getScenarioVariant = ({
  scenarios,
  progress,
}: {
  scenarios: ScenarioRow[];
  progress: LevelProgressRow | null;
}) => {
  if (progress?.activeScenarioId) {
    const activeScenario = scenarios.find(
      (scenario) => scenario.id === progress.activeScenarioId,
    );
    if (activeScenario) {
      return activeScenario;
    }
  }

  return scenarios[0] ?? null;
};

const getRetryVariant = ({
  scenarios,
  currentScenarioId,
}: {
  scenarios: ScenarioRow[];
  currentScenarioId: string;
}) => {
  if (scenarios.length <= 1) {
    return null;
  }

  const currentIndex = scenarios.findIndex(
    (scenario) => scenario.id === currentScenarioId,
  );
  if (currentIndex === -1) {
    return scenarios[0] ?? null;
  }

  return scenarios[(currentIndex + 1) % scenarios.length] ?? null;
};

const getUserLevelProgress = async ({
  db,
  userId,
  domainId,
}: {
  db: Database;
  userId: string;
  domainId: string;
}) => {
  const levels = await getLevelsForDomain(db, domainId);
  const progressRows = await db.query.EsdeLevelProgress.findMany({
    where: and(
      eq(EsdeLevelProgress.userId, userId),
      eq(EsdeLevelProgress.domainId, domainId),
    ),
  });

  const progressByLevelId = new Map(
    progressRows.map((progress) => [progress.levelId, progress]),
  );

  return {
    levels,
    progressByLevelId,
  };
};

export const esdeSimulationRepository = {
  listDomains: async ({
    db,
    userId,
  }: {
    db: Database;
    userId?: string | null;
  }): Promise<Result<LearningDomainCard[]>> => {
    await ensureCatalogSeeded(db);

    const domains = await getOrderedDomains(db);
    const levels = await db.query.EsdeLevel.findMany({
      orderBy: [asc(EsdeLevel.domainId), asc(EsdeLevel.levelNumber)],
    });

    const levelsByDomain = new Map<string, LevelRow[]>();
    for (const level of levels) {
      const currentLevels = levelsByDomain.get(level.domainId) ?? [];
      currentLevels.push(level);
      levelsByDomain.set(level.domainId, currentLevels);
    }

    const progressRows =
      userId != null ? await getProgressRowsForUser(db, userId) : [];
    const progressByLevelId = new Map(
      progressRows.map((progress) => [progress.levelId, progress]),
    );
    const completedLevelIds = new Set(
      progressRows
        .filter((progress) => progress.status === "completed")
        .map((progress) => progress.levelId),
    );

    return ok(
      domains.map((domain) =>
        buildDomainCard({
          domain,
          levels: levelsByDomain.get(domain.id) ?? [],
          progressByLevelId,
          status: isDomainUnlocked(
            domains,
            levelsByDomain,
            completedLevelIds,
            domain,
          )
            ? "available"
            : "locked",
        }),
      ),
    );
  },

  getDomainBySlug: async ({
    db,
    domainSlug,
    userId,
  }: {
    db: Database;
    domainSlug: string;
    userId?: string | null;
  }): Promise<Result<LearningDomainCard>> => {
    const catalogResult = await esdeSimulationRepository.listDomains({
      db,
      userId,
    });
    if (!catalogResult.success) {
      return catalogResult;
    }

    const domain = catalogResult.data.find((entry) => entry.slug === domainSlug);
    if (!domain) {
      return err("The requested domain does not exist.");
    }

    return ok(domain);
  },

  getActiveScenarioByDomainSlug: async ({
    db,
    domainSlug,
    userId,
  }: {
    db: Database;
    domainSlug: string;
    userId?: string | null;
  }): Promise<Result<ActiveScenario>> => {
    await ensureCatalogSeeded(db);

    const domains = await getOrderedDomains(db);
    const domain = domains.find((entry) => entry.slug === domainSlug);

    if (!domain) {
      return err("The requested domain does not exist.");
    }

    const levelsByDomain = new Map<string, LevelRow[]>();
    for (const candidate of domains) {
      levelsByDomain.set(candidate.id, await getLevelsForDomain(db, candidate.id));
    }

    const progressRows =
      userId != null ? await getProgressRowsForUser(db, userId) : [];
    const progressByLevelId = new Map(
      progressRows.map((progress) => [progress.levelId, progress]),
    );
    const completedLevelIds = new Set(
      progressRows
        .filter((progress) => progress.status === "completed")
        .map((progress) => progress.levelId),
    );

    const domainUnlocked = isDomainUnlocked(
      domains,
      levelsByDomain,
      completedLevelIds,
      domain,
    );
    if (!domainUnlocked) {
      return err("This domain is locked right now.");
    }

    const levels = levelsByDomain.get(domain.id) ?? [];
    const activeLevel = getUnlockedLevel(levels, progressByLevelId);

    if (!activeLevel) {
      return err("All configured levels in this domain are complete.");
    }

    const progress = progressByLevelId.get(activeLevel.id) ?? null;
    const scenarios = await db.query.EsdeScenario.findMany({
      where: eq(EsdeScenario.levelId, activeLevel.id),
      orderBy: asc(EsdeScenario.variantOrder),
    });

    const activeScenario = getScenarioVariant({ scenarios, progress });

    if (!activeScenario) {
      return err("There is no active scenario configured for this level yet.");
    }

    const completedLevels = levels.filter(
      (level) => progressByLevelId.get(level.id)?.status === "completed",
    ).length;
    const unlockedNextLevel =
      completedLevels < levels.length &&
      levels.some(
        (level) =>
          level.levelNumber === activeLevel.levelNumber + 1 &&
          progressByLevelId.get(activeLevel.id)?.status === "completed",
      );

    return ok({
      id: activeScenario.id,
      domainSlug: domain.slug,
      domainTitle: domain.title,
      levelId: activeLevel.id,
      levelNumber: activeLevel.levelNumber,
      levelTitle: activeLevel.title,
      activeStage:
        progress?.currentStage === "educate" ||
        progress?.currentStage === "simulate" ||
        progress?.currentStage === "diagnose" ||
        progress?.currentStage === "evaluate"
          ? progress.currentStage
          : "simulate",
      stageSequence: activeScenario.stageSequence,
      responseMode: "typed",
      attemptNumber: (progress?.attemptCount ?? 0) + 1,
      variantLabel:
        activeScenario.variantOrder === 1
          ? "Primary scenario"
          : `Retry variant ${activeScenario.variantOrder}`,
      prompt: {
        title: activeScenario.title,
        narrative: activeScenario.narrative,
        focusAreas: activeScenario.focusAreas,
        successCriteria: activeScenario.successCriteria,
        pressureModifiers: activeScenario.pressureModifiers,
      },
      progress: {
        domainSlug: domain.slug,
        levelId: activeLevel.id,
        levelNumber: activeLevel.levelNumber,
        levelTitle: activeLevel.title,
        status:
          progress?.status === "completed"
            ? "completed"
            : progress != null
              ? "in_progress"
              : "available",
        attemptCount: progress?.attemptCount ?? 0,
        completedLevelsInDomain: completedLevels,
        totalLevelsInDomain: levels.length,
        unlockedNextLevel,
      },
    });
  },

  saveScenarioAttempt: async ({
    db,
    userId,
    domainSlug,
    scenarioId,
    response,
    evaluation,
  }: {
    db: Database;
    userId: string;
    domainSlug: string;
    scenarioId: string;
    response: string;
    evaluation: ScenarioEvaluation;
  }): Promise<Result<ScenarioEvaluation>> => {
    await ensureCatalogSeeded(db);

    const domain = await db.query.EsdeDomain.findFirst({
      where: eq(EsdeDomain.slug, domainSlug),
    });
    if (!domain) {
      return err("The requested domain does not exist.");
    }

    const scenario = await db.query.EsdeScenario.findFirst({
      where: eq(EsdeScenario.id, scenarioId),
    });
    if (!scenario) {
      return err("The submitted scenario is not the active scenario.");
    }

    const level = await db.query.EsdeLevel.findFirst({
      where: eq(EsdeLevel.id, scenario.levelId),
    });
    if (!level || level.domainId !== domain.id) {
      return err("The submitted scenario is not the active scenario.");
    }

    const { levels, progressByLevelId } = await getUserLevelProgress({
      db,
      userId,
      domainId: domain.id,
    });
    const activeLevel = getUnlockedLevel(levels, progressByLevelId);

    if (!activeLevel || activeLevel.id !== level.id) {
      return err("The submitted scenario is not the active scenario.");
    }

    const scenarios = await db.query.EsdeScenario.findMany({
      where: eq(EsdeScenario.levelId, level.id),
      orderBy: asc(EsdeScenario.variantOrder),
    });

    const existingProgress = progressByLevelId.get(level.id) ?? null;
    const retryVariant =
      evaluation.readiness === "ready_for_next_round"
        ? null
        : getRetryVariant({
            scenarios,
            currentScenarioId: scenarioId,
          });

    const recommendedScenarioId = retryVariant?.id ?? null;
    const levelCompleted = evaluation.score >= LEVEL_COMPLETE_THRESHOLD;
    const nextLevel = levels.find(
      (candidate) => candidate.levelNumber === level.levelNumber + 1,
    );

    await db.transaction(async (tx) => {
      const nextHighestScore = Math.max(existingProgress?.highestScore ?? 0, evaluation.score);

      if (existingProgress) {
        await tx
          .update(EsdeLevelProgress)
          .set({
            status: levelCompleted ? "completed" : "in_progress",
            currentStage: evaluation.nextStage,
            activeScenarioId: recommendedScenarioId,
            highestScore: nextHighestScore,
            attemptCount: (existingProgress.attemptCount ?? 0) + 1,
            retryCount: levelCompleted
              ? existingProgress.retryCount
              : (existingProgress.retryCount ?? 0) + 1,
            lastReadiness: evaluation.readiness,
            completedAt: levelCompleted ? new Date() : null,
          })
          .where(eq(EsdeLevelProgress.id, existingProgress.id));
      } else {
        await tx.insert(EsdeLevelProgress).values({
          userId,
          domainId: domain.id,
          levelId: level.id,
          status: levelCompleted ? "completed" : "in_progress",
          currentStage: evaluation.nextStage,
          activeScenarioId: recommendedScenarioId,
          highestScore: evaluation.score,
          attemptCount: 1,
          retryCount: levelCompleted ? 0 : 1,
          lastReadiness: evaluation.readiness,
          completedAt: levelCompleted ? new Date() : null,
        });
      }

      await tx.insert(EsdeScenarioAttempt).values({
        userId,
        domainId: domain.id,
        levelId: level.id,
        scenarioId,
        response,
        overallScore: evaluation.score,
        readiness: evaluation.readiness,
        scoreBreakdown: {
          correctness: evaluation.scoreBreakdown.correctness,
          reasoning: evaluation.scoreBreakdown.reasoning,
          robustness: evaluation.scoreBreakdown.robustness,
          speed: evaluation.scoreBreakdown.speed,
          consistency: evaluation.scoreBreakdown.consistency,
          transfer: evaluation.scoreBreakdown.transfer,
        },
        failureCategories: evaluation.rootCauses,
        strengths: evaluation.strengths,
        improvements: evaluation.improvements,
        repairTargets: evaluation.repairTargets,
        nextStage: evaluation.nextStage,
        recommendedScenarioId,
      });

      if (levelCompleted && nextLevel) {
        const nextLevelProgress = progressByLevelId.get(nextLevel.id);
        if (!nextLevelProgress) {
          const [firstScenario] = await tx
            .select({ id: EsdeScenario.id })
            .from(EsdeScenario)
            .where(eq(EsdeScenario.levelId, nextLevel.id))
            .orderBy(asc(EsdeScenario.variantOrder))
            .limit(1);

          await tx.insert(EsdeLevelProgress).values({
            userId,
            domainId: domain.id,
            levelId: nextLevel.id,
            status: "in_progress",
            currentStage: "simulate",
            activeScenarioId: firstScenario?.id ?? null,
          });
        }
      }
    });

    return ok({
      ...evaluation,
      recommendedScenarioId,
      retryVariantIssued: recommendedScenarioId != null,
    });
  },

  getHighestScoreForUser: async ({
    db,
    userId,
    domainSlug,
  }: {
    db: Database;
    userId: string;
    domainSlug: string;
  }) => {
    await ensureCatalogSeeded(db);

    const domain = await db.query.EsdeDomain.findFirst({
      where: eq(EsdeDomain.slug, domainSlug),
    });
    if (!domain) {
      return err("The requested domain does not exist.");
    }

    const [result] = await db
      .select({ highestScore: max(EsdeScenarioAttempt.overallScore) })
      .from(EsdeScenarioAttempt)
      .where(
        and(
          eq(EsdeScenarioAttempt.userId, userId),
          eq(EsdeScenarioAttempt.domainId, domain.id),
        ),
      );

    return ok(result?.highestScore ?? 0);
  },
};
