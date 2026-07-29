"use client";

import { useState } from "react";
import { CaretDown } from "@phosphor-icons/react";

import { cn } from "@acme/ui";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Textarea } from "@acme/ui/textarea";

import { SettingsPageHeader } from "~/features/settings/components/settings-shell";
import { ModelSwitcherCard } from "~/features/settings/components/teachers/model-switcher-card";

interface TeacherAgent {
  id: string;
  name: string;
  defaultPrompt: string;
}

const TEACHER_AGENTS: readonly TeacherAgent[] = [
  {
    id: "unit-mentor",
    name: "Unit mentor",
    defaultPrompt:
      "Build autonomous capability one todo at a time. Detect the learner's current blockage and choose the smallest useful explanation, Socratic question, example, simulation, or challenge until their own reasoning demonstrates the capability.",
  },
  {
    id: "adversarial-reviewer",
    name: "Adversarial reviewer",
    defaultPrompt:
      "After mentor practice, independently find where the learner's capability could fail, apply realistic format-appropriate pressure, push them to improve, and produce the authoritative Goldilocks grade.",
  },
];

function TeacherAccordionItem({
  agent,
  isOpen,
  onToggle,
}: {
  agent: TeacherAgent;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const [draft, setDraft] = useState(agent.defaultPrompt);
  const [saved, setSaved] = useState(agent.defaultPrompt);
  const isDirty = draft !== saved;
  const isCustomized = saved !== agent.defaultPrompt;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="hover:bg-foreground/[0.02] flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left transition-colors outline-none focus:outline-none focus-visible:outline-none"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-foreground text-[13px] font-medium">
              {agent.name}
            </span>
            {isCustomized ? (
              <span className="text-foreground/40 text-[10px] font-medium tracking-[0.04em] uppercase">
                Edited
              </span>
            ) : null}
          </div>
        </div>
        <CaretDown
          size={14}
          weight="bold"
          className={cn(
            "text-foreground/40 mt-1 shrink-0 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen ? (
        <div className="px-4 pb-4">
          <label
            htmlFor={`teacher-prompt-${agent.id}`}
            className="text-foreground/55 mb-1.5 block text-[11px] font-medium tracking-[0.02em]"
          >
            System prompt
          </label>
          <Textarea
            id={`teacher-prompt-${agent.id}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={6}
            className="text-[12.5px] leading-5"
          />
          <div className="mt-2.5 flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={draft === agent.defaultPrompt}
              onClick={() => setDraft(agent.defaultPrompt)}
            >
              Reset to default
            </Button>
            <Button
              size="sm"
              disabled={!isDirty}
              onClick={() => setSaved(draft)}
            >
              Save
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TeachersPanel() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center gap-3">
        <SettingsPageHeader title="Teachers" />
        <Badge variant="warning" className="shrink-0">
          Work in progress
        </Badge>
      </div>

      <div className="mt-6">
        <ModelSwitcherCard />
      </div>

      <div className="divide-border/60 border-border/50 bg-secondary mt-6 divide-y overflow-hidden rounded-lg border">
        {TEACHER_AGENTS.map((agent) => (
          <TeacherAccordionItem
            key={agent.id}
            agent={agent}
            isOpen={openId === agent.id}
            onToggle={() =>
              setOpenId((current) => (current === agent.id ? null : agent.id))
            }
          />
        ))}
      </div>
    </div>
  );
}
