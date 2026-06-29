// The single source of truth for workspace composer slash commands. Adding a
// command is one entry here — the composer detection, the menu UI, and the
// shell handler all read from this list and the `AskIntent` union below.

export type AskIntentKind = "idk" | "explain";

export interface AskIntent {
  kind: AskIntentKind;
  // Bumped each time a command fires so the Ask panel can react to repeat
  // invocations of the same command (a plain `kind` change wouldn't re-trigger).
  nonce: number;
}

export interface SlashCommand {
  id: AskIntentKind;
  /** Primary token shown in the menu, without the leading slash. */
  command: string;
  /** Alternate tokens that also match (without the leading slash). */
  aliases: string[];
  label: string;
  description: string;
}

export const WORKSPACE_SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "idk",
    command: "idk",
    aliases: ["i-dont-know", "stuck", "confused"],
    label: "/idk",
    description: "I'm stuck — open the tutor to pinpoint what's confusing",
  },
  {
    id: "explain",
    command: "explain",
    aliases: ["explain-further", "deeper"],
    label: "/explain",
    description: "Explain this scenario further in the tutor panel",
  },
];

/**
 * Returns the active slash query when the composer value is a single leading
 * `/token` (no whitespace yet), otherwise `null`. A space means the user has
 * moved past command entry, so the menu should close and normal submit resumes.
 */
export const parseSlashQuery = (value: string): string | null => {
  if (!value.startsWith("/")) return null;
  const rest = value.slice(1);
  if (/\s/.test(rest)) return null;
  return rest.toLowerCase();
};

export const matchSlashCommands = (query: string): SlashCommand[] => {
  if (query.length === 0) return WORKSPACE_SLASH_COMMANDS;
  return WORKSPACE_SLASH_COMMANDS.filter((command) =>
    [command.command, ...command.aliases].some((token) =>
      token.startsWith(query),
    ),
  );
};
