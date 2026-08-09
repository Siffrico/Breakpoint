import { afterEach, describe, expect, it } from "vitest";

import { eq } from "@acme/db";
import {
  TrainingCurriculumNode,
  TrainingCurriculumPlan,
  TrainingOnboardingSession,
} from "@acme/db/schema";

import { skillKnowledgeRepository } from "./skill-knowledge-repository";

const sessionIds: string[] = [];

afterEach(async () => {
  if (!process.env.POSTGRES_URL) return;
  const { db } = await import("@acme/db/client");
  for (const id of sessionIds.splice(0)) {
    await db
      .delete(TrainingOnboardingSession)
      .where(eq(TrainingOnboardingSession.id, id));
  }
});

const skillMap = {
  skills: [
    {
      name: "Frame",
      description: "Frame the task.",
      items: [
        {
          kind: "concept" as const,
          name: "Constraint",
          description: "The result must satisfy the stated constraint.",
        },
      ],
    },
    {
      name: "Solve",
      description: "Choose and execute a method.",
      items: [
        {
          kind: "mechanism" as const,
          name: "Method",
          description: "Apply the method that fits the constraint.",
        },
      ],
    },
    {
      name: "Verify",
      description: "Check the result.",
      items: [
        {
          kind: "mechanism" as const,
          name: "Check",
          description: "Test the result against the original constraint.",
        },
      ],
    },
  ],
  expertJudgment: [
    {
      rule: "Choose the smallest sufficient method.",
      when: "Several methods fit.",
    },
    {
      rule: "Verify against the original task.",
      when: "A result is produced.",
    },
  ],
  commonMistakes: [
    {
      mistake: "Solve the wrong problem.",
      whyItHappens: "The surface cue dominates.",
      detectionCue: "The output misses the requested result.",
    },
    {
      mistake: "Skip verification.",
      whyItHappens: "The result looks plausible.",
      detectionCue: "The original constraint was never checked.",
    },
  ],
};

const practiceContract = {
  workflow: {
    name: "Perform one task",
    steps: ["Frame.", "Solve.", "Verify."],
  },
  responseMode: "judge" as const,
  taskTypes: [
    {
      name: "Whole task",
      situation: "A realistic case.",
      learnerDoes: "Decide and justify.",
      output: "A defensible result.",
      taskShape: "One complete case.",
      skills: ["Frame", "Solve", "Verify"],
    },
  ],
  qualityBar: ["The result satisfies the case."],
  variationAxes: [
    { name: "Context", description: "The case changes." },
    { name: "Trap", description: "The plausible error changes." },
  ],
  evaluationCriteria: [
    {
      criterion: "Reasoning supports the result.",
      skills: ["Frame", "Solve", "Verify"],
    },
  ],
  difficultyBands: [
    {
      band: 0 as const,
      task: "Direct",
      reasoning: "One step",
      support: "Full",
      traps: [],
    },
    {
      band: 1 as const,
      task: "Messy",
      reasoning: "Two steps",
      support: "Partial",
      traps: ["near miss"],
    },
    {
      band: 2 as const,
      task: "Adversarial",
      reasoning: "Three steps",
      support: "None",
      traps: ["near miss", "wrong frame"],
    },
  ],
  neverDo: ["Test unrelated recall."],
};

describe("outcome curriculum persistence", () => {
  it.skipIf(!process.env.POSTGRES_URL)(
    "commits the Skill Map, Practice Contract, and coverage rows atomically and idempotently",
    async () => {
      const { db } = await import("@acme/db/client");
      const [session] = await db
        .insert(TrainingOnboardingSession)
        .values({ status: "ready_for_generation" })
        .returning();
      if (!session) throw new Error("Expected session.");
      sessionIds.push(session.id);
      const [plan] = await db
        .insert(TrainingCurriculumPlan)
        .values({
          onboardingSessionId: session.id,
          title: "Test",
          summary: "Test",
          targetIdentity: "Tester",
        })
        .returning();
      if (!plan) throw new Error("Expected plan.");
      const [outcome] = await db
        .insert(TrainingCurriculumNode)
        .values({
          planId: plan.id,
          kind: "outcome",
          status: "ready",
          title: "Evaluate",
          summary: "Produce a defensible evaluation.",
          whyItMatters: "Evaluation matters.",
          outcomeResult: "Produce a defensible evaluation.",
          orderIndex: 1,
          depth: 1,
          positionColumn: 0,
          positionRow: 1,
        })
        .returning();
      if (!outcome) throw new Error("Expected outcome.");
      const difficultyBands = [
        { order: 0, minRating: 800, maxRating: 1000 },
        { order: 1, minRating: 1000, maxRating: 1200 },
        { order: 2, minRating: 1200, maxRating: 1400 },
      ];

      const first = await skillKnowledgeRepository.ensureOutcomeCurriculum({
        db,
        outcomeNodeId: outcome.id,
        skillMap,
        practiceContract,
        difficultyBands,
      });
      const second = await skillKnowledgeRepository.ensureOutcomeCurriculum({
        db,
        outcomeNodeId: outcome.id,
        skillMap,
        practiceContract,
        difficultyBands,
      });
      const stored = await db.query.TrainingCurriculumNode.findFirst({
        where: eq(TrainingCurriculumNode.id, outcome.id),
      });

      expect(first).toHaveLength(3);
      expect(second).toHaveLength(3);
      expect(stored?.skillMap).toEqual(skillMap);
      expect(stored?.practiceContract).toEqual(practiceContract);
    },
  );
});
