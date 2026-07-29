"use client";

import type { MouseEvent } from "react";
import { memo } from "react";
import dynamic from "next/dynamic";

import type { UnitCoachController } from "./use-unit-coach-controller";
import type {
  AiWorkspace,
  ChatHistory,
  EducationUnit,
  OnboardingState,
  WorkspaceMode,
} from "./use-workspace-session";
import { PreparingPanel } from "./preparing-panel";

const EducationUnitWorkspace = dynamic(() =>
  import("./education-unit/education-unit-workspace").then(
    (mod) => mod.EducationUnitWorkspace,
  ),
);
const OnboardingShell = dynamic(() =>
  import("./onboarding-shell").then((mod) => mod.OnboardingShell),
);
const UnitCoachPanel = dynamic(() =>
  import("./unit-coach-panel").then((mod) => mod.UnitCoachPanel),
);
const ChatHistoryView = dynamic(() =>
  import("./chat-history-view").then((mod) => mod.ChatHistoryView),
);

interface WorkspaceLiveWorkspaceProps {
  mode: WorkspaceMode;
  selectedSessionId: string;
  chatHistory: ChatHistory | null;
  chatHistoryError: string | null;
  onboardingState: OnboardingState | null;
  liveUnit: EducationUnit | null;
  aiWorkspace: AiWorkspace | null;
  activeNodeTitle: string | null;
  workspaceLoadError: string | null;
  unitPreparing: boolean;
  preview: boolean;
  advancePending: boolean;
  coach: UnitCoachController;
  onBackToCurrentChat: (event: MouseEvent<HTMLAnchorElement>) => void;
  onRetryWorkspace: () => void;
  onRunningChange: (running: boolean) => void;
  onTurnCountChange: (count: number) => void;
  onUnitStateChange: (unit: EducationUnit) => void;
  onAdvanceUnit: () => void;
}

function WorkspaceLiveWorkspaceComponent({
  mode,
  selectedSessionId,
  chatHistory,
  chatHistoryError,
  onboardingState,
  liveUnit,
  aiWorkspace,
  activeNodeTitle,
  workspaceLoadError,
  unitPreparing,
  preview,
  advancePending,
  coach,
  onBackToCurrentChat,
  onRetryWorkspace,
  onRunningChange,
  onTurnCountChange,
  onUnitStateChange,
  onAdvanceUnit,
}: WorkspaceLiveWorkspaceProps) {
  return (
    <div className="relative flex min-h-0 flex-1">
      <div className="bg-background flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {!coach.focused ? (
            <main
              className={[
                "relative flex min-w-0 flex-1 flex-col",
                mode === "onboarding"
                  ? "min-h-0 overflow-hidden"
                  : mode === "unit"
                    ? "min-h-0 overflow-hidden px-6 sm:px-10"
                    : "overflow-y-auto px-6 pt-1 pb-2 sm:px-10 sm:pt-2",
              ].join(" ")}
            >
              <div
                className={
                  mode === "onboarding" || mode === "unit"
                    ? "flex min-h-0 w-full flex-1 flex-col"
                    : mode === "history"
                      ? "flex min-h-full flex-col"
                      : "bp-prose flex min-h-full flex-col"
                }
              >
                {mode === "history" && chatHistory ? (
                  <ChatHistoryView
                    messages={chatHistory.messages}
                    currentChatHref={
                      preview
                        ? "/ui/workspace"
                        : `/workspace?session=${encodeURIComponent(selectedSessionId)}`
                    }
                    onBackToCurrentChat={onBackToCurrentChat}
                  />
                ) : null}
                {mode === "history" && !chatHistory ? (
                  <div className="text-foreground/48 py-16 text-center text-[13px]">
                    {chatHistoryError ?? "Loading chat..."}
                  </div>
                ) : null}
                {mode === "onboarding" && onboardingState ? (
                  <OnboardingShell
                    key={selectedSessionId}
                    embedded
                    variant="landscape"
                    initialState={onboardingState}
                    sessionId={selectedSessionId}
                    onRunningChange={onRunningChange}
                    onTurnCountChange={onTurnCountChange}
                  />
                ) : null}
                {mode === "unit" && liveUnit ? (
                  <EducationUnitWorkspace
                    key={`${selectedSessionId}:${liveUnit.nodeId}`}
                    unit={liveUnit}
                    sessionId={selectedSessionId}
                    preview={preview}
                    embedded
                    aiWorkspace={aiWorkspace}
                    advancePending={advancePending}
                    onAdvanceUnit={onAdvanceUnit}
                    onStateChange={onUnitStateChange}
                    onRunningChange={onRunningChange}
                    onRunCommand={coach.runCommand}
                    onAskCoachAboutAnswer={coach.askAboutAnswer}
                    onAskCoachAboutSelection={coach.askAboutSelection}
                  />
                ) : null}
                {mode === "complete" ? (
                  <div className="flex min-h-[60vh] flex-col justify-center">
                    <PreparingPanel
                      label="Learning project complete"
                      active={false}
                      detail="You completed every ability in this learning project."
                    />
                  </div>
                ) : null}
                {mode === "idle" ? (
                  <div className="flex min-h-[60vh] flex-col justify-center">
                    <PreparingPanel
                      label={
                        workspaceLoadError ??
                        activeNodeTitle ??
                        "Preparing unit"
                      }
                      active={workspaceLoadError == null}
                      detail={
                        workspaceLoadError
                          ? "The workspace could not be loaded. Try again."
                          : unitPreparing
                            ? "This page will continue automatically."
                            : undefined
                      }
                    />
                    {workspaceLoadError ? (
                      <button
                        type="button"
                        onClick={onRetryWorkspace}
                        className="text-foreground/70 hover:text-foreground mt-3 self-start text-[13px] underline underline-offset-4"
                      >
                        Try again
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </main>
          ) : null}

          {coach.open && liveUnit ? (
            <div
              className={[
                "min-w-0 transition-[width] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                coach.focused ? "w-full" : "w-[380px]",
              ].join(" ")}
            >
              <UnitCoachPanel
                key={`${selectedSessionId}:${liveUnit.nodeId}`}
                unit={liveUnit}
                sessionId={selectedSessionId}
                trigger={coach.trigger}
                preview={preview}
                isFocused={coach.focused}
                onClose={coach.close}
                onToggleFocus={coach.toggleFocus}
                onReturnToUnit={coach.returnToUnit}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const WorkspaceLiveWorkspace = memo(WorkspaceLiveWorkspaceComponent);
