import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { AuthArt } from "~/features/auth/components/auth-art";
import { AuthFlow } from "~/features/auth/components/auth-flow";

export default async function AuthPage() {
  const session = await getSession();
  if (session?.user) redirect("/");

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.1fr_minmax(0,560px)]">
      <aside className="relative hidden lg:block">
        <AuthArt />
      </aside>
      <section className="grid place-items-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <AuthFlow />
        </div>
      </section>
    </main>
  );
}
