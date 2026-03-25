import type { Result } from "../../../lib/result";
import type { CapstoneState } from "../types/becoming.types";

import { generateCapstoneWorkflow } from "./generate-capstone-workflow";

export const getCapstoneWorkflow = async (input: Parameters<typeof generateCapstoneWorkflow>[0]): Promise<Result<CapstoneState>> =>
  generateCapstoneWorkflow(input);
