import type { RetrievalEvaluation, RetrievalItem } from "../types/becoming.types";

const normalize = (value: string) => value.toLowerCase();

export const gradeRetrievalAnswers = ({
  retrievalItems,
  answers,
}: {
  retrievalItems: RetrievalItem[];
  answers: string[];
}): RetrievalEvaluation => {
  let matchedSignals = 0;
  const feedback = retrievalItems.map((item, index) => {
    const answer = normalize(answers[index] ?? "");
    const hasSignal = item.expectedSignals.some((signal) =>
      answer.includes(normalize(signal)),
    );

    if (hasSignal) {
      matchedSignals += 1;
      return `You captured the core signal for "${item.prompt}".`;
    }

    return `Your answer to "${item.prompt}" needs a clearer operating principle or proof signal.`;
  });

  const score = Math.round((matchedSignals / retrievalItems.length) * 100);

  return {
    score,
    passed: score >= 67,
    feedback,
  };
};
