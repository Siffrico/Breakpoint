import Link from "next/link";

/**
 * The "breakpoint" name — sits in the top-left corner of the site landing.
 * Set in Space Grotesk (`--font-wordmark`) so it reads sleek and modern,
 * distinct from the monospace body copy.
 */
export function SiteWordmark() {
  return (
    <Link
      href="/"
      className="font-wordmark text-[21px] font-medium lowercase tracking-[-0.04em] text-[var(--site-fg)] transition-opacity hover:opacity-65"
    >
      breakpoint
    </Link>
  );
}
