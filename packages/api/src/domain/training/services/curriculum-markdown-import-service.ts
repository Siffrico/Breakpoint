import type {
  CurriculumBlueprint,
  CurriculumNodeBlueprint,
} from "../types/training.types";

const MAX_IMPORTED_UNITS = 80;
const MIN_SUMMARY_LENGTH = 18;

interface MarkdownSection {
  depth: number;
  title: string;
  body: string;
}

const cleanInlineMarkdown = (value: string) =>
  value
    .replace(/[`*_~[\]()>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toSentence = (value: string, fallback: string) => {
  const cleaned = cleanInlineMarkdown(value);
  if (cleaned.length >= MIN_SUMMARY_LENGTH) {
    return cleaned.slice(0, 420);
  }

  return fallback;
};

const parseHeadingSections = (markdown: string): MarkdownSection[] => {
  const sections: MarkdownSection[] = [];
  let current: MarkdownSection | null = null;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const heading = /^(#{1,4})\s+(.+?)\s*$/.exec(rawLine);

    if (heading) {
      if (current) {
        sections.push(current);
      }

      current = {
        depth: heading[1]?.length ?? 1,
        title: cleanInlineMarkdown(heading[2] ?? ""),
        body: "",
      };
      continue;
    }

    if (current) {
      current.body = `${current.body}\n${rawLine}`.trim();
    }
  }

  if (current) {
    sections.push(current);
  }

  return sections.filter((section) => section.title.length > 0);
};

const parseBulletSections = (markdown: string): MarkdownSection[] =>
  markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => /^(?:[-*+]|\d+[.)])\s+(.+)$/.exec(line)?.[1] ?? "")
    .map(cleanInlineMarkdown)
    .filter((line) => line.length > 0)
    .map((title) => ({
      depth: 2,
      title,
      body: "",
    }));

const getImportedSections = (markdown: string) => {
  const headingSections = parseHeadingSections(markdown);
  const usableHeadingSections = headingSections.filter(
    (section) => section.depth > 1,
  );

  if (usableHeadingSections.length > 0) {
    return usableHeadingSections.slice(0, MAX_IMPORTED_UNITS);
  }

  return parseBulletSections(markdown).slice(0, MAX_IMPORTED_UNITS);
};

const buildNodeSummary = (section: MarkdownSection) =>
  toSentence(
    section.body,
    `Build working fluency with ${section.title} through recall, application, and project evidence.`,
  );

const buildWhyItMatters = ({
  section,
  projectTitle,
}: {
  section: MarkdownSection;
  projectTitle: string;
}) =>
  `This matters because ${section.title} must turn into usable judgment inside ${projectTitle}, not just recognition of notes.`;

const buildRootNode = ({
  title,
  summary,
}: {
  title: string;
  summary: string;
}): CurriculumNodeBlueprint => ({
  parentOrderIndex: null,
  kind: "root",
  status: "ready",
  title,
  summary,
  whyItMatters:
    "This is the project spine that keeps the imported curriculum tied to visible performance.",
  learningGoal: summary,
  orderIndex: 0,
  depth: 0,
  positionColumn: 0,
  positionRow: 0,
  difficultyBands: null,
});

export const buildCurriculumBlueprintFromMarkdown = ({
  markdown,
  projectTitle,
  targetIdentity,
}: {
  markdown: string;
  projectTitle: string;
  targetIdentity: string;
}): CurriculumBlueprint => {
  const sections = getImportedSections(markdown);

  if (sections.length === 0) {
    throw new Error(
      "The Markdown curriculum needs at least one heading or bullet item.",
    );
  }

  const summary = `Imported Markdown curriculum for ${targetIdentity}, converted into an active Becoming project path.`;
  const unitNodes: CurriculumNodeBlueprint[] = sections.map(
    (section, index) => ({
      parentOrderIndex: 0,
      kind: index === sections.length - 1 ? "integration" : "unit",
      status: index === 0 ? "ready" : "planned",
      title: section.title,
      summary: buildNodeSummary(section),
      whyItMatters: buildWhyItMatters({ section, projectTitle }),
      learningGoal: buildNodeSummary(section),
      orderIndex: index + 1,
      depth: 1,
      positionColumn: index + 1,
      positionRow: 0,
      difficultyBands: null,
    }),
  );

  return {
    title: projectTitle,
    summary,
    targetIdentity,
    overview: {
      title: projectTitle,
      summary,
      body: `This project was created from an uploaded Markdown curriculum. Breakpoint converted the source material into ${sections.length} active learning ${sections.length === 1 ? "unit" : "units"} so the learner can prove progress through recall, application, and project work.`,
      generatedAt: new Date().toISOString(),
    },
    beforeAfter: {
      headline: `From curriculum notes to usable ${targetIdentity} performance.`,
      beforeSummary:
        "The learner has curriculum material, but the path may still be passive, uneven, or disconnected from project evidence.",
      afterSummary: `The learner can use the imported curriculum to make visible progress toward ${targetIdentity}.`,
      contrastPairs: [
        {
          before: "Reads or collects curriculum items.",
          after: "Turns each unit into a demonstrated decision or artifact.",
        },
        {
          before: "Treats completion as exposure.",
          after: "Treats completion as evidence under application pressure.",
        },
        {
          before: "Moves through topics without a project spine.",
          after: `Connects the path to ${projectTitle}.`,
        },
      ],
      firstShift:
        "Start by explaining the first imported unit from memory before asking for instruction.",
    },
    nodes: [
      buildRootNode({
        title: projectTitle,
        summary,
      }),
      ...unitNodes,
    ],
  };
};
