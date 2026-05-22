import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Training unit",
  description: "Work through a Breakpoint training unit.",
};

import { redirect } from "next/navigation";

export default async function TrainUnitPage(props: {
  searchParams: Promise<{ session?: string }>;
}) {
  const searchParams = await props.searchParams;
  const sessionId = searchParams.session;

  redirect(sessionId ? `/workspace?session=${sessionId}` : "/workspace");
}
