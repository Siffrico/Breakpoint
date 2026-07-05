"use client";

import { cn } from "@acme/ui";

export interface SlashMenuItem<TId extends string = string> {
  id: TId;
  label: string;
  description: string;
}

/**
 * Presentational dropdown for composer slash commands. It owns no parsing or
 * keyboard state — the host composer detects the `/query`, filters the items,
 * and drives `activeIndex`/`onSelect`. Anchored above the composer by the host.
 */
export function SlashCommandMenu<TId extends string>({
  items,
  activeIndex,
  onSelect,
  onHoverIndex,
  className,
}: {
  items: SlashMenuItem<TId>[];
  activeIndex: number;
  onSelect: (item: SlashMenuItem<TId>) => void;
  onHoverIndex?: (index: number) => void;
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Slash commands"
      className={cn(
        "bg-popover border-border absolute bottom-full left-0 z-30 mb-2 w-[min(22rem,calc(100%-1rem))] overflow-hidden rounded-[10px] border shadow-[0_8px_30px_-12px_rgba(0,0,0,0.45)]",
        className,
      )}
    >
      <div className="max-h-64 overflow-y-auto py-1">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            // Prevent the textarea from losing focus on click.
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(item);
            }}
            onMouseEnter={() => onHoverIndex?.(index)}
            className={cn(
              "flex w-full items-baseline gap-3 px-3 py-2 text-left",
              index === activeIndex ? "bg-foreground/[0.06]" : "bg-transparent",
            )}
          >
            <span className="text-foreground shrink-0 font-mono text-[13px]">
              {item.label}
            </span>
            <span className="text-muted-foreground truncate text-[12px] leading-5">
              {item.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
