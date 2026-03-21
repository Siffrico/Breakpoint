"use client";

import { Field } from "@base-ui-components/react/field";

import { cn } from "@acme/ui";

export function Label({
  className,
  ...props
}: React.ComponentProps<typeof Field.Label>) {
  return (
    <Field.Label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
