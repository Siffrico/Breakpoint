import type { Metadata } from "next";

import type { TopicNavItem } from "~/features/settings/components/settings-nav";
import { ProjectsTab } from "~/features/settings/components/projects/projects-tab";
import { SettingsShell } from "~/features/settings/components/settings-shell";
import { previewLearningProjects } from "~/features/training/lib/training-preview";

export const metadata: Metadata = {
  title: "Projects · Settings preview",
  description: "Preview populated learning projects in settings.",
};

export default function UiPreviewProjectsPage() {
  const topics = previewLearningProjects.map(
    (project): TopicNavItem => ({
      sessionId: project.sessionId,
      title: project.title,
      status: project.status === "active" ? "active" : "onboarding",
    }),
  );

  return (
    <SettingsShell basePath="/ui/profile" topics={topics}>
      <ProjectsTab
        initialProjects={previewLearningProjects}
        preview
        projectPath="/ui/profile/topics"
        workspacePath="/ui/workspace"
      />
    </SettingsShell>
  );
}
