"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Trash } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Textarea } from "@acme/ui/textarea";
import { toast } from "@acme/ui/toast";

import {
  SettingField,
  SettingFooter,
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
const MAX_MARKDOWN_CHARS = 120_000;

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
  const [projectTitle, setProjectTitle] = useState("");
  const [targetIdentity, setTargetIdentity] = useState("");
  const [curriculumMarkdown, setCurriculumMarkdown] = useState("");
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(
    null,
  );

  const createProject = useMutation(
    trpc.training.createLearningProject.mutationOptions({
      onSuccess: ({ sessionId, hasCurriculum }, variables) => {
        const title = variables.title.trim();
        setProjects((current) => [
          {
            sessionId,
            title,
            headline: `${title} learning project`,
            status: hasCurriculum ? "active" : "onboarding",
            lessonPreview: [],
            updatedAt: new Date(),
          },
          ...current,
        ]);
        setProjectTitle("");
        setTargetIdentity("");
        setCurriculumMarkdown("");
        void queryClient.invalidateQueries(
          trpc.training.listLearningProjects.queryFilter(),
        );
        toast.success(
          hasCurriculum
            ? "Project created with imported curriculum."
            : "Project created.",
        );

        if (hasCurriculum) {
          router.push(`/workspace?session=${sessionId}`);
          return;
        }

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

  const handleMarkdownFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsReadingFile(true);
    try {
      const text = await file.text();
      if (text.length > MAX_MARKDOWN_CHARS) {
        toast.error("Markdown file is too large for this import.");
        return;
      }
      setCurriculumMarkdown(text);
    } catch {
      toast.error("Could not read that Markdown file.");
    } finally {
      setIsReadingFile(false);
      event.target.value = "";
    }
  };

  const handleCreateProject = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (preview || createProject.isPending) return;

    createProject.mutate({
      title: projectTitle,
      targetIdentity: targetIdentity.trim() || undefined,
      curriculumMarkdown: curriculumMarkdown.trim() || undefined,
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
          <SettingField
            label="Markdown curriculum"
            description="Optional. Paste headings or bullets, or upload a .md file."
          >
            <div className="space-y-3">
              <Input
                nativeInput
                type="file"
                accept=".md,.markdown,text/markdown,text/plain"
                disabled={preview || createProject.isPending || isReadingFile}
                onChange={handleMarkdownFile}
              />
              <Textarea
                value={curriculumMarkdown}
                disabled={preview || createProject.isPending || isReadingFile}
                maxLength={MAX_MARKDOWN_CHARS}
                placeholder={`# Curriculum\n\n## Unit 1: Core idea\nWhat the learner must understand and use.\n\n## Unit 2: Applied project move\nHow this becomes proof in the project.`}
                onChange={(event) => setCurriculumMarkdown(event.target.value)}
              />
              <div className="text-foreground/45 flex items-center gap-2 text-[12px]">
                <FileText size={14} />
                {curriculumMarkdown.trim()
                  ? `${curriculumMarkdown.trim().length.toLocaleString()} characters ready to import`
                  : "Markdown headings become Becoming curriculum units."}
              </div>
            </div>
          </SettingField>
          <SettingFooter>
            <Button
              type="submit"
              disabled={preview || projectTitle.trim().length < 2}
              loading={createProject.isPending || isReadingFile}
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
                        <Link
                          href={`/workspace?session=${project.sessionId}`}
                        />
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
