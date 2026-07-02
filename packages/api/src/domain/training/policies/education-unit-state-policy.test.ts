import { describe, expect, it } from "vitest";

import type { UnitContent } from "../types/training.types";
import { shouldRefreshLegacyEducationUnit } from "./education-unit-state-policy";

const unit = {
  id: "content-1",
  nodeId: "node-1",
  title: "Incident diagnosis",
  summary: "Diagnose before changing the system.",
  whyItMatters: "Blind changes destroy evidence.",
  learningGoal: "Choose a discriminating probe.",
  seedPrompt:
    "You are in a real situation where diagnosis matters. What would you do first, and what would you watch for?",
  seedHint: "Name the move and signal.",
  clusterArcFrame: "Build diagnostic judgment.",
  clusterBriefing: null,
  complexityBudget: 1,
  buildContent: null,
  practicePrompts: null,
  teachbackSetup: {
    studentPersona: "A skeptical peer",
    openingMisconception: "The visible symptom is the cause.",
    roundLadder: [
      { round: 1, objection: "Why?", objective: "Ground the probe." },
      { round: 2, objection: "What else?", objective: "Test alternatives." },
      { round: 3, objection: "Then?", objective: "Test sequencing." },
    ],
    passSignals: ["Uses evidence", "Separates hypotheses"],
    failureModes: ["Guesses", "Changes multiple variables"],
  },
  scenario: { title: "Incident", focusAreas: ["diagnosis"] },
  unitMasteryContract: null,
  difficultyBands: null,
} satisfies UnitContent;

describe("shouldRefreshLegacyEducationUnit", () => {
  it("refreshes retired generic template rows with no learner responses", () => {
    expect(shouldRefreshLegacyEducationUnit({ unit, responses: [] })).toBe(
      true,
    );
  });

  it("does not overwrite a row once the learner has responded", () => {
    expect(
      shouldRefreshLegacyEducationUnit({
        unit,
        responses: [{ id: "response-1" }] as never,
      }),
    ).toBe(false);
  });
});
