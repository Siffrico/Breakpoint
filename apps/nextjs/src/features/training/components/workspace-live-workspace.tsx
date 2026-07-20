"use client";

import type { MouseEvent } from "react";
import { memo } from "react";
import dynamic from "next/dynamic";

import type {
  AiWorkspace,
  ChatHistory,
  EducationUnit,
  OnboardingState,
  WorkspaceMode,
} from "./use-workspace-session";
import type {
  UnitCoachCommandIntent,
  UnitCoachTrigger,
} from "~/features/training/lib/unit-coach-commands";
import { AssistantRichText } from "./assistant-rich-text";

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
  workspaceShellError: string | null;
  unitPreparing: boolean;
  preview: boolean;
  advancePending: boolean;
  unitCoachOpen: boolean;
  unitCoachFocused: boolean;
  unitCoachTrigger: UnitCoachTrigger | null;
  onBackToCurrentChat: (event: MouseEvent<HTMLAnchorElement>) => void;
  onRunningChange: (running: boolean) => void;
  onTurnCountChange: (count: number) => void;
  onUnitStateChange: (unit: EducationUnit) => void;
  onAdvanceUnit: () => void;
  onRunCommand: (intent: UnitCoachCommandIntent) => void;
  onAskCoachAboutAnswer: (answer: string) => void;
  onAskCoachAboutSelection: (selection: string) => void;
  onCloseCoach: () => void;
  onToggleCoachFocus: () => void;
  onReturnToUnit: () => void;
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
  workspaceShellError,
  unitPreparing,
  preview,
  advancePending,
  unitCoachOpen,
  unitCoachFocused,
  unitCoachTrigger,
  onBackToCurrentChat,
  onRunningChange,
  onTurnCountChange,
  onUnitStateChange,
  onAdvanceUnit,
  onRunCommand,
  onAskCoachAboutAnswer,
  onAskCoachAboutSelection,
  onCloseCoach,
  onToggleCoachFocus,
  onReturnToUnit,
}: WorkspaceLiveWorkspaceProps) {
  return (
    <div className="relative flex min-h-0 flex-1">
      <div className="bg-background flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {!unitCoachFocused ? (
            <main
              className={[
                "flex min-w-0 flex-1 flex-col",
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
                    key={selectedSessionId}
                    unit={liveUnit}
                    sessionId={selectedSessionId}
                    preview={preview}
                    embedded
                    aiWorkspace={aiWorkspace}
                    advancePending={advancePending}
                    onAdvanceUnit={onAdvanceUnit}
                    onStateChange={onUnitStateChange}
                    onRunningChange={onRunningChange}
                    onRunCommand={onRunCommand}
                    onAskCoachAboutAnswer={onAskCoachAboutAnswer}
                    onAskCoachAboutSelection={onAskCoachAboutSelection}
                  />
                ) : null}
                {mode === "idle" ? (
                  <div className="flex min-h-[60vh] flex-col justify-center">
                    <div className="border-foreground/[0.08] border px-7 py-6">
                      <h2 className="font-display text-foreground text-base font-semibold tracking-[-0.02em]">
                        <AssistantRichText
                          content={
                            workspaceShellError ??
                            activeNodeTitle ??
                            "Preparing your next unit"
                          }
                        />
                      </h2>
                      <div className="text-foreground/52 mt-3 text-[13px] leading-6">
                        <AssistantRichText
                          content={
                            unitPreparing
                              ? "Your next learning step is being prepared. This page will continue automatically."
                              : "Your next learning step is being prepared."
                          }
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </main>
          ) : null}

          {unitCoachOpen && liveUnit ? (
            <div
              className={[
                "min-w-0 transition-[width] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                unitCoachFocused ? "w-full" : "w-[380px]",
              ].join(" ")}
            >
              <UnitCoachPanel
                key={`${selectedSessionId}:${liveUnit.nodeId}`}
                unit={liveUnit}
                sessionId={selectedSessionId}
                trigger={unitCoachTrigger}
                preview={preview}
                isFocused={unitCoachFocused}
                onClose={onCloseCoach}
                onToggleFocus={onToggleCoachFocus}
                onReturnToUnit={onReturnToUnit}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const WorkspaceLiveWorkspace = memo(WorkspaceLiveWorkspaceComponent);
