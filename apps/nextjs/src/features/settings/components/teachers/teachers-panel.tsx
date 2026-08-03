"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CaretDown,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Textarea } from "@acme/ui/textarea";
import { toast } from "@acme/ui/toast";

import { SettingsPageHeader } from "~/features/settings/components/settings-shell";
import { ModelSwitcherCard } from "~/features/settings/components/teachers/model-switcher-card";
import { useTRPC } from "~/trpc/react";

type ExperienceState = RouterOutputs["profile"]["getEducationExperience"];
type Customization = ExperienceState["customization"];
type ReviewerTodo = Customization["reviewer"]["todos"][number];

const cloneCustomization = (value: Customization): Customization =>
  structuredClone(value);

function AgentHeader({
  name,
  edited,
  open,
  onToggle,
}: {
  name: string;
  edited: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="hover:bg-foreground/[0.02] flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left transition-colors outline-none"
    >
      <div className="flex items-center gap-2">
        <span className="text-foreground text-[13px] font-medium">{name}</span>
        {edited ? (
          <span className="text-foreground/40 text-[10px] font-medium tracking-[0.04em] uppercase">
            Edited
          </span>
        ) : null}
      </div>
      <CaretDown
        size={14}
        weight="bold"
        className={cn(
          "text-foreground/40 mt-1 shrink-0 transition-transform duration-200",
          open && "rotate-180",
        )}
      />
    </button>
  );
}

