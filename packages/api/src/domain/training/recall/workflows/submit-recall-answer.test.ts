import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RecallRepoShape, RecallTaskRecord } from "../recall-repo";
import { RecallModelError } from "../errors";
import { RecallRepo } from "../recall-repo";
import { submitRecallAnswerWorkflow } from "./submit-recall-answer";

const grading = vi.hoisted(() => ({
  retrieval: vi.fn(),
  correction: vi.fn(),
}));

vi.mock("../model", () => ({
  gradeRecallRetrieval: grading.retrieval,
  gradeRecallCorrection: grading.correction,
}));

const now = new Date("2026-09-12T12:00:00.000Z");
const taskInteractionId = "60000000-0000-4000-8000-000000000001";
const task: RecallTaskRecord = {
  id: "10000000-0000-4000-8000-000000000001",
  userId: "learner",
  planId: "20000000-0000-4000-8000-000000000001",
  sessionId: "30000000-0000-4000-8000-000000000001",
  knowledgeItemId: "40000000-0000-4000-8000-000000000001",
  originalTeachingUnitNodeId: "50000000-0000-4000-8000-000000000001",
  strengthAtReservation: 2,
  knowledgeSnapshot: {
    label: "Lease ownership",
    content: "Only the current lease owner may commit.",
    teachingContext: "A worker can be replaced after its lease expires.",
    criteria: [{ id: "ownership", description: "Checks current ownership." }],
  },
  scenario: {
    challenge: "Which worker may commit after the first lease expires?",
    verifier: {
      idealReasoning: "The replacement worker with the current lease.",
      disqualifyingErrors: ["Allows the expired worker to commit."],
    },
  },
  state: "retrieving",
  interactionId: taskInteractionId,
  currentQuestion: "Which worker may commit after the first lease expires?",
  firstRetrieval: null,
  correctionHistory: [],
  pausedAt: null,
};

const input = {
  userId: task.userId,
  taskId: task.id,
  interactionId: taskInteractionId,
  requestId: "70000000-0000-4000-8000-000000000001",
  answer: "The first worker can still commit.",
  now,
};

const makeRepo = (claimedTask: RecallTaskRecord = task) => {
  const commits: Parameters<RecallRepoShape["commitAnswer"]>[0][] = [];
  const releases: Parameters<RecallRepoShape["releaseAnswer"]>[0][] = [];
  const repo: RecallRepoShape = {
    reserveDueTask: () => Effect.succeed(null),
    savePreparedScenario: () => Effect.succeed(false),
    getOfferableTask: () => Effect.succeed(null),
    startTask: () => Effect.succeed(task),
    pauseTask: () => Effect.succeed(task),
    deferTask: () => Effect.succeed(task),
    claimAnswer: () => Effect.succeed({ status: "claimed", task: claimedTask }),
    commitAnswer: (commit) => {
      commits.push(commit);
      return Effect.succeed(commit.response);
    },
    releaseAnswer: (release) => {
      releases.push(release);
      return Effect.void;
    },
  };
  return { repo, commits, releases };
};

const run = (repo: RecallRepoShape, override = input) =>
  Effect.runPromise(
    submitRecallAnswerWorkflow(override).pipe(
      Effect.provideService(RecallRepo, repo),
    ),
  );

