import type { Metadata } from "next";

import { ProjectsTab } from "~/features/settings/components/projects/projects-tab";
import { listLearningProjects } from "~/features/settings/server/settings-queries";

export const metadata: Metadata = {
  title: "Topics · Settings",
  description: "Browse, import, and manage your learning projects.",
};

export default async function SettingsTopicsPage() {
  const projects = await listLearningProjects();

  return <ProjectsTab initialProjects={projects} />;
}
