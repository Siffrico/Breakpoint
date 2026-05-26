import Link from "next/link";

/**
 * The "breakpoint" name — sits in the top-left corner of the site landing.
 * Set in Playwrite GB J Guides (`--font-wordmark`) so it reads as a hand-
 * written signature against the monospace body copy. The face is a joined
 * cursive, so we drop the negative tracking that suited Space Grotesk.
 */
export function SiteWordmark() {
  return (
    <Link
      href="/"
      className="font-wordmark text-[22px] leading-none text-[var(--site-fg)] transition-opacity hover:opacity-65"
    >
      Breakpoint
    </Link>
  );
}
