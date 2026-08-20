import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TopicDetail } from "~/features/settings/components/topics/topic-detail";
import { getProjectTopic } from "~/features/settings/server/settings-queries";
import { recoverTRPCError } from "~/trpc/errors";

export const metadata: Metadata = {
  title: "Topic · Settings",
  description: "Skill clusters and your standing in this project.",
};

export default async function SettingsTopicPage(props: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await props.params;

  // projectTopic throws NOT_FOUND / FORBIDDEN for unknown or unowned projects;
  // both should read as a missing page rather than a server error.
  const topic = await recoverTRPCError({
    promise: getProjectTopic(sessionId),
    codes: ["NOT_FOUND", "FORBIDDEN"],
    fallback: null,
  });

  if (!topic) {
    notFound();
  }

  return <TopicDetail topic={topic} />;
}
