import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

import { cn } from "@acme/ui";

const surfaceVariants = cva(
  "border text-card-foreground bg-card relative overflow-hidden transition-[border-color,transform,background-color,box-shadow]",
  {
    variants: {
      variant: {
        default:
          "border-border/80 bg-card shadow-[0_18px_80px_rgba(2,6,23,0.18)]",
        muted: "border-border/70 bg-secondary/40",
        interactive:
          "border-border/80 bg-card shadow-[0_18px_80px_rgba(2,6,23,0.18)] hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_26px_90px_rgba(2,6,23,0.24)]",
        emphasis: "border-primary/25 bg-primary/8 shadow-[0_18px_80px_rgba(37,99,235,0.12)]",
      },
      padding: {
        none: "",
        sm: "p-4",
        md: "p-5",
        lg: "p-6",
      },
    },
    defaultVariants: {
      variant: "default",
      padding: "md",
    },
  },
);

export function Surface({
  className,
  variant,
  padding,
  ...props
}: React.ComponentProps<"section"> & VariantProps<typeof surfaceVariants>) {
  return (
    <section
      data-slot="surface"
      className={cn(surfaceVariants({ variant, padding, className }))}
      {...props}
    />
  );
}

export function SurfaceHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="surface-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

export function SurfaceTitle({
  className,
  ...props
}: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="surface-title"
      className={cn(
        "font-display text-xl font-semibold tracking-[-0.04em] text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function SurfaceDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="surface-description"
      className={cn("text-sm leading-7 text-muted-foreground", className)}
      {...props}
    />
  );
}

export function SurfaceContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="surface-content"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  );
}

export function SurfaceFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="surface-footer"
      className={cn("flex items-center justify-between gap-4", className)}
      {...props}
    />
  );
}
