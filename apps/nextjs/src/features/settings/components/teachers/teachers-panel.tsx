"use client";

import { useState } from "react";
import { ChalkboardTeacher } from "@phosphor-icons/react";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Textarea } from "@acme/ui/textarea";

import { SettingsPageHeader } from "~/features/settings/components/settings-shell";
import { ModelSwitcherCard } from "~/features/settings/components/teachers/model-switcher-card";

interface TeacherAgent {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
}

// The live teaching agents that shape a learner's path. Prompts shown here are
// starter scaffolds — the running agents compose their instructions
// dynamically. Editing is intentionally unwired until the prompt-registry write
// path lands.
const TEACHER_AGENTS: readonly TeacherAgent[] = [
  {
    id: "onboarding-interviewer",
    name: "Onboarding interviewer",
    role: "Elicits the target identity, motivation, and starting point.",
    systemPrompt:
      "You interview a new learner to uncover who they are trying to become. Ask one sharp question at a time. Surface the hard moments where their current default breaks.",
  },
  {
    id: "curriculum-designer",
    name: "Curriculum designer",
    role: "Turns the identity report into a skill-cluster plan.",
    systemPrompt:
      "You design a curriculum as a tree of skill clusters. Each cluster must map to a demonstrable capability the target identity requires, ordered by dependency.",
  },
  {
    id: "syllabus-designer",
    name: "Syllabus designer",
    role: "Expands each cluster into concrete syllabus entries.",
    systemPrompt:
      "You break a skill cluster into the specific ideas, moves, and failure modes a learner must master, each with a one-line gloss.",
  },
  {
    id: "workspace-tutor",
    name: "Workspace tutor",
    role: "Runs the live teaching turn inside a unit.",
    systemPrompt:
      "You teach one unit at a time. Connect, then have the learner solve, then diagnose weak reasoning. Never hand over the answer before they attempt it.",
  },
  {
    id: "evaluator",
    name: "Evaluator",
    role: "Scores attempts and updates the learner's rating.",
    systemPrompt:
      "You grade a learner's solve against the scenario contract. Identify misconceptions by code. Output a calibrated score, not encouragement.",
  },
  {
    id: "capstone-examiner",
    name: "Capstone examiner",
    role: "Runs the cluster capstone simulation.",
    systemPrompt:
      "You run a multi-round capstone that proves cluster mastery under realistic pressure. Escalate difficulty as the learner holds up.",
  },
];

function TeacherCard({ agent }: { agent: TeacherAgent }) {
  const [prompt, setPrompt] = useState(agent.systemPrompt);
  const isDirty = prompt !== agent.systemPrompt;

  return (
    <div className="border-border bg-card border p-5">
      <div className="flex items-start gap-3">
        <div className="border-border/70 bg-background text-foreground/70 flex size-8 shrink-0 items-center justify-center rounded-full border">
          <ChalkboardTeacher size={16} weight="regular" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-foreground text-[13.5px] font-medium">
            {agent.name}
          </div>
          <div className="text-foreground/50 mt-0.5 text-[12px] leading-5">
            {agent.role}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <label className="text-foreground/60 mb-1.5 block text-[11px] font-medium tracking-[0.02em]">
          System prompt
        </label>
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={4}
          className="text-[12.5px]"
        />
      </div>

      <div className="mt-3 flex items-center justify-end">
        {/* Unwired until the prompt-registry write path exists. */}
        <Button size="sm" variant="outline" disabled title="Coming soon">
          {isDirty ? "Save (coming soon)" : "Save"}
        </Button>
      </div>
    </div>
  );
}

export function TeachersPanel() {
  return (
    <div>
      <div className="flex items-center gap-3">
        <SettingsPageHeader
          title="Teachers"
          description="The agents that interview, plan, teach, and grade your path."
        />
        <Badge variant="warning" className="mt-1 shrink-0">
          Work in progress
        </Badge>
      </div>

      <div className="mt-6">
        <ModelSwitcherCard />
      </div>

      <div className="border-warning/25 bg-warning/8 text-warning-foreground mt-6 border px-4 py-3 text-[12px] leading-5">
        Editing system prompts is a preview. Changes are not saved yet — the
        write path is still being built.
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {TEACHER_AGENTS.map((agent) => (
          <TeacherCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}
