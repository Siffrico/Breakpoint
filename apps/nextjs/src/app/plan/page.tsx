import { redirect } from "next/navigation";

export default async function PlanPage(props: {
  searchParams: Promise<{ session?: string }>;
}) {
  const searchParams = await props.searchParams;
  const sessionId = searchParams.session;
  redirect(sessionId ? `/workspace?session=${sessionId}` : "/onboarding");
}
