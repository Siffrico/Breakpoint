import type { Metadata } from "next";

import { AssistantRichText } from "~/features/training/components/assistant-rich-text";
import { previewPlanState } from "~/features/training/lib/training-preview";

export const metadata: Metadata = {
  title: "UI Preview - Overview",
  description: "Preview the Breakpoint project overview page.",
};

const previewOverview = `# Distributed systems as one reliable machine

Distributed systems are about making independent machines behave like one reliable system even though messages are delayed, machines fail, and different parts of the system can temporarily disagree.

The core analogy is a team of clerks running the same checkout counter from different cities. Replication means more than one clerk keeps a copy of the ledger. Quorum means you decide how many clerks must confirm a fact before you trust it. Consistency means deciding what customers are allowed to observe when the clerks are not perfectly synchronized.

The beginner trap is learning the vocabulary as labels. The real skill is tracing what each machine knows, when it learned it, and what guarantee the user can safely rely on.`;

export default function UiOverviewPage() {
  return (
    <main className="bg-background text-foreground min-h-dvh">
      <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
        <h1 className="font-display text-foreground text-2xl tracking-[-0.03em]">
          {previewPlanState.title}
        </h1>
        <p className="text-foreground/56 mt-3 text-[14px] leading-6">
          A preview of the long-form overview generated once per project.
        </p>

        <article className="bp-prose mt-8 text-[15px] leading-7">
          <AssistantRichText content={previewOverview} />
        </article>
      </div>
    </main>
  );
}
