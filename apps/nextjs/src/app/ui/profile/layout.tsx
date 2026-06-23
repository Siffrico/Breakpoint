import { Suspense } from "react";

import { TRPCReactProvider } from "~/trpc/react";

export default function UiProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TRPCReactProvider>
      <Suspense>{children}</Suspense>
    </TRPCReactProvider>
  );
}
