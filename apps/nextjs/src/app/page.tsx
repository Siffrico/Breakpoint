import type { Metadata } from "next";

import { SiteLanding } from "~/features/marketing/components/site-landing";

/*
 * This route renders the simple one-page Breakpoint site (`site-landing.tsx`).
 *
 * The larger, multi-section marketing landing is a WORK IN PROGRESS — it is
 * preserved, but not routed, in `features/marketing/components/scaled-landing.tsx`.
 * It will be finished and wired back up here when we scale the marketing site.
 */

export const metadata: Metadata = {
  title: "Breakpoint — train into the person you said you'd become",
  description:
    "Breakpoint builds a curriculum around your real gap, makes every unit active, and puts you on projects that prove the skill is yours.",
};

export default function HomePage() {
  return <SiteLanding />;
}
