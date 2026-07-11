import type { RouterOutputs } from "@acme/api";
import { Badge } from "@acme/ui/badge";

type ProjectTopic = RouterOutputs["training"]["projectTopic"];
type TopicCluster = ProjectTopic["clusters"][number];

// Display window for the rating meter. Glicko ratings cluster well inside this
// band; the bar is a relative read, not an absolute axis.
const RATING_FLOOR = 800;
const RATING_CEIL = 2000;

const ratingFraction = (rating: number) =>
  Math.min(1, Math.max(0, (rating - RATING_FLOOR) / (RATING_CEIL - RATING_FLOOR)));

const STATUS_LABEL: Record<TopicCluster["status"], string> = {
  planned: "Planned",
  ready: "In progress",
  completed: "Completed",
};

function ClusterCard({ cluster }: { cluster: TopicCluster }) {
  const rated = cluster.rating !== null;

  return (
    <div className="border-border bg-card rounded-lg border px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-foreground text-[13.5px] font-medium">
            {cluster.title}
          </div>
          <div className="text-foreground/50 mt-0.5 line-clamp-2 text-[12px] leading-5">
            {cluster.summary}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {rated ? (
            <>
              <div className="text-foreground text-[15px] font-semibold tabular-nums">
                {Math.round(cluster.rating ?? 0)}
              </div>
              <div className="text-foreground/44 text-[11px] tabular-nums">
                ± {Math.round(cluster.ratingDeviation ?? 0)}
              </div>
            </>
          ) : (
            <span className="text-foreground/40 text-[11px]">Not yet rated</span>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="bg-foreground/10 relative h-1.5 flex-1 overflow-hidden rounded-full">
          {rated ? (
            <div
              className="bg-primary/75 absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${ratingFraction(cluster.rating ?? 0) * 100}%` }}
            />
          ) : null}
        </div>
        <Badge
          variant={cluster.status === "completed" ? "success" : "muted"}
          size="sm"
        >
          {STATUS_LABEL[cluster.status]}
        </Badge>
      </div>
    </div>
  );
}

export function TopicDetail({ topic }: { topic: ProjectTopic }) {
  return (
    <div>
      <div>
        <h1 className="text-foreground text-[25px] leading-[1.2] font-medium tracking-[-0.02em]">
          {topic.title}
        </h1>
        <p className="text-foreground/52 mt-1 text-[13px] leading-6">
          Training toward {topic.targetIdentity}
        </p>
      </div>

      <section className="mt-10">
        <h2 className="text-foreground/84 mb-3 text-[13px] font-semibold">
          Skill clusters
        </h2>
        {topic.clusters.length > 0 ? (
          <div className="grid gap-3">
            {topic.clusters.map((cluster) => (
              <ClusterCard key={cluster.nodeId} cluster={cluster} />
            ))}
          </div>
        ) : (
          <div className="border-border bg-card text-foreground/48 rounded-lg border px-5 py-4 text-[12px]">
            No skill clusters yet — finish generating this project.
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-foreground/84 mb-3 text-[13px] font-semibold">
          Overview
        </h2>
        <div className="border-border bg-card rounded-lg border px-5 py-4">
          {topic.overview ? (
            <div className="text-foreground/78 text-[13px] leading-7 whitespace-pre-wrap">
              {topic.overview.body}
            </div>
          ) : (
            <div className="text-foreground/48 text-[12px]">
              Overview not generated yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
