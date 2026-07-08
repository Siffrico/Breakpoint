"use client";

import type { ChatDesign } from "../types";
import { AssistantRichText } from "~/features/training/components/assistant-rich-text";

// The current site's chat rendering: edge-to-edge, no box, exactly how the live
// workspace assistant paints replies. This mirrors production — don't drift it
// to experiment; add new looks under ../experimental instead.
export const CURRENT_DESIGN: ChatDesign = {
  id: "current",
  label: "Current site",
  description: "How Breakpoint renders assistant messages today.",
  render: (content) => (
    <div className="text-foreground/94 w-full font-sans text-[15px] leading-7">
      <AssistantRichText content={content} />
    </div>
  ),
};
