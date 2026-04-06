"use client";

import { cn } from "@acme/ui";
import {
  Surface,
  SurfaceContent,
  SurfaceDescription,
  SurfaceHeader,
  SurfaceTitle,
} from "@acme/ui/surface";
import { useTheme, type ThemeMode } from "@acme/ui/theme";

const themeOptions: Array<{
  label: string;
  value: ThemeMode;
  description: string;
}> = [
  {
    label: "System",
    value: "auto",
    description: "Follow your device appearance.",
  },
  {
    label: "Dark",
    value: "dark",
    description: "Default Breakpoint workspace.",
  },
  {
    label: "Light",
    value: "light",
    description: "Light workspace with dark text.",
  },
];

export function ThemePreferenceCard() {
  const { themeMode, setTheme } = useTheme();

  return (
    <Surface padding="lg">
      <SurfaceHeader>
        <SurfaceTitle>Theme</SurfaceTitle>
        <SurfaceDescription>
          Choose how Breakpoint renders across the app.
        </SurfaceDescription>
      </SurfaceHeader>
      <SurfaceContent className="mt-6 gap-3">
        {themeOptions.map((option) => {
          const isActive = themeMode === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              className={cn(
                "flex items-start justify-between gap-4 border px-4 py-4 text-left transition-colors",
                isActive
                  ? "border-primary/60 bg-primary/[0.08]"
                  : "border-border/80 bg-transparent hover:border-foreground/30",
              )}
            >
              <div>
                <div className="text-sm font-medium text-foreground">
                  {option.label}
                </div>
                <div className="mt-1 text-sm leading-6 text-muted-foreground">
                  {option.description}
                </div>
              </div>
              {isActive ? (
                <span className="shrink-0 text-[11px] uppercase tracking-[0.2em] text-primary">
                  Active
                </span>
              ) : null}
            </button>
          );
        })}
      </SurfaceContent>
    </Surface>
  );
}
