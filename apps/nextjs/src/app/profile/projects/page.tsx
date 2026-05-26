import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile projects",
  description: "Manage your Breakpoint learning projects.",
};

import { ProjectsTab } from "~/features/profile/components/projects/projects-tab";
import { listLearningProjects } from "~/features/profile/server/profile-queries";

export default async function ProfileProjectsPage() {
  const projects = await listLearningProjects();

  return <ProjectsTab initialProjects={projects} />;
}

