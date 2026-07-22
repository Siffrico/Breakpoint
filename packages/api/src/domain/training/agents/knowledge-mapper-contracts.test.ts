import { describe, expect, it } from "vitest";

import { KnowledgeMapOutputSchema } from "./contracts";

const validMap = {
  questions: [
    {
      question: "How do you find friction in a user flow?",
      items: [
        {
          kind: "concept" as const,
          label: "User intent",
          content:
            "User intent is the outcome the person is trying to reach at this point in the flow.",
        },
        {
          kind: "mechanism" as const,
          label: "Trace the decision path",
          content:
            "Trace each decision from intent to outcome and mark steps that add effort without advancing the intent.",
        },
      ],
    },
  ],
};

describe("KnowledgeMapOutputSchema", () => {
  it("accepts authored questions with concepts and executable mechanisms", () => {
    expect(KnowledgeMapOutputSchema.parse(validMap)).toEqual(validMap);
  });

  it("rejects headings that are not questions", () => {
    expect(() =>
      KnowledgeMapOutputSchema.parse({
        questions: [{ ...validMap.questions[0], question: "Finding friction" }],
      }),
    ).toThrow("knowledge questions must end with a question mark");
  });

  it("rejects knowledge kinds outside the product taxonomy", () => {
    expect(() =>
      KnowledgeMapOutputSchema.parse({
        questions: [
          {
            ...validMap.questions[0],
            items: [
              {
                kind: "vocabulary",
                label: "Friction",
                content: "A term without usable knowledge.",
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });
});
