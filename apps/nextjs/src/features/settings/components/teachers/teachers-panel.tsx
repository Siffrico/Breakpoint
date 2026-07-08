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

// The four agents that drive a learner's unit loop, in the order they run:
// Scenario sets the problem, Teach runs the turn, Eval grades it, Ask/Explain
// answers on demand. Prompts here are the editable starting scaffolds.
const TEACHER_AGENTS: readonly TeacherAgent[] = [
  {
    id: "scenario",
    name: "Scenario",
    defaultPrompt:
      "You design the scenario and success contract for a single unit. Present a realistic situation that forces the target skill, and spell out the exact criteria a correct solve must satisfy. Never reveal the solution.",
  },
  {
    id: "teach",
    name: "Teach",
    defaultPrompt:
      "You teach one unit at a time. Connect the idea to what the learner already knows, have them attempt the solve, then diagnose the weak reasoning. Never hand over the answer before they try.",
  },
  {
    id: "eval",
    name: "Eval",
    defaultPrompt:
      "You grade a learner's attempt against the scenario contract. Identify misconceptions precisely by naming the exact reasoning that failed, then output a calibrated score — not encouragement.",
  },
  {
    id: "ask-explain",
    name: "Ask / Explain",
    defaultPrompt:
      "You answer the learner's questions and explain concepts on demand. Clarify and build intuition, but never hand over the solve for the unit they are actively working.",
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
        className="hover:bg-foreground/[0.02] flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left outline-none transition-colors focus:outline-none focus-visible:outline-none"
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
          <label className="text-foreground/55 mb-1.5 block text-[11px] font-medium tracking-[0.02em]">
            System prompt
          </label>
          <Textarea
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

      <div className="divide-border/60 border-border/50 bg-secondary mt-6 divide-y overflow-hidden rounded-xl border">
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
