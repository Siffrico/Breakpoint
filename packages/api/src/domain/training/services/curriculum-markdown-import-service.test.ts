import { describe, expect, it } from "vitest";

import { buildCurriculumBlueprintFromMarkdown } from "./curriculum-markdown-import-service";

const buildBlueprint = (markdown: string) =>
  buildCurriculumBlueprintFromMarkdown({
    markdown,
    projectTitle: "Systems Design Interview Prep",
    targetIdentity: "senior backend engineer",
  });

const unitTitles = (markdown: string) =>
  buildBlueprint(markdown)
    .nodes.filter((node) => node.kind !== "root")
    .map((node) => node.title);

describe("buildCurriculumBlueprintFromMarkdown", () => {
  it("imports Markdown headings under a pasted curriculum title", () => {
    expect(
      unitTitles(`# Curriculum

## Distributed systems tradeoffs
Latency, consistency, and durability decisions.

## Backpressure and overload
Protect the system under bursty load.`),
    ).toEqual(["Distributed systems tradeoffs", "Backpressure and overload"]);
  });

  it("imports messy numbered outlines with module labels and inline summaries", () => {
    expect(
      unitTitles(`Module 1: Frame the system - Turn vague product prompts into boundaries, users, and constraints.
2) Data model decisions: Choose storage shapes and explain query tradeoffs.
III. Reliability review: Diagnose failure modes before scaling traffic.
• Launch review - Connect design choices to rollout risk.`),
    ).toEqual([
      "Frame the system",
      "Data model decisions",
      "Reliability review",
      "Launch review",
    ]);
  });

  it("imports JSON curriculum exports without requiring Markdown", () => {
    expect(
      unitTitles(`{
  "title": "Backend roadmap",
  "modules": [
    {
      "title": "API contract design",
      "summary": "Design durable request and response contracts."
    },
    {
      "name": "Operational debugging",
      "description": "Trace incidents across logs, metrics, and user symptoms."
    }
      ]
}`),
    ).toEqual(["API contract design", "Operational debugging"]);
  });

  it("falls back to plain pasted paragraphs instead of rejecting the import", () => {
    const blueprint =
      buildBlueprint(`Learn how to read a production trace and identify the first broken invariant.

Practice explaining the tradeoff between queue depth, worker count, and latency under load.`);

    expect(blueprint.nodes.filter((node) => node.kind !== "root")).toHaveLength(
      2,
    );
    expect(blueprint.nodes[1]?.summary).toContain("production trace");
  });
});
