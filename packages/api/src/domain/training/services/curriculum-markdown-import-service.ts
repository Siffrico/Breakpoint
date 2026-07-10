import type {
  CurriculumBlueprint,
  CurriculumNodeBlueprint,
} from "../types/training.types";

const MAX_IMPORTED_UNITS = 80;
const MIN_SUMMARY_LENGTH = 18;
const MIN_TITLE_LENGTH = 3;

interface MarkdownSection {
  depth: number;
  title: string;
  body: string;
}

const GENERIC_SECTION_TITLES = new Set([
  "curriculum",
  "course",
  "course outline",
  "learning path",
  "outline",
  "plan",
  "roadmap",
  "syllabus",
]);

const stripJsonFence = (value: string) =>
  value
    .trim()
    .replace(/^```(?:json|markdown|md|txt)?\s*/i, "")
    .replace(/\s*```$/i, "");

const normalizePastedText = (value: string) =>
  stripJsonFence(value)
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[•‣◦▪▫●○]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

const cleanInlineMarkdown = (value: string) =>
  value
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
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

const clampTitle = (value: string, fallback: string) => {
  const cleaned = cleanInlineMarkdown(value)
    .replace(
      /^(?:module|unit|lesson|week|day|part|phase|step)\s+\d+\s*[:.-]?\s*/i,
      "",
    )
    .trim();

  if (cleaned.length >= MIN_TITLE_LENGTH) {
    return cleaned.length > 96 ? `${cleaned.slice(0, 93).trim()}...` : cleaned;
  }

  return fallback;
};

const looksGenericSectionTitle = (value: string) =>
  GENERIC_SECTION_TITLES.has(cleanInlineMarkdown(value).toLowerCase());

const parseHeadingSections = (markdown: string): MarkdownSection[] => {
  const sections: MarkdownSection[] = [];
  let current: MarkdownSection | null = null;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(rawLine.trim());

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

const splitTitleAndBody = (value: string) => {
  const normalized = value.trim();
  const colonMatch = /^(.{3,120}?):\s+(.{12,})$/.exec(normalized);
  if (colonMatch) {
    return {
      title: clampTitle(colonMatch[1] ?? "", normalized),
      body: colonMatch[2] ?? "",
    };
  }

  const dashMatch = /^(.{3,120}?)\s+[–—-]\s+(.{12,})$/.exec(normalized);
  if (dashMatch) {
    return {
      title: clampTitle(dashMatch[1] ?? "", normalized),
      body: dashMatch[2] ?? "",
    };
  }

  return {
    title: clampTitle(normalized, "Imported curriculum unit"),
    body: "",
  };
};

const parseListLine = (line: string) => {
  const trimmed = line.trim();
  return (
    /^(?:[-*+]|\d{1,3}[.)]|[a-zA-Z][.)]|[ivxlcdmIVXLCDM]{1,8}[.)])\s+(.+)$/.exec(
      trimmed,
    )?.[1] ??
    /^(?:(?:module|unit|lesson|week|day|part|phase|step)\s+\d{1,3}|(?:module|unit|lesson|week|day|part|phase|step)\s+[a-zA-Z])\s*[:.)-]\s+(.+)$/i.exec(
      trimmed,
    )?.[1] ??
    null
  );
};

const parseOutlineSections = (markdown: string): MarkdownSection[] => {
  const sections: MarkdownSection[] = [];
  let current: MarkdownSection | null = null;

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      if (current?.body) {
        current.body = `${current.body}\n`;
      }
      continue;
    }

    const parsedLine = parseListLine(line);
    if (parsedLine) {
      if (current) {
        sections.push(current);
      }

      const { title, body } = splitTitleAndBody(parsedLine);
      current = {
        depth: Math.max(1, rawLine.search(/\S/) / 2 + 1),
        title,
        body,
      };
      continue;
    }

    const labeledLine =
      /^(?:(?:module|unit|lesson|week|part|phase|step)\s*\d{0,3})\s*[:.-]\s+(.+)$/i.exec(
        line,
      )?.[1] ?? null;
    if (labeledLine) {
      if (current) {
        sections.push(current);
      }

      const { title, body } = splitTitleAndBody(labeledLine);
      current = {
        depth: 2,
        title,
        body,
      };
      continue;
    }

    if (current) {
      current.body = `${current.body}\n${line}`.trim();
    }
  }

  if (current) {
    sections.push(current);
  }

  return sections.filter((section) => section.title.length > 0);
};

