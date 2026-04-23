import { redirect } from "next/navigation";

export default async function LegacyHomePage(props: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await props.searchParams;
  redirect(session ? `/workspace?session=${session}` : "/workspace");
}
