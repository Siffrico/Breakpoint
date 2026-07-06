import type { ReactNode } from "react";

// A chat design: given the (possibly still-streaming) assistant text, render it
// however this design frames a message. Both the "current site" design and any
// future experimental designs conform to this so the page can swap between them
// without knowing their internals.
export interface ChatDesign {
  id: string;
  label: string;
  description: string;
  render: (content: string) => ReactNode;
}
