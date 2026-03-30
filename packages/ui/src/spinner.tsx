"use client";

import type * as React from "react";

import { cn } from "@acme/ui";

export function Spinner({
  className,
  ...props
}: React.ComponentProps<"svg">): React.ReactElement {
  return (
    <svg
      aria-label="Loading"
      className={cn("animate-spin", className)}
      fill="none"
      role="status"
      viewBox="0 0 24 24"
      {...props}
    >
      <circle
        className="opacity-20"
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-100"
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  );
}
