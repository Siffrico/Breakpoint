export default function WorkspaceLoading() {
  return (
    <div className="bg-background text-foreground flex h-dvh overflow-hidden">
      <aside className="bg-sidebar hidden w-[220px] shrink-0 animate-pulse px-4 py-5 md:block">
        <div className="bg-foreground/10 h-5 w-24 rounded" />
        <div className="mt-8 space-y-3">
          <div className="bg-foreground/[0.08] h-8 rounded" />
          <div className="bg-foreground/[0.08] h-8 rounded" />
          <div className="bg-foreground/[0.08] h-8 rounded" />
        </div>
        <div className="mt-10 space-y-2">
          <div className="bg-foreground/[0.06] h-3 w-16 rounded" />
          <div className="bg-foreground/[0.08] h-7 rounded" />
          <div className="bg-foreground/[0.08] h-7 rounded" />
          <div className="bg-foreground/[0.08] h-7 rounded" />
        </div>
      </aside>

      <div className="border-foreground/[0.08] flex min-w-0 flex-1 flex-col md:border-l">
        <header className="border-foreground/[0.08] flex h-14 shrink-0 animate-pulse items-center border-b px-3 sm:px-6">
          <div className="bg-foreground/10 h-4 w-44 rounded" />
        </header>

        <main className="flex min-h-0 flex-1 justify-center overflow-hidden px-6 sm:px-10">
          <div className="flex w-full max-w-3xl animate-pulse flex-col justify-end py-8">
            <div className="space-y-5">
              <div className="bg-foreground/[0.06] h-3 w-28 rounded" />
              <div className="space-y-2">
                <div className="bg-foreground/[0.08] h-3 w-full rounded" />
                <div className="bg-foreground/[0.08] h-3 w-5/6 rounded" />
                <div className="bg-foreground/[0.08] h-3 w-2/3 rounded" />
              </div>
            </div>
            <div className="border-foreground/[0.08] mt-10 h-24 rounded-xl border">
              <div className="bg-foreground/[0.08] mt-4 ml-4 h-3 w-36 rounded" />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
