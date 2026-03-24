import type {
  ForgeUnitContent,
  PhaseResponseRecord,
  TeachbackMessage,
} from "../types/becoming.types";

export const getPhaseResponsesByPhase = (
  responses: PhaseResponseRecord[],
  phase: PhaseResponseRecord["phase"],
) =>
  responses
    .filter((response) => response.phase === phase)
    .sort((a, b) => a.sequence - b.sequence || a.createdAt.getTime() - b.createdAt.getTime());

export const getPracticeResponses = (responses: PhaseResponseRecord[]) =>
  getPhaseResponsesByPhase(responses, "practice");

export const getTeachbackResponses = (responses: PhaseResponseRecord[]) =>
  getPhaseResponsesByPhase(responses, "teachback");

export const getGhostResponses = (responses: PhaseResponseRecord[]) =>
  getPhaseResponsesByPhase(responses, "ghost");

export const getSeedResponse = (responses: PhaseResponseRecord[]) =>
  getPhaseResponsesByPhase(responses, "seed").find((response) => response.sequence === 0) ?? null;

export const allPriorPracticesPassed = ({
  responses,
  sequence,
}: {
  responses: PhaseResponseRecord[];
  sequence: number;
}) => {
  const practiceResponses = getPracticeResponses(responses);

  for (let current = 0; current < sequence; current += 1) {
    const practiceRound = practiceResponses.find(
      (response) => response.sequence === current,
    );
    if (!practiceRound?.passed) {
      return false;
    }
  }

  return true;
};

export const allPracticeRoundsPassed = (responses: PhaseResponseRecord[]) =>
  [0, 1, 2].every((sequence) =>
    getPracticeResponses(responses).find((response) => response.sequence === sequence)?.passed,
  );

export const getPracticeAttemptCount = (
  response: PhaseResponseRecord | null | undefined,
) => response?.metadata?.attempts ?? (response ? 1 : 0);

export const buildTeachbackTranscript = ({
  unitContent,
  teachbackResponses,
}: {
  unitContent: ForgeUnitContent;
  teachbackResponses: PhaseResponseRecord[];
}): TeachbackMessage[] => {
  const transcript: TeachbackMessage[] = [
    {
      role: "student",
      content: unitContent.teachbackSetup.openingMisconception,
      round: 1,
    },
  ];

  for (const response of getTeachbackResponses(teachbackResponses)) {
    transcript.push({
      role: "user",
      content: response.userResponse,
      round: response.sequence,
    });

    if (response.sequence < 3 && response.aiResponse) {
      transcript.push({
        role: "student",
        content: response.aiResponse,
        round: response.sequence + 1,
      });
    }
  }

  return transcript;
};

export const getLatestTeachbackRound = (responses: PhaseResponseRecord[]) =>
  getTeachbackResponses(responses).at(-1)?.sequence ?? 0;

export const getLatestTeachbackResult = (responses: PhaseResponseRecord[]) =>
  getTeachbackResponses(responses).find((response) => response.sequence === 3) ?? null;

export const getLatestGhostResponse = (responses: PhaseResponseRecord[]) =>
  getGhostResponses(responses).at(-1) ?? null;
