"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Trash } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { toast } from "@acme/ui/toast";

import {
  SettingField,
  SettingFooter,
  SettingRow,
  SettingsPageHeader,
  SettingsSection,
} from "~/features/settings/components/settings-shell";
import { useTRPC } from "~/trpc/react";

type LearningProject =
  RouterOutputs["training"]["listLearningProjects"][number];

const UPDATED_AT_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const formatUpdatedAt = (updatedAt: Date) =>
  UPDATED_AT_FORMAT.format(updatedAt);

const LAST_SESSION_COOKIE = "bp-last-learning-session";

const readCookie = (name: string) =>
  document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1);

const clearCookie = (name: string) => {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
};

export function ProjectsTab({
  initialProjects,
  preview = false,
  workspacePath = "/workspace",
  projectPath = "/settings/topics",
}: {
  initialProjects: LearningProject[];
  preview?: boolean;
  workspacePath?: string;
  projectPath?: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const currentSessionId = searchParams.get("session");
  const [projects, setProjects] = useState(initialProjects);
  const [projectTitle, setProjectTitle] = useState("");
  const [targetIdentity, setTargetIdentity] = useState("");
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(
    null,
  );

  const createProject = useMutation(
    trpc.training.createLearningProject.mutationOptions({
      onSuccess: ({ sessionId }, variables) => {
        const title = variables.title.trim();
        setProjects((current) => [
          {
            sessionId,
            title,
            headline: `${title} learning project`,
            status: "onboarding",
            lessonPreview: [],
            updatedAt: new Date(),
          },
          ...current,
        ]);
        setProjectTitle("");
        setTargetIdentity("");
        void queryClient.invalidateQueries(
          trpc.training.listLearningProjects.queryFilter(),
        );
        toast.success("Project created.");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const deleteProject = useMutation(
    trpc.training.deleteLearningProject.mutationOptions({
      onSuccess: ({ sessionId }) => {
        setProjects((current) =>
          current.filter((project) => project.sessionId !== sessionId),
        );
        void queryClient.invalidateQueries(
          trpc.training.listLearningProjects.queryFilter(),
        );
        toast.success("Project deleted.");
        if (
          currentSessionId === sessionId ||
          readCookie(LAST_SESSION_COOKIE) === sessionId
        ) {
          // Non-sensitive "last opened session" breadcrumb, not an auth secret;
          // it must stay client-readable (see readCookie above), so it is
          // deliberately not httpOnly. This line clears it.
          clearCookie(LAST_SESSION_COOKIE);
          router.refresh();
        }
      },
      onError: (error) => toast.error(error.message),
      onSettled: () => setDeletingSessionId(null),
    }),
  );

  const handleDelete = (project: LearningProject) => {
    if (preview) return;
    const confirmed = window.confirm(
      `Delete "${project.title}"? This removes the project, curriculum, messages, and progress.`,
    );
    if (!confirmed) return;

    setDeletingSessionId(project.sessionId);
    deleteProject.mutate({ sessionId: project.sessionId });
  };

  const handleCreateProject = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (preview || createProject.isPending) return;

    createProject.mutate({
      title: projectTitle,
      targetIdentity: targetIdentity.trim() || undefined,
    });
  };

  return (
    <div>
      <SettingsPageHeader title="Projects" />

      <SettingsSection title="New project">
        <form onSubmit={handleCreateProject}>
          <SettingField
            label="Project name"
            description="Name the project you want to see on your profile."
          >
            <Input
              value={projectTitle}
              disabled={preview || createProject.isPending}
              maxLength={120}
              placeholder="OpenAI research interview prep"
              onChange={(event) => setProjectTitle(event.target.value)}
            />
          </SettingField>
          <SettingField
            label="Target identity"
            description="Optional. If blank, Breakpoint uses the project name."
          >
            <Input
              value={targetIdentity}
              disabled={preview || createProject.isPending}
              maxLength={240}
              placeholder="A researcher who can reason from first principles"
              onChange={(event) => setTargetIdentity(event.target.value)}
            />
          </SettingField>
          <SettingFooter>
            <Button
              type="submit"
              disabled={preview || projectTitle.trim().length < 2}
              loading={createProject.isPending}
            >
              Create project
            </Button>
          </SettingFooter>
        </form>
      </SettingsSection>

      <SettingsSection title="Learning projects">
        {projects.length > 0 ? (
          projects.map((project) => {
            const isDeleting = deletingSessionId === project.sessionId;
            return (
              <SettingRow
                key={project.sessionId}
                label={project.title}
                description={`${project.headline} Updated ${formatUpdatedAt(project.updatedAt)}.`}
                control={
                  <div className="flex items-center gap-2">
                    <Button
                      render={
                        <Link href={`${projectPath}/${project.sessionId}`} />
                      }
                      variant="outline"
                      size="sm"
                    >
                      Details
                    </Button>
                    <Button
                      render={
                        <Link
                          href={`${workspacePath}?session=${project.sessionId}`}
                        />
                      }
                      variant="ghost"
                      size="sm"
                    >
                      Open
                    </Button>
                    <Button
                      variant="destructive-outline"
                      size="icon-sm"
                      loading={isDeleting}
                      disabled={preview || isDeleting}
                      aria-label={`Delete ${project.title}`}
                      title={`Delete ${project.title}`}
                      onClick={() => handleDelete(project)}
                    >
                      <Trash size={14} />
                    </Button>
                  </div>
                }
              />
            );
          })
        ) : (
          <div className="text-foreground/50 px-5 py-4 text-[12px]">
            No projects yet.
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
