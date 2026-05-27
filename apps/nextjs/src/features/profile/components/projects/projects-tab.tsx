"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Trash } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";

import {
  SettingRow,
  SettingsPageHeader,
  SettingsSection,
} from "~/features/profile/components/profile-shell";
import { useTRPC } from "~/trpc/react";

type LearningProject =
  RouterOutputs["training"]["listLearningProjects"][number];

const formatUpdatedAt = (updatedAt: Date) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(updatedAt);

const LAST_SESSION_COOKIE = "bp-last-learning-session";

const readCookie = (name: string) =>
  document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1);

export function ProjectsTab({
  initialProjects,
  preview = false,
}: {
  initialProjects: LearningProject[];
  preview?: boolean;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const currentSessionId = searchParams.get("session");
  const [projects, setProjects] = useState(initialProjects);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(
    null,
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
          document.cookie = `${LAST_SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
          router.replace("/workspace");
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

  return (
    <div>
      <SettingsPageHeader title="Projects" />

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
                        <Link href={`/workspace?session=${project.sessionId}`} />
                      }
                      variant="outline"
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
