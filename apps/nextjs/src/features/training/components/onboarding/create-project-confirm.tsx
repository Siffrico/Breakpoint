"use client";

import { ArrowRight } from "@phosphor-icons/react";

import { Button } from "@acme/ui/button";

/**
 * Minimal client view of the `tool-createProject` UI part. The tool is loosely
 * typed on the message (the data parts carry the strong typing), so we narrow
 * the few fields we read here rather than threading the full tool generic.
 */
interface CreateProjectToolPart {
  type: "tool-createProject";
  state: string;
  input?: {
    projectName?: string;
    targetIdentity?: string;
    summary?: string;
  };
  approval?: {
    id: string;
    isAutomatic?: boolean;
    approved?: boolean;
  };
}

/**
 * The "Create project" button. Renders only while the SDK is holding the tool
 * call for explicit human approval (`approval-requested`). Once approved, the
 * build card takes over; if declined, we acknowledge softly so the chat flows.
 */
export function CreateProjectConfirm({
  part,
  busy = false,
  onApprove,
  onDeny,
}: {
  part: unknown;
  busy?: boolean;
  onApprove: (approvalId: string) => void;
  onDeny: (approvalId: string) => void;
}) {
  const toolPart = part as CreateProjectToolPart;
  const approvalId = toolPart.approval?.id;

  if (
    toolPart.state === "approval-requested" &&
    approvalId &&
    !toolPart.approval?.isAutomatic
  ) {
    const name = toolPart.input?.projectName ?? "your project";
    const summary = toolPart.input?.summary;

    return (
      <div className="border-border bg-card animate-in fade-in slide-in-from-bottom-1 mt-2 w-full max-w-[68ch] rounded-2xl border px-5 py-4 duration-300">
        <div className="text-muted-foreground text-[11px] tracking-wide uppercase">
          Create project
        </div>
        <div className="text-foreground mt-1 text-base font-medium">{name}</div>
        {summary ? (
          <div className="text-muted-foreground mt-1 text-[13px] leading-6">
            {summary}
          </div>
        ) : null}
        <div className="mt-4 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => onApprove(approvalId)}
          >
            Create project
            <ArrowRight size={14} weight="bold" className="ml-1" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onDeny(approvalId)}
          >
            Not yet
          </Button>
        </div>
      </div>
    );
  }

  if (
    toolPart.state === "output-denied" ||
    (toolPart.state === "approval-responded" &&
      toolPart.approval?.approved === false)
  ) {
    return (
      <div className="text-muted-foreground mt-1 text-[13px] leading-6">
        No problem — let's keep refining.
      </div>
    );
  }

  // Approved / executing / output-available → the build card renders instead.
  return null;
}
