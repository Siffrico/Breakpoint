import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

import { cn } from "@acme/ui";

const badgeVariants = cva(
  "inline-flex items-center gap-2 border px-3 py-1 text-[11px] font-medium tracking-[0.18em] uppercase transition-colors",
  {
    variants: {
      variant: {
        default: "border-primary/30 bg-primary/12 text-primary",
        muted: "border-border bg-secondary text-muted-foreground",
        outline: "border-border bg-transparent text-foreground/70",
        success: "border-primary/20 bg-primary/10 text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  );
}
