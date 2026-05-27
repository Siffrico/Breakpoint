"use client";

import { useEffect, useState } from "react";

import { cn } from "@acme/ui";
import { useTheme, type ThemeMode } from "@acme/ui/theme";
import {
  AI_MODEL_OPTIONS,
  AiModelPreferenceSchema,
  type AiModelPreference,
} from "@acme/validators";

import {
  SettingRow,
  SettingsPageHeader,
  SettingsSection,
} from "~/features/profile/components/profile-shell";

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: "auto", label: "System" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

const AI_MODEL_COOKIE = "bp-ai-model";
const DEFAULT_AI_MODEL: AiModelPreference = "gemini-3.1-flash-lite";

const readModelPreference = (): AiModelPreference => {
  const cookieValue = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${AI_MODEL_COOKIE}=`))
    ?.split("=")[1];
  const parsed = AiModelPreferenceSchema.safeParse(cookieValue);

  return parsed.success ? parsed.data : DEFAULT_AI_MODEL;
};

const writeModelPreference = (model: AiModelPreference) => {
  document.cookie = `${AI_MODEL_COOKIE}=${model}; path=/; max-age=31536000; SameSite=Lax`;
};

export function ThemePreferenceCard() {
  const { themeMode, setTheme } = useTheme();
  const [selectedModel, setSelectedModel] =
    useState<AiModelPreference>(DEFAULT_AI_MODEL);

  useEffect(() => {
    setSelectedModel(readModelPreference());
  }, []);

  const handleModelChange = (model: AiModelPreference) => {
    setSelectedModel(model);
    writeModelPreference(model);
  };

  return (
    <div>
      <SettingsPageHeader title="Preferences" />

      <SettingsSection title="Interface and theme">
        <SettingRow
          label="Interface theme"
          description="How Breakpoint renders across the app."
          control={
            <div className="border-foreground/[0.08] inline-flex border">
              {themeOptions.map((option) => {
                const isActive = themeMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTheme(option.value)}
                    className={cn(
                      "px-3 py-1 text-[12px] outline-none transition-colors focus:outline-none focus-visible:outline-none",
                      isActive
                        ? "bg-foreground/[0.06] text-foreground"
                        : "text-foreground/60 hover:text-foreground/88",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          }
        />
      </SettingsSection>

      <SettingsSection title="AI model">
        <SettingRow
          label="Default model"
          description="Used for new onboarding, tutor, recall, and workspace AI turns."
          control={
            <div className="border-foreground/[0.08] inline-flex border">
              {AI_MODEL_OPTIONS.map((option) => {
                const isActive = selectedModel === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    title={option.description}
                    onClick={() => handleModelChange(option.value)}
                    className={cn(
                      "px-3 py-1 text-[12px] outline-none transition-colors focus:outline-none focus-visible:outline-none",
                      isActive
                        ? "bg-foreground/[0.06] text-foreground"
                        : "text-foreground/60 hover:text-foreground/88",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          }
        />
      </SettingsSection>
    </div>
  );
}
