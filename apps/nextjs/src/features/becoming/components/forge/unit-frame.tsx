"use client";

export function UnitFrame({
  clusterArcFrame,
}: {
  clusterArcFrame: string;
}) {
  return (
    <section className="border border-border bg-card px-6 py-5 shadow-[0_18px_80px_rgba(2,6,23,0.18)]">
      <div className="flex items-center gap-3">
        <div className="h-2 w-2 bg-primary" />
        <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
          Why This Unit Now
        </span>
      </div>

      <p className="mt-4 max-w-3xl text-sm leading-7 text-foreground/78">
        {clusterArcFrame}
      </p>
    </section>
  );
}
