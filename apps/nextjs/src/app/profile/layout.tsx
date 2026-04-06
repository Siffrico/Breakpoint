import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { ProfileShell } from "~/features/profile/components/profile-shell";

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/");
  }

  return (
    <ProfileShell name={session.user.name} image={session.user.image}>
      {children}
    </ProfileShell>
  );
}
