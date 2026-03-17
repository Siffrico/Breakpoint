import Link from "next/link";

import type { RouterOutputs } from "@acme/api";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import {
  Surface,
  SurfaceContent,
  SurfaceDescription,
  SurfaceFooter,
  SurfaceHeader,
  SurfaceTitle,
} from "@acme/ui/surface";

type LearningDomainCard = RouterOutputs["esdeSimulation"]["catalog"][number];

interface DomainSelectionProps {
  domains: LearningDomainCard[];
}

export function DomainSelection({ domains }: DomainSelectionProps) {
  return (
    <main className="bp-page-bg text-foreground min-h-screen px-6 py-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-12">
        <div className="relative overflow-hidden border border-border/70 bg-card/70 px-6 py-8 shadow-[0_22px_100px_rgba(2,6,23,0.24)] sm:px-8 sm:py-10">
          <div className="bp-grid-line pointer-events-none absolute inset-0 opacity-30" />
          <div className="relative flex flex-col gap-6">
            <Badge variant="outline" className="w-fit">
              Breakpoint / E.S.D.E. Simulation
            </Badge>
            <div className="max-w-3xl space-y-4">
              <h1 className="font-display text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-6xl">
                What do you want to get cracked at?
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Start with one brutal, high-signal domain. The system should
                feel sharp, clear, and demanding from the first click.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {domains.map((domain) => {
            const isAvailable = domain.status === "available";

            return (
              <Surface
                key={domain.slug}
                variant={isAvailable ? "interactive" : "muted"}
                padding="lg"
                className="min-h-64"
              >
                <SurfaceContent className="relative h-full justify-between gap-10">
                  <div className="space-y-5">
                    <div className="flex items-start justify-between gap-3">
                      <SurfaceHeader className="space-y-2">
                        <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-muted-foreground">
                          {domain.stageLabel}
                        </p>
                        <SurfaceTitle className="text-2xl">
                          {domain.title}
                        </SurfaceTitle>
                      </SurfaceHeader>
                      <Badge variant={isAvailable ? "success" : "muted"}>
                        {isAvailable ? "Unlocked" : "Locked"}
                      </Badge>
                    </div>

                    <SurfaceDescription>{domain.description}</SurfaceDescription>
                  </div>

                  <SurfaceFooter className="items-end">
                    <Badge variant="outline">{domain.difficultyLabel}</Badge>

                    {isAvailable ? (
                      <Button
                        asChild
                        className="h-11 bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        <Link href={`/domains/${domain.slug}`}>
                          Enter arena
                          <span aria-hidden="true">→</span>
                        </Link>
                      </Button>
                    ) : (
                      <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <span aria-hidden="true">•</span>
                        Soon
                      </div>
                    )}
                  </SurfaceFooter>
                </SurfaceContent>
              </Surface>
            );
          })}
        </div>
      </div>
    </main>
  );
}
