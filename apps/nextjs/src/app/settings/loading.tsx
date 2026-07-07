export default function ProfileLoading() {
  return (
    <div className="bg-background text-foreground flex h-dvh">
      <aside className="border-foreground/[0.06] bg-sidebar flex w-[220px] shrink-0 flex-col border-r">
        <div className="space-y-3 p-4">
          <div className="bg-foreground/[0.06] h-3 w-20" />
          <div className="bg-foreground/[0.06] h-5 w-28" />
          <div className="bg-foreground/[0.06] h-5 w-24" />
          <div className="bg-foreground/[0.06] h-5 w-32" />
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl animate-pulse px-8 pt-12 pb-20 sm:px-12">
          <div className="bg-foreground/[0.08] h-6 w-40" />
          <div className="mt-10 space-y-3">
            <div className="bg-foreground/[0.06] h-4 w-24" />
            <div className="bg-foreground/[0.05] h-40 w-full" />
          </div>
          <div className="mt-10 space-y-3">
            <div className="bg-foreground/[0.06] h-4 w-24" />
            <div className="bg-foreground/[0.05] h-28 w-full" />
          </div>
        </div>
      </main>
    </div>
  );
}
