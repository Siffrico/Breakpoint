"use client";

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
    <section className="border-b border-border p-6">
      <h2 className="font-display text-lg tracking-[-0.03em] text-foreground">
        Preferences
      </h2>
      <div className="mt-5">
        <div className="text-[13px] text-foreground">Theme</div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
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
                    : "border-border bg-transparent hover:bg-accent/40",
                ].join(" ")}
              >
                <div>
                  <div className="text-[13px] text-foreground">{option.label}</div>
                  <div className="mt-1 text-sm leading-6 text-muted-foreground">
                    {option.description}
                  </div>
                </div>
                {isActive ? (
                  <span className="ml-4 shrink-0 text-[11px] uppercase tracking-[0.16em] text-primary">
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
