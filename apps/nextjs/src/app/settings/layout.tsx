import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { SettingsShell } from "~/features/settings/components/settings-shell";
import { listTopicNavItems } from "~/features/settings/server/settings-queries";
import { TRPCReactProvider } from "~/trpc/react";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/");
  }

  const topics = await listTopicNavItems().catch(() => []);

  return (
    <TRPCReactProvider>
      <SettingsShell topics={topics}>{children}</SettingsShell>
    </TRPCReactProvider>
  );
}
