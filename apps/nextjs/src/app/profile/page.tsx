import { redirect } from "next/navigation";

export default async function ProfilePage(props: {
  searchParams: Promise<{ session?: string }>;
}) {
  const searchParams = await props.searchParams;
  redirect(
    searchParams.session
      ? `/profile/general?session=${searchParams.session}`
      : "/profile/general",
  );
}
