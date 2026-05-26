import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { AuthFlow } from "~/features/auth/components/auth-flow";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in or create your Breakpoint account.",
};

export default async function AuthPage() {
  const session = await getSession();
  if (session?.user) redirect("/");

  return (
    <div className="bp-site relative min-h-dvh w-full overflow-x-hidden">
      <main className="flex min-h-dvh items-center justify-center px-6 py-28">
        <div className="w-full max-w-[400px]">
          <AuthFlow />
        </div>
      </main>

      <p className="absolute inset-x-0 bottom-8 text-center font-mono text-[12px] tracking-[0.03em] text-[var(--site-text-3)]">
        Terms of Service and Privacy Policy
      </p>
    </div>
  );
}