export function CustomizePanel({ initial }: { initial: ExperienceState }) {
  const trpc = useTRPC();
  const [saved, setSaved] = useState(() =>
    cloneCustomization(initial.customization),
  );
  const [draft, setDraft] = useState(() =>
    cloneCustomization(initial.customization),
  );
  const [openId, setOpenId] = useState<"mentor" | "reviewer" | null>("mentor");

  const updateExperience = useMutation(
    trpc.profile.updateEducationExperience.mutationOptions({
      onSuccess: (updated) => {
        setSaved(cloneCustomization(updated));
        setDraft(cloneCustomization(updated));
        toast.success("Agent customization saved.");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(saved),
    [draft, saved],
  );
  const mentorEdited =
    draft.main.instructions !== initial.defaults.main.instructions;
  const reviewerEdited =
    JSON.stringify(draft.reviewer) !==
    JSON.stringify(initial.defaults.reviewer);

  const updateReviewerTodo = (
    todoId: string,
    update: (todo: ReviewerTodo) => ReviewerTodo,
  ) => {
    setDraft((current) => ({
      ...current,
      reviewer: {
        ...current.reviewer,
        todos: current.reviewer.todos.map((todo) =>
          todo.id === todoId ? update(todo) : todo,
        ),
      },
    }));
  };

  const moveReviewerTodo = (index: number, direction: -1 | 1) => {
    setDraft((current) => {
      const todos = [...current.reviewer.todos];
      const destination = index + direction;
      if (destination < 0 || destination >= todos.length) return current;
      const [todo] = todos.splice(index, 1);
      if (!todo) return current;
      todos.splice(destination, 0, todo);
      return {
        ...current,
        reviewer: { ...current.reviewer, todos },
      };
    });
  };

  const removeReviewerTodo = (todoId: string) => {
    setDraft((current) => ({
      ...current,
      reviewer: {
        ...current.reviewer,
        todos: current.reviewer.todos.filter((todo) => todo.id !== todoId),
      },
    }));
  };

  const addReviewerTodo = () => {
    setDraft((current) => ({
      ...current,
      reviewer: {
        ...current.reviewer,
        todos: [
          ...current.reviewer.todos,
          {
            id: `review-${crypto.randomUUID()}`,
            goal: "New review requirement",
            completionEvidence: [
              "Describe the evidence required to complete it.",
            ],
          },
        ],
      },
    }));
  };

  return (
    <div>
      <SettingsPageHeader title="Customize" />

      <div className="mt-6">
        <ModelSwitcherCard />
      </div>

      <div className="divide-border/60 border-border/50 bg-secondary mt-6 divide-y overflow-hidden rounded-lg border">
        <div>
          <AgentHeader
            name="Unit mentor"
            edited={mentorEdited}
            open={openId === "mentor"}
            onToggle={() =>
              setOpenId((current) => (current === "mentor" ? null : "mentor"))
            }
          />
          {openId === "mentor" ? (
            <div className="px-4 pb-4">
              <label
                htmlFor="mentor-prompt"
                className="text-foreground/55 mb-1.5 block text-[11px] font-medium"
              >
                Behavior prompt
              </label>
              <Textarea
                id="mentor-prompt"
                value={draft.main.instructions}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    main: { instructions: event.target.value },
                  }))
                }
                rows={6}
                className="text-[12.5px] leading-5"
              />
              <p className="text-foreground/45 mt-2 text-[11px] leading-4">
                Mentor capability todos are generated from each unit&apos;s
                mastery contract.
              </p>
            </div>
          ) : null}
        </div>

        <div>
          <AgentHeader
            name="Adversarial reviewer"
            edited={reviewerEdited}
            open={openId === "reviewer"}
            onToggle={() =>
              setOpenId((current) =>
                current === "reviewer" ? null : "reviewer",
              )
            }
          />
          {openId === "reviewer" ? (
            <div className="px-4 pb-4">
              <label
                htmlFor="reviewer-prompt"
                className="text-foreground/55 mb-1.5 block text-[11px] font-medium"
              >
                Behavior prompt
              </label>
              <Textarea
                id="reviewer-prompt"
                value={draft.reviewer.instructions}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    reviewer: {
                      ...current.reviewer,
                      instructions: event.target.value,
                    },
                  }))
                }
                rows={6}
                className="text-[12.5px] leading-5"
              />

              <div className="mt-5 flex items-center justify-between">
                <div className="text-foreground/70 text-[11px] font-medium">
                  Ordered review todos
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={draft.reviewer.todos.length >= 8}
                  onClick={addReviewerTodo}
                >
                  <Plus size={13} />
                  Add todo
                </Button>
              </div>

              <div className="mt-2.5 space-y-2.5">
                {draft.reviewer.todos.map((todo, index) => (
                  <div
                    key={todo.id}
                    className="border-foreground/10 bg-background/45 rounded-md border p-3"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-foreground/40 mt-2 text-[11px] tabular-nums">
                        {index + 1}
                      </span>
                      <Input
                        aria-label={`Review todo ${index + 1}`}
                        value={todo.goal}
                        onChange={(event) =>
                          updateReviewerTodo(todo.id, (current) => ({
                            ...current,
                            goal: event.target.value,
                          }))
                        }
                        className="flex-1"
                      />
                      <div className="flex shrink-0 items-center">
                        <button
                          type="button"
                          aria-label="Move todo up"
                          disabled={index === 0}
                          onClick={() => moveReviewerTodo(index, -1)}
                          className="text-foreground/48 hover:text-foreground p-1.5 disabled:opacity-25"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label="Move todo down"
                          disabled={index === draft.reviewer.todos.length - 1}
                          onClick={() => moveReviewerTodo(index, 1)}
                          className="text-foreground/48 hover:text-foreground p-1.5 disabled:opacity-25"
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete todo"
                          disabled={draft.reviewer.todos.length === 1}
                          onClick={() => removeReviewerTodo(todo.id)}
                          className="text-foreground/48 hover:text-destructive p-1.5 disabled:opacity-25"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    </div>
                    <label className="text-foreground/45 mt-2 block text-[10.5px] font-medium">
                      Completion evidence, one signal per line
                    </label>
                    <Textarea
                      value={todo.completionEvidence.join("\n")}
                      onChange={(event) =>
                        updateReviewerTodo(todo.id, (current) => ({
                          ...current,
                          completionEvidence: event.target.value.split("\n"),
                        }))
                      }
                      rows={2}
                      className="mt-1 text-[12px] leading-4"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button
          variant="ghost"
          disabled={updateExperience.isPending}
          onClick={() => setDraft(cloneCustomization(initial.defaults))}
        >
          Reset to defaults
        </Button>
        <Button
          loading={updateExperience.isPending}
          disabled={!isDirty || updateExperience.isPending}
          onClick={() => updateExperience.mutate(draft)}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
