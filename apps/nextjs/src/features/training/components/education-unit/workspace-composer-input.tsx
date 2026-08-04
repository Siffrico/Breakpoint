"use client";

import type { KeyboardEvent, RefObject } from "react";
import { useState } from "react";
import { ArrowsOutSimple, Plus } from "@phosphor-icons/react";

import {
  ChatComposer,
  ComposerSendButton,
  SlashCommandMenu,
} from "@acme/ui/chat";

import type { UnitCoachCommandIntent } from "~/features/training/lib/unit-coach-commands";
import {
  matchUnitCoachCommands,
  parseUnitCoachCommandQuery,
} from "~/features/training/lib/unit-coach-commands";

function ComposerIconButton({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex size-7 items-center justify-center rounded-[5px] text-[#8b8b8b] transition-colors outline-none hover:bg-white/[0.045] hover:text-[#d0d0d0] focus:outline-none focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

/** Vertical hairline between control-row chips. */
function ComposerDivider() {
  return <span aria-hidden className="h-4 w-px shrink-0 bg-white/[0.075]" />;
}

/** Labelled chip in the control row: icon + text, no surrounding pill. */
function ComposerChip({
  label,
  icon,
  onClick,
  disabled,
  title,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className="flex h-7 shrink-0 items-center gap-1.5 rounded-[5px] px-1.5 text-[12.5px] text-[#8b8b8b] transition-colors outline-none hover:bg-white/[0.045] hover:text-[#d0d0d0] focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:text-[#4f4f4f] disabled:hover:bg-transparent"
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

export function WorkspaceComposerInput({
  value,
  onValueChange,
  onSubmit,
  onStop,
  onExpand,
  onRunCoachCommand,
  disabled,
  isRunning,
  textareaRef,
  placeholder,
  awaitingPassAdvance = false,
  onAdvancePass,
  awaitingUnitAdvance = false,
  onAdvanceUnit,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onExpand: () => void;
  onRunCoachCommand?: (intent: UnitCoachCommandIntent) => void;
  disabled: boolean;
  isRunning: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  placeholder: string;
  awaitingPassAdvance?: boolean;
  onAdvancePass?: () => void;
  awaitingUnitAdvance?: boolean;
  onAdvanceUnit?: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const query = onRunCoachCommand ? parseUnitCoachCommandQuery(value) : null;
  const commands =
    query !== null && !dismissed ? matchUnitCoachCommands(query) : [];
  const menuOpen = commands.length > 0;
  const menuItems = commands.map((command) => ({
    id: command.id,
    label: command.label,
    description: command.description,
  }));

  const handleValueChange = (nextValue: string) => {
    if (disabled) return;
    setActiveIndex(0);
    setDismissed(false);
    onValueChange(nextValue);
  };

  const runCommand = (intent: UnitCoachCommandIntent) => {
    onValueChange("");
    setActiveIndex(0);
    setDismissed(false);
    onRunCoachCommand?.(intent);
  };

  const runSelectedCommand = () => {
    const selected = commands[activeIndex] ?? commands[0];
    runCommand(selected.id);
  };

  const handleSubmit = () => {
    if (menuOpen) {
      runSelectedCommand();
      return;
    }
    onSubmit();
  };

  const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      awaitingPassAdvance &&
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.stopPropagation();
      onAdvancePass?.();
      return;
    }
    if (
      awaitingUnitAdvance &&
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.stopPropagation();
      onAdvanceUnit?.();
      return;
    }
    if (
      !disabled &&
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.stopPropagation();
      handleSubmit();
      return;
    }
    if (!menuOpen) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % commands.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (index) => (index - 1 + commands.length) % commands.length,
      );
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      runSelectedCommand();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setDismissed(true);
    }
  };

  return (
    <div className="relative" onKeyDownCapture={handleKeyDownCapture}>
      <SlashCommandMenu
        items={menuItems}
        activeIndex={activeIndex}
        onSelect={(item) => runCommand(item.id)}
        onHoverIndex={setActiveIndex}
      />
      <ChatComposer
        value={value}
        onValueChange={handleValueChange}
        textareaRef={textareaRef}
        ariaLabel="Response"
        placeholder={placeholder}
        // Workbench shape: a drafting surface with a small radius and a
        // divider-separated control row, not a one-line message box. Height
        // comes from the shared default, which tracks t3code's composer.
        style={{
          borderRadius: 12,
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.03), 0 10px 26px rgba(0,0,0,0.32)",
        }}
        className="border-border bg-secondary focus-within:border-foreground/[0.16]"
        leftSlot={
          <div className="flex min-w-0 items-center gap-1.5">
            <ComposerIconButton label="Add attachment">
              <Plus size={17} />
            </ComposerIconButton>
            <ComposerDivider />
            <ComposerChip
              label="Expand"
              title="Open as full page"
              icon={<ArrowsOutSimple size={13} weight="bold" />}
              onClick={onExpand}
              disabled={disabled}
            />
          </div>
        }
        rightSlot={
          <ComposerSendButton
            rounding="rounded"
            className="size-9"
            stopping={isRunning}
            disabled={!value.trim() || disabled}
            onSubmit={handleSubmit}
            onStop={onStop}
            sendLabel="Submit response"
            stopLabel="Stop generating"
          />
        }
      />
    </div>
  );
}
