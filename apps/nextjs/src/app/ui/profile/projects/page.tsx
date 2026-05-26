import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile projects preview",
  description: "Preview profile project settings.",
};

import { ProjectsTab } from "~/features/profile/components/projects/projects-tab";
import { ProfileShell } from "~/features/profile/components/profile-shell";
import { previewLearningProjects } from "~/features/profile/lib/preview-data";

export default function UiPreviewProfileProjectsPage() {
  return (
    <ProfileShell basePath="/ui/profile" activeTab="projects">
      <ProjectsTab initialProjects={[...previewLearningProjects]} preview />
    </ProfileShell>
  );
}

