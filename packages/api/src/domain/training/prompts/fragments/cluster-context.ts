export const formatClusterContext = (
  cluster: {
    title: string;
    summary: string;
    whyItMatters: string;
  } | null,
): string => {
  if (!cluster) return "None";
  return `Title: ${cluster.title}
Summary: ${cluster.summary}
Why it matters: ${cluster.whyItMatters}`;
};

export const formatIntegrationContext = (
  ctx: { completedClusterTitles: string[] } | null,
): string => {
  if (!ctx) return "None";
  return `Completed clusters: ${ctx.completedClusterTitles.join("; ")}`;
};
