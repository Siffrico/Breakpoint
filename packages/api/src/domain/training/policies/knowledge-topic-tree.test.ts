import { describe, expect, it } from "vitest";

import { normalizeKnowledgeTopicTree } from "./knowledge-topic-tree";

const topic = (slug: string, parentSlug: string | null, orderIndex: number) => ({
  slug,
  parentSlug,
  orderIndex,
  title: slug,
  gloss: `${slug} gloss`,
  coreIdea: `${slug} idea`,
  misconception: `${slug} misconception`,
});

describe("normalizeKnowledgeTopicTree", () => {
  it("assigns depth-first prerequisite order", () => {
    expect(normalizeKnowledgeTopicTree([topic("diagnose", null, 1), topic("code-intent", null, 0), topic("runtime", "code-intent", 0)]).map(({ slug, depth, orderIndex }) => ({ slug, depth, orderIndex }))).toEqual([
      { slug: "code-intent", depth: 1, orderIndex: 0 },
      { slug: "runtime", depth: 2, orderIndex: 1 },
      { slug: "diagnose", depth: 1, orderIndex: 2 },
    ]);
  });

  it.each([
    ["orphan", [topic("root", "missing", 0)]],
    ["cycle", [topic("a", "b", 0), topic("b", "a", 0)]],
    ["depth", [topic("a", null, 0), topic("b", "a", 0), topic("c", "b", 0), topic("d", "c", 0)]],
  ])("rejects %s trees", (_name, topics) => {
    expect(() => normalizeKnowledgeTopicTree(topics)).toThrow();
  });
});