describe("submit recall answer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());

  it("applies one miss update, then schedules correction from the reduced strength", async () => {
    grading.retrieval.mockReturnValue(
      Effect.succeed({
        evidence: [
          {
            criterionId: "ownership",
            passed: false,
            evidence: "The answer lets an expired owner commit.",
          },
        ],
        feedback: "That worker no longer owns the task.",
        explanation: "Lease expiry allows a replacement to take ownership.",
        correctionQuestion: "Who may commit after replacement?",
      }),
    );
    const first = makeRepo();
    const miss = await run(first.repo);
    expect(miss).toMatchObject({ state: "correcting", passed: false });
    expect(first.commits[0]?.schedule).toMatchObject({
      kind: "retrieval_miss",
      strength: 1,
    });

    const firstRetrieval = first.commits[0]?.firstRetrieval;
    expect(firstRetrieval).not.toBeNull();
    if (!firstRetrieval) throw new Error("Expected first retrieval evidence.");
    const correctingTask: RecallTaskRecord = {
      ...task,
      state: "correcting",
      interactionId: miss.interactionId,
      currentQuestion: miss.question,
      firstRetrieval,
    };
    if (!correctingTask.interactionId) {
      throw new Error("Expected a correction interaction.");
    }
    const completedAt = new Date("2026-09-12T12:00:45.000Z");
    grading.correction.mockReturnValue(
      Effect.sync(() => {
        vi.setSystemTime(completedAt);
        return {
          evidence: [
            {
              criterionId: "ownership",
              passed: true,
              evidence: "The learner selects the replacement lease owner.",
            },
          ],
          feedback: "Correct—the replacement owns the commit.",
          nextQuestion: null,
        };
      }),
    );
    const second = makeRepo(correctingTask);
    await run(second.repo, {
      ...input,
      interactionId: correctingTask.interactionId,
      requestId: "70000000-0000-4000-8000-000000000002",
      answer: "Only the replacement with the current lease may commit.",
    });
    expect(second.commits[0]?.schedule).toMatchObject({
      kind: "correction_complete",
      strength: 1,
      reviewDueAt: new Date("2026-09-19T12:00:45.000Z"),
      lastReinforcedAt: completedAt,
    });
    expect(second.commits[0]?.now).toEqual(completedAt);
    expect(second.commits[0]?.correctionHistory[0]?.answeredAt).toEqual(now);
  });

  it("rejects unrelated criterion evidence without committing learner failure", async () => {
    grading.retrieval.mockReturnValue(
      Effect.succeed({
        evidence: [
          { criterionId: "unrelated", passed: false, evidence: "No evidence." },
        ],
        feedback: "No.",
        explanation: "Explanation.",
        correctionQuestion: "Try again?",
      }),
    );
    const state = makeRepo();
    await expect(run(state.repo)).rejects.toThrow(
      "did not match its assigned criteria",
    );
    expect(state.commits).toHaveLength(0);
    expect(state.releases).toHaveLength(1);
  });

  it("releases the claim when the provider fails", async () => {
    grading.retrieval.mockReturnValue(
      Effect.fail(
        new RecallModelError({ message: "Provider failed.", cause: "timeout" }),
      ),
    );
    const state = makeRepo();
    await expect(run(state.repo)).rejects.toThrow("Provider failed");
    expect(state.commits).toHaveLength(0);
    expect(state.releases).toHaveLength(1);
  });
  it.each([
    { explanation: "Use the current lease.", correctionQuestion: null },
    { explanation: null, correctionQuestion: "Who owns the replacement?" },
    { explanation: null, correctionQuestion: null },
  ])("rejects incomplete correction feedback: %j", async (feedback) => {
    grading.retrieval.mockReturnValue(
      Effect.succeed({
        evidence: [
          {
            criterionId: "ownership",
            passed: false,
            evidence: "Allows an expired owner.",
          },
        ],
        feedback: "That lease expired.",
        ...feedback,
      }),
    );
    const state = makeRepo();
    await expect(run(state.repo)).rejects.toThrow(
      "contradicted its criterion evidence",
    );
    expect(state.commits).toHaveLength(0);
    expect(state.releases).toHaveLength(1);
  });

  it("replays a committed answer without evaluating or scheduling again", async () => {
    const state = makeRepo();
    const response = {
      taskId: task.id,
      interactionId: null,
      state: "complete" as const,
      feedback: "Correct.",
      question: null,
      passed: true,
      canPause: false,
    };
    await expect(
      run({
        ...state.repo,
        claimAnswer: () => Effect.succeed({ status: "committed", response }),
      }),
    ).resolves.toEqual(response);
    expect(grading.retrieval).not.toHaveBeenCalled();
    expect(state.commits).toHaveLength(0);
  });
});
