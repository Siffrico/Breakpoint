"use client";

import { Separator as SeparatorPrimitive } from "@base-ui-components/react/separator";

import { cn } from "@acme/ui";

export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive> & {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
}) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      data-orientation={orientation}
      className={cn(
        "bg-border shrink-0",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}