const parseJsonSections = (markdown: string): MarkdownSection[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(markdown));
  } catch {
    return [];
  }

  const sections: MarkdownSection[] = [];

  const visit = (value: unknown, depth: number) => {
    if (sections.length >= MAX_IMPORTED_UNITS || value == null) return;

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, depth);
      }
      return;
    }

    if (typeof value === "string") {
      const { title, body } = splitTitleAndBody(value);
      sections.push({ depth, title, body });
      return;
    }

    if (typeof value !== "object") return;

    const record = value as Record<string, unknown>;
    const titleValue =
      record.title ??
      record.name ??
      record.unit ??
      record.lesson ??
      record.module ??
      record.topic;
    const bodyValue =
      record.summary ??
      record.description ??
      record.learningGoal ??
      record.goal ??
      record.body ??
      record.notes;
    const hasChildCollection = [
      "children",
      "items",
      "modules",
      "units",
      "lessons",
      "topics",
      "curriculum",
    ].some((key) => Array.isArray(record[key]));

    if (
      typeof titleValue === "string" &&
      !(depth === 1 && hasChildCollection)
    ) {
      sections.push({
        depth,
        title: clampTitle(titleValue, "Imported curriculum unit"),
        body: typeof bodyValue === "string" ? bodyValue : "",
      });
    }

    for (const key of [
      "children",
      "items",
      "modules",
      "units",
      "lessons",
      "topics",
      "curriculum",
    ]) {
      visit(record[key], depth + 1);
    }
  };

  visit(parsed, 1);
  return sections.filter(
    (section) =>
      section.title.length > 0 && !looksGenericSectionTitle(section.title),
  );
};

const parseParagraphSections = (markdown: string): MarkdownSection[] => {
  const paragraphs = markdown
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  const source =
    paragraphs.length > 1
      ? paragraphs
      : markdown
          .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
          .map((sentence) => sentence.trim())
          .filter((sentence) => sentence.length > 0);

  return source
    .filter((paragraph) => cleanInlineMarkdown(paragraph).length > 0)
    .slice(0, MAX_IMPORTED_UNITS)
    .map((paragraph, index) => {
      const firstLine = paragraph.split("\n")[0] ?? paragraph;
      const { title, body } = splitTitleAndBody(firstLine);
      return {
        depth: 2,
        title:
          cleanInlineMarkdown(title).length >= MIN_TITLE_LENGTH
            ? title
            : `Imported unit ${index + 1}`,
        body: body || paragraph,
      };
    });
};

const getImportedSections = (markdown: string) => {
  const normalizedMarkdown = normalizePastedText(markdown);

  const jsonSections = parseJsonSections(normalizedMarkdown);
  if (jsonSections.length > 0) {
    return jsonSections.slice(0, MAX_IMPORTED_UNITS);
  }

  const headingSections = parseHeadingSections(normalizedMarkdown);
  const smallestHeadingDepth = Math.min(
    ...headingSections.map((section) => section.depth),
  );
  const usableHeadingSections = headingSections.filter((section, index) => {
    if (headingSections.length === 1) return true;
    if (section.depth > smallestHeadingDepth) return true;
    return index > 0 && !looksGenericSectionTitle(section.title);
  });

  if (usableHeadingSections.length > 0) {
    return usableHeadingSections.slice(0, MAX_IMPORTED_UNITS);
  }

  const outlineSections = parseOutlineSections(normalizedMarkdown);
  if (outlineSections.length > 0) {
    return outlineSections.slice(0, MAX_IMPORTED_UNITS);
  }

  return parseParagraphSections(normalizedMarkdown).slice(
    0,
    MAX_IMPORTED_UNITS,
  );
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
  abilityStage: null,
  skillMap: null,
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
      abilityStage: null,
      skillMap: null,
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
