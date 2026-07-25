"use client";

import type { ThemeMode } from "@acme/ui/theme";
import { useTheme } from "@acme/ui/theme";

const themeOptions: {
  label: string;
  value: ThemeMode;
  description: string;
}[] = [
  {
    label: "System",
    value: "auto",
    description: "Follow your device appearance.",
  },
  {
    label: "Dark",
    value: "dark",
    description: "Use the default Breakpoint dark workspace.",
  },
  {
    label: "Light",
    value: "light",
    description: "Use the light workspace with dark text.",
  },
];

export function ProfilePreferences() {
  const { themeMode, setTheme } = useTheme();

  return (
    <section className="border-border border-b p-6">
      <h2 className="font-display text-foreground text-lg tracking-[-0.03em]">
        Preferences
      </h2>
      <div className="mt-5">
        <div className="text-foreground text-[13px]">Theme</div>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          Choose how Breakpoint should look across the app.
        </p>
        <div className="mt-4 grid gap-2">
          {themeOptions.map((option) => {
            const isActive = themeMode === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                className={[
                  "flex items-start justify-between border px-4 py-3 text-left transition-colors",
                  isActive
                    ? "border-primary bg-primary/[0.08]"
                    : "border-border hover:bg-accent/40 bg-transparent",
                ].join(" ")}
              >
                <div>
                  <div className="text-foreground text-[13px]">
                    {option.label}
                  </div>
                  <div className="text-muted-foreground mt-1 text-sm leading-6">
                    {option.description}
                  </div>
                </div>
                {isActive ? (
                  <span className="text-primary ml-4 shrink-0 text-[11px] tracking-[0.16em] uppercase">
                    Active
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
