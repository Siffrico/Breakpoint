"use client";

import type { ChatDesign } from "../types";

// Experimental chat designs go here — intentionally left blank for now.
//
// To add one: define a ChatDesign that renders the streaming `content` however
// you want (custom bubble, split-pane, inline-citations, etc.) and push it into
// EXPERIMENTAL_DESIGNS. The Chat Lab page picks these up automatically under the
// "Experimental" tab, streamed by the same mock transport as the current site.
//
// Example:
// export const EXPERIMENTAL_DESIGNS: ChatDesign[] = [
//   {
//     id: "cards",
//     label: "Card stack",
//     description: "Each block in its own card.",
//     render: (content) => <MyCardDesign content={content} />,
//   },
// ];

export const EXPERIMENTAL_DESIGNS: ChatDesign[] = [];
