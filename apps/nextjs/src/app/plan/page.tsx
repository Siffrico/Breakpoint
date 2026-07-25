import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Plan",
  description: "Review your Breakpoint plan.",
};

export default async function PlanPage(props: {
  searchParams: Promise<{ session?: string }>;
}) {
  const searchParams = await props.searchParams;
  const sessionId = searchParams.session;
  redirect(sessionId ? `/curriculum?session=${sessionId}` : "/curriculum");
}
