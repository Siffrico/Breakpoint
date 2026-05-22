import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { ProfileShell } from "~/features/profile/components/profile-shell";
import { TRPCReactProvider } from "~/trpc/react";

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
    <TRPCReactProvider>
      <ProfileShell>{children}</ProfileShell>
    </TRPCReactProvider>
  );
}
