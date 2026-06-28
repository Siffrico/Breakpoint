import assert from "node:assert/strict";
import { test } from "vitest";

import type { CurriculumNode, DifficultyBand } from "../types/training.types";
import { CurriculumInvariantError, resolveRatingScope } from "./rating-scope";

const band = (order: number): DifficultyBand => ({
  order,
  minRating: 1000 + order * 100,
  maxRating: 1100 + order * 100,
  label: `Band ${order + 1}`,
});

const node = (
  overrides: Partial<CurriculumNode> & Pick<CurriculumNode, "id" | "kind">,
): CurriculumNode => ({
  parentNodeId: null,
  title: overrides.id,
  summary: "s",
  whyItMatters: "w",
  learningGoal: "g",
  orderIndex: 0,
  depth: 0,
  positionColumn: 0,
  positionRow: 0,
  status: "ready",
  difficultyBands: null,
  ...overrides,
});

const unit = (nodeId: string, bands: DifficultyBand[] | null = null) => ({
  nodeId,
  difficultyBands: bands,
});

void test("rates against the unit's skill_cluster ancestor", () => {
  const planNodes = [
    node({ id: "root", kind: "root" }),
    node({ id: "cluster", kind: "skill_cluster", parentNodeId: "root" }),
    node({ id: "unit-a", kind: "unit", parentNodeId: "cluster" }),
    node({ id: "unit-b", kind: "unit", parentNodeId: "cluster" }),
  ];

  const a = resolveRatingScope({ unit: unit("unit-a"), planNodes });
  const b = resolveRatingScope({ unit: unit("unit-b"), planNodes });

  // Both units in the cluster share one rating bucket.
  assert.equal(a.nodeId, "cluster");
  assert.equal(b.nodeId, "cluster");
});

void test("prefers the cluster's bands over the unit's", () => {
  const planNodes = [
    node({
      id: "cluster",
      kind: "skill_cluster",
      difficultyBands: [band(0)],
    }),
    node({ id: "unit-a", kind: "unit", parentNodeId: "cluster" }),
  ];

  const scope = resolveRatingScope({
    unit: unit("unit-a", [band(2)]),
    planNodes,
  });

  assert.equal(scope.nodeId, "cluster");
  assert.deepEqual(scope.bands, [band(0)]);
});

void test("falls back to the unit's bands when the cluster has none", () => {
  const planNodes = [
    node({ id: "cluster", kind: "skill_cluster" }),
    node({ id: "unit-a", kind: "unit", parentNodeId: "cluster" }),
  ];

  const scope = resolveRatingScope({
    unit: unit("unit-a", [band(1)]),
    planNodes,
  });

  assert.equal(scope.nodeId, "cluster");
  assert.deepEqual(scope.bands, [band(1)]);
});

void test("rejects a unit without a skill cluster", () => {
  const planNodes = [
    node({ id: "root", kind: "root" }),
    node({ id: "unit-a", kind: "unit", parentNodeId: "root" }),
  ];

  assert.throws(
    () =>
      resolveRatingScope({
        unit: unit("unit-a", [band(0)]),
        planNodes,
      }),
    CurriculumInvariantError,
  );
});

void test("walks through an intermediate ancestor to reach the cluster", () => {
  const planNodes = [
    node({ id: "cluster", kind: "skill_cluster" }),
    node({ id: "integration", kind: "integration", parentNodeId: "cluster" }),
    node({ id: "unit-a", kind: "unit", parentNodeId: "integration" }),
  ];

  const scope = resolveRatingScope({ unit: unit("unit-a"), planNodes });

  assert.equal(scope.nodeId, "cluster");
});

void test("rejects a missing unit node", () => {
  assert.throws(
    () =>
      resolveRatingScope({
        unit: unit("ghost", [band(0)]),
        planNodes: [node({ id: "cluster", kind: "skill_cluster" })],
      }),
    CurriculumInvariantError,
  );
});

void test("rejects a broken parent reference", () => {
  assert.throws(
    () =>
      resolveRatingScope({
        unit: unit("unit-a"),
        planNodes: [
          node({ id: "unit-a", kind: "unit", parentNodeId: "missing" }),
        ],
      }),
    CurriculumInvariantError,
  );
});
