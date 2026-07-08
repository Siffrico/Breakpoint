"use client";

import { useState } from "react";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@acme/ui/select";
import {
  AI_MODEL_OPTIONS,
  AiModelPreferenceSchema,
  DEFAULT_AI_MODEL,
} from "@acme/validators";
import type { AiModelPreference } from "@acme/validators";

// Matches the cookie the onboarding and workspace chat routes read to route the
// learner's turns. A year-long, lax cookie keeps the choice sticky per browser
// without a persisted account setting.
const AI_MODEL_COOKIE = "bp-ai-model";

const readModelPreference = (): AiModelPreference => {
  if (typeof document === "undefined") return DEFAULT_AI_MODEL;

  const cookieValue = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${AI_MODEL_COOKIE}=`))
    ?.split("=")[1];
  const parsed = AiModelPreferenceSchema.safeParse(cookieValue);

  return parsed.success ? parsed.data : DEFAULT_AI_MODEL;
};

const writeModelPreference = (model: AiModelPreference) => {
  if (typeof document === "undefined") return;

  document.cookie = `${AI_MODEL_COOKIE}=${model}; path=/; max-age=31536000; SameSite=Lax`;
};

export function ModelSwitcherCard() {
  const [selectedModel, setSelectedModel] =
    useState<AiModelPreference>(readModelPreference);

  const handleSelect = (model: AiModelPreference) => {
    setSelectedModel(model);
    writeModelPreference(model);
  };

  return (
    <div className="border-border/50 bg-secondary rounded-xl border p-5">
      <div className="text-foreground text-[13.5px] font-medium">Model</div>
      <div className="text-foreground/50 mt-0.5 text-[12px] leading-5">
        Powers every teaching, onboarding, and grading turn. New turns use your
        choice immediately.
      </div>

      <Select
        items={AI_MODEL_OPTIONS}
        value={selectedModel}
        onValueChange={(value) => {
          const parsed = AiModelPreferenceSchema.safeParse(value);
          if (parsed.success) handleSelect(parsed.data);
        }}
      >
        <SelectTrigger className="mt-4 max-w-md" aria-label="AI model">
          <SelectValue />
        </SelectTrigger>
        <SelectPopup>
          {AI_MODEL_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <div>
                <div className="font-medium">{option.label}</div>
                <div className="text-foreground/50 mt-0.5 text-xs leading-4">
                  {option.description}
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </div>
  );
}
