import { Separator } from "@acme/ui/separator";

import { ProfileAvatar } from "./profile-avatar";
import { ProfileTabs, type ProfileTabKey } from "./profile-tabs";

export function ProfileShell({
  name,
  image,
  basePath = "/profile",
  activeTab,
  children,
}: {
  name: string;
  image?: string | null;
  basePath?: string;
  activeTab?: ProfileTabKey;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6 pb-16 pt-10 sm:px-10">
        <header className="flex items-center justify-between gap-6">
          <h1 className="font-display text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
            Profile
          </h1>
          <ProfileAvatar name={name} image={image} />
        </header>
        <div className="mt-10">
          <ProfileTabs basePath={basePath} activeTab={activeTab} />
          <Separator />
        </div>
        <div className="pt-10">{children}</div>
      </div>
    </main>
  );
}
