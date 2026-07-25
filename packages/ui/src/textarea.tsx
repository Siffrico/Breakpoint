"use client";

import type * as React from "react";
import { Field as FieldPrimitive } from "@base-ui/react/field";
import { mergeProps } from "@base-ui/react/merge-props";

import { cn } from "@acme/ui";

export type TextareaProps = React.ComponentPropsWithoutRef<"textarea"> &
  React.RefAttributes<HTMLTextAreaElement> & {
    size?: "sm" | "default" | "lg" | number;
    unstyled?: boolean;
  };

export function Textarea({
  className,
  size = "default",
  unstyled = false,
  ref,
  ...props
}: TextareaProps): React.ReactElement {
  return (
    <span
      className={
        cn(
          !unstyled &&
            "border-input bg-background not-dark:bg-clip-padding text-foreground shadow-xs/5 has-focus-visible:has-aria-invalid:border-destructive/64 has-focus-visible:has-aria-invalid:ring-destructive/16 has-aria-invalid:border-destructive/36 has-focus-visible:border-foreground/16 has-disabled:opacity-64 has-focus-visible:ring-0 not-has-disabled:has-not-focus-visible:not-has-aria-invalid:before:shadow-[0_1px_--theme(--color-black/4%)] dark:bg-input/32 dark:has-aria-invalid:ring-destructive/24 dark:not-has-disabled:has-not-focus-visible:not-has-aria-invalid:before:shadow-[0_-1px_--theme(--color-white/6%)] relative inline-flex w-full rounded-lg border text-base transition-shadow before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] has-[:disabled,:focus-visible,[aria-invalid]]:shadow-none sm:text-sm",
          className,
        ) || undefined
      }
      data-size={size}
      data-slot="textarea-control"
    >
      <FieldPrimitive.Control
        defaultValue={props.defaultValue}
        disabled={props.disabled}
        id={props.id}
        name={props.name}
        ref={ref}
        render={(defaultProps: React.ComponentProps<"textarea">) => (
          <textarea
            className={cn(
              "field-sizing-content min-h-17.5 max-sm:min-h-20.5 w-full rounded-[inherit] px-[calc(--spacing(3)-1px)] py-[calc(--spacing(1.5)-1px)] outline-none",
              size === "sm" &&
                "min-h-16.5 max-sm:min-h-19.5 px-[calc(--spacing(2.5)-1px)] py-[calc(--spacing(1)-1px)]",
              size === "lg" &&
                "min-h-18.5 max-sm:min-h-21.5 py-[calc(--spacing(2)-1px)]",
            )}
            data-slot="textarea"
            {...mergeProps(defaultProps, props)}
          />
        )}
        value={props.value}
      />
    </span>
  );
}

export { FieldPrimitive };
