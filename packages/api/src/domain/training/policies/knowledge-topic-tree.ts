import type { KnowledgeModelOutput } from "../agents/contracts";

export type NormalizedKnowledgeTopic = KnowledgeModelOutput["topics"][number] & {
  depth: number;
  orderIndex: number;
};

/** Takes flat model rows, produces depth-first ordered topics, and fails only for an invalid tree. */
export const normalizeKnowledgeTopicTree = (
  topics: KnowledgeModelOutput["topics"],
): NormalizedKnowledgeTopic[] => {
  const bySlug = new Map<string, KnowledgeModelOutput["topics"][number]>();
  for (const topic of topics) {
    if (bySlug.has(topic.slug)) throw new Error(`Duplicate knowledge topic slug: ${topic.slug}`);
    bySlug.set(topic.slug, topic);
  }
  for (const topic of topics) {
    if (topic.parentSlug && !bySlug.has(topic.parentSlug)) {
      throw new Error(`Knowledge topic parent does not exist: ${topic.parentSlug}`);
    }
  }
  const children = new Map<string | null, KnowledgeModelOutput["topics"]>();
  for (const topic of topics) {
    const list = children.get(topic.parentSlug) ?? [];
    list.push(topic);
    children.set(topic.parentSlug, list);
  }
  for (const list of children.values()) list.sort((a, b) => a.orderIndex - b.orderIndex || a.slug.localeCompare(b.slug));
  const result: NormalizedKnowledgeTopic[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (topic: KnowledgeModelOutput["topics"][number], depth: number) => {
    if (visiting.has(topic.slug)) throw new Error(`Knowledge topic cycle: ${topic.slug}`);
    if (visited.has(topic.slug)) return;
    if (depth > 3) throw new Error("Knowledge topic tree exceeds depth 3");
    visiting.add(topic.slug);
    result.push({ ...topic, depth, orderIndex: result.length });
    for (const child of children.get(topic.slug) ?? []) walk(child, depth + 1);
    visiting.delete(topic.slug);
    visited.add(topic.slug);
  };
  for (const root of children.get(null) ?? []) walk(root, 1);
  if (visited.size !== topics.length) throw new Error("Knowledge topic tree has no root");
  return result;
};
