export default function ProfileLoading() {
  return (
    <main className="min-h-dvh bg-background px-5 py-8 text-foreground sm:px-8">
      <div className="mx-auto max-w-5xl animate-pulse space-y-6">
        <div className="flex items-start justify-between">
          <div className="space-y-4">
            <div className="h-3 w-24 rounded bg-secondary" />
            <div className="flex gap-6">
              <div className="h-5 w-16 rounded bg-secondary" />
              <div className="h-5 w-24 rounded bg-secondary" />
              <div className="h-5 w-28 rounded bg-secondary" />
            </div>
          </div>
          <div className="h-10 w-10 rounded-full bg-secondary" />
        </div>
        <div className="grid gap-6">
          <div className="h-64 rounded-2xl bg-secondary/60" />
          <div className="h-44 rounded-2xl bg-secondary/60" />
        </div>
      </div>
    </main>
  );
}
