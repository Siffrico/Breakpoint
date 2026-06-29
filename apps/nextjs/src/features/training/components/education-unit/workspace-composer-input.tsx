"use client";

import type { KeyboardEvent, RefObject } from "react";
import { useState } from "react";
import { ArrowsOutSimple, ArrowUp, Plus } from "@phosphor-icons/react";

import { ChatComposer, SlashCommandMenu } from "@acme/ui/chat";

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
    if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
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
        onSubmit={handleSubmit}
        disabled={disabled}
        textareaRef={textareaRef}
        ariaLabel="Response"
        placeholder={placeholder}
        leftSlot={
          <div className="flex min-w-0 items-center gap-1">
            <ComposerIconButton label="Add attachment">
              <Plus size={17} />
            </ComposerIconButton>
            <button
              type="button"
              onClick={onExpand}
              disabled={disabled}
              aria-label="Open as full page"
              title="Open as full page"
              className="flex size-7 items-center justify-center rounded-md text-[#838383] transition-colors outline-none hover:bg-white/[0.045] hover:text-[#d0d0d0] focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:text-[#4f4f4f] disabled:hover:bg-transparent"
            >
              <ArrowsOutSimple size={13} weight="bold" />
            </button>
          </div>
        }
        rightSlot={
          <button
            type="button"
            onClick={isRunning ? onStop : handleSubmit}
            disabled={!isRunning && (!value.trim() || disabled)}
            aria-label={isRunning ? "Stop generating" : "Submit response"}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-[7px] border border-white/[0.055] bg-[linear-gradient(180deg,#303030_0%,#252525_48%,#1f1f1f_100%)] text-[#d7d7d7] shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_6px_16px_rgba(0,0,0,0.34)] transition-colors outline-none hover:bg-[linear-gradient(180deg,#3a3a3a_0%,#2d2d2d_48%,#242424_100%)] focus:outline-none focus-visible:outline-none disabled:border-white/[0.035] disabled:bg-[linear-gradient(180deg,#292929_0%,#222222_48%,#1d1d1d_100%)] disabled:text-[#686868] disabled:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_5px_14px_rgba(0,0,0,0.26)]"
          >
            {isRunning ? (
              <span aria-hidden="true" className="size-2.5 bg-current" />
            ) : (
              <ArrowUp size={15} weight="bold" />
            )}
          </button>
        }
      />
    </div>
  );
}
