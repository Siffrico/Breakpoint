"use client";

import { useEffect, useState } from "react";

import { cn } from "@acme/ui";

const phaseMessages: Record<string, string> = {
  build: "Your intuition is captured. Now let's build on it.",
  prove: "You've built the concept. Now prove you own it.",
  isolation: "Let's isolate where your reasoning broke.",
  debrief: "Training complete. Here's what changed.",
};

export function PhaseTransition({
  targetPhase,
  onComplete,
}: {
  targetPhase: string;
  onComplete: () => void;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onComplete, 300);
    }, 1800);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div
      className={cn(
        "flex min-h-[200px] items-center justify-center transition-opacity duration-300",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <p className="font-display max-w-md text-center text-lg tracking-[-0.03em] text-muted-foreground">
        {phaseMessages[targetPhase] ?? ""}
      </p>
    </div>
  );
}
