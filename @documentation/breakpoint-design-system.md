# Breakpoint Design System

## Foundation

Breakpoint uses a **dark-first, matte black** design language with **sharp corners** (radius: 0) and **blue as the primary accent color**. Built on Base UI primitives with Tailwind CSS v4.

## Core Principles

1. **Matte black surfaces** — backgrounds use deep blacks (#050709, #0e0e0e, #111111). No glossy effects.
2. **Sharp corners everywhere** — `rounded-none` / `--radius: 0rem`. No border-radius on any component.
3. **Blue is the only accent** — primary color is `oklch(0.58 0.19 262)` (blue). Used for buttons, links, focus rings, and interactive highlights.
4. **Minimal borders** — borders use `white/[0.06]` to `white/12` opacity. Subtle, not prominent.
5. **No decorative labels** — BANNED: small uppercase tracked text used as section labels (e.g. "Active Path", "Progress", "Next", "Start Here", "BREAKPOINT", "Becoming Intake"). These are AI slop. Never create `text-xs tracking-[...] uppercase text-white/35` label elements. Content should speak for itself without decorative categorization text above it.
6. **Small, sleek typography** — headings max out at `text-3xl`. Body text at `text-sm` or `text-xs`. No oversized hero text.

## Color Tokens

| Token | Light/Default | Dark |
|-------|--------------|------|
| `--background` | `oklch(0.13 0 0)` | `oklch(0.11 0 0)` |
| `--foreground` | `oklch(0.93 0 0)` | `oklch(0.95 0 0)` |
| `--card` | `oklch(0.16 0 0)` | `oklch(0.14 0 0)` |
| `--primary` | `oklch(0.58 0.19 262)` | `oklch(0.62 0.19 262)` |
| `--primary-foreground` | `oklch(1 0 0)` | `oklch(1 0 0)` |
| `--border` | `oklch(0.24 0 0)` | `oklch(0.22 0 0)` |
| `--muted-foreground` | `oklch(0.55 0 0)` | `oklch(0.55 0 0)` |

Both light and dark modes are dark. The "light" mode is a slightly lighter dark. This is intentional.

## Component Styling

### Button
- `rounded-none`, blue bg by default, white text
- Sizes: sm (h-8), default (h-9), lg (h-10), icon (size-9)
- Variants: default (blue), destructive, outline, secondary, ghost, link

### Input / Textarea
- `rounded-none`, transparent bg, border-input
- Focus must use restrained neutral border contrast or a subtle surface shift
- BANNED: blue focus rings, browser-default blue outlines, and bright blue click states on writing surfaces or standard controls

### Cards / Surfaces
- `rounded-none`, `bg-card`, subtle border
- No drop shadows on cards by default — use `shadow-sm` sparingly

### Badge
- No border-radius, uppercase tracking, small text (11px)

### Dropdown Menu
- `rounded-none` on all items and popups
- `bg-popover` background

## Gradients (Page-level only)

Gradients are **only** used at the page level for atmosphere, never on components:
- Dark blue concentric radial gradients on page periphery
- Film grain overlay (canvas-generated, tiled PNG for performance)
- Background color: `#050709`

## Spacing

- Base spacing unit: `0.25rem`
- Tight padding on interactive elements
- Generous vertical spacing between sections (`mb-8` to `mb-10`)
- spacing, balance, and proportion are first-class rules
- if two headers or surfaces visually correspond, their lines and baselines must align exactly
- labels must sit proportionally inside the space assigned to them; do not push text to an edge with `justify-between` unless that separation is the actual intent
- solve alignment structurally before patching with random padding nudges

## Typography

- Body font: `var(--font-body)` via `--font-sans`
- Display font: `var(--font-display)` for headings
- Mono font: `var(--font-geist-mono)`
- Max heading size in UI: `text-3xl` / `text-4xl`
- Do not invent decorative eyebrow labels above primary headers

## Icons

- Phosphor is the default icon library
- Icon-only controls should be unboxed by default
- Do not place icons in boxes unless the box communicates a real state or primary action
- Keep icon spacing and visual weight consistent within a row

## Primitives

All UI primitives are built on **Base UI** (`@base-ui-components/react`), not Radix. The `asChild` pattern is supported via React `cloneElement`.
