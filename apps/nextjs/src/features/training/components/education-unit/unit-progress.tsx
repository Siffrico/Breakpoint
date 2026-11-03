import { cn } from "@acme/ui";

type PartState = "met" | "missed" | "open" | "pending";

export type UnitProgressStep =
  | { kind: "teach"; current: boolean }
  | {
      kind: "round";
      label: "learn" | "exam";
      current: boolean;
      parts: PartState[];
    };

const PART_MARK: Record<PartState, string> = {
  met: "✓",
  missed: "✕",
  open: "•",
  pending: "○",
};

const letter = (index: number) => String.fromCharCode(97 + index);

/**
 * The unit as a one-line checklist: every step so far, the current one
 * emphasized, and each round's parts as a, b, c with their state.
 */
export function UnitProgress({ steps }: { steps: UnitProgressStep[] }) {
  if (steps.length === 0) return null;
  const roundNumbers = steps.map(
    (_, index) =>
      steps.slice(0, index + 1).filter((step) => step.kind === "round").length,
  );
  return (
    <ol className="text-muted-foreground mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] leading-4">
      {steps.map((step, index) => {
        return (
          <li
            key={index}
            aria-current={step.current ? "step" : undefined}
            className={cn(
              "flex items-center gap-1.5",
              step.current && "text-foreground",
            )}
          >
            {step.kind === "teach" ? (
              <span>{step.current ? "Teach" : "Teach ✓"}</span>
            ) : (
              <>
                <span>
                  Round {roundNumbers[index]} ·{" "}
                  {step.label === "exam" ? "Exam" : "Learn"}
                </span>
                {step.parts.map((part, partIndex) => (
                  <span
                    key={partIndex}
                    className={cn(
                      "tabular-nums",
                      part === "missed" && "text-destructive/80",
                    )}
                  >
                    {letter(partIndex)} {PART_MARK[part]}
                  </span>
                ))}
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}
