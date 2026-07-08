"use client";

import { cn } from "@acme/ui";
import { useTheme } from "@acme/ui/theme";
import type { ThemeMode } from "@acme/ui/theme";

import {
  SettingRow,
  SettingsSection,
} from "~/features/settings/components/settings-shell";

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: "auto", label: "System" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

export function ThemePreferenceCard() {
  const { themeMode, setTheme } = useTheme();

  return (
    <SettingsSection title="Interface and theme">
      <SettingRow
        label="Interface theme"
        control={
          <div className="border-foreground/[0.08] inline-flex overflow-hidden rounded-lg border">
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
  );
}
