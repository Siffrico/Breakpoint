import type { UnitCoachIntent } from "@acme/api/unit-coach";

export type UnitCoachCommandIntent = Exclude<UnitCoachIntent, "freeform">;

export interface UnitCoachTrigger {
  intent: UnitCoachCommandIntent;
  nonce: number;
  unitId: string;
}

export interface UnitCoachCommand {
  id: UnitCoachCommandIntent;
  command: string;
  aliases: readonly string[];
  label: string;
  description: string;
}

export const UNIT_COACH_COMMANDS = [
  {
    id: "idk",
    command: "idk",
    aliases: ["i-dont-know", "stuck", "confused"],
    label: "/idk",
    description: "Open Unit Coach to pinpoint what is blocking you",
  },
  {
    id: "explain",
    command: "explain",
    aliases: ["explain-further", "deeper"],
    label: "/explain",
    description: "Ask Unit Coach to unpack the current scenario",
  },
] as const satisfies readonly UnitCoachCommand[];

/** Returns a command query only while the entire composer is one `/token`. */
export const parseUnitCoachCommandQuery = (value: string): string | null => {
  if (!value.startsWith("/")) return null;
  const query = value.slice(1);
  if (/\s/.test(query)) return null;
  return query.toLowerCase();
};

export const matchUnitCoachCommands = (query: string) => {
  if (query.length === 0) return UNIT_COACH_COMMANDS;
  return UNIT_COACH_COMMANDS.filter((command) =>
    [command.command, ...command.aliases].some((token) =>
      token.startsWith(query),
    ),
  );
};
