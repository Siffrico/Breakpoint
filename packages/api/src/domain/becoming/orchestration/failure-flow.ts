import type { ForgeUnitContent, TeachbackMessage } from "../types/becoming.types";
import { educationUnitBuilder } from "../unit-builder/orchestrator";

export const getTeachbackObjection = ({
  unitContent,
  round,
}: {
  unitContent: ForgeUnitContent;
  round: number;
}): { studentReply: string } =>
  educationUnitBuilder.getTeachbackPrompt({
    unit: unitContent,
    round,
  });

export const reviewTeachback = ({
  unitContent,
  practiceResponses,
  teachbackTranscript,
}: {
  unitContent: ForgeUnitContent;
  practiceResponses: Array<{
    sequence: number;
    response: string;
    feedback: string;
    passed: boolean;
  }>;
  teachbackTranscript: TeachbackMessage[];
  }) =>
  educationUnitBuilder.reviewProve({
    unit: unitContent,
    practiceResponses,
    teachbackTranscript,
  });
