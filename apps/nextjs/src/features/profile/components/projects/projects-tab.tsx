"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ClipboardText,
  FileText,
  ListChecks,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";
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

const CURRICULUM_EXAMPLE = `Module 1: Core idea - What the learner must understand and use.
Module 2: Applied project move - How this becomes proof in the project.
Module 3: Failure diagnosis - How to catch and repair weak reasoning.`;

const readCookie = (name: string) =>
  document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1);

const estimateImportedUnitCount = (value: string) => {
  const text = value.trim();
  if (!text) return 0;

  const lines = text.split(/\r?\n/);
  const headingCount = lines.filter((line) =>
    /^#{1,6}\s+\S+/.test(line.trim()),
  ).length;
  const listCount = lines.filter((line) =>
    /^(?:[-*+•]|\d{1,3}[.)]|[a-zA-Z][.)]|(?:module|unit|lesson|week|part|phase|step)\s+\w+\s*[:.)-])/i.test(
      line.trim(),
    ),
  ).length;

  if (headingCount > 1) return headingCount - 1;
  if (headingCount === 1) return 1;
  if (listCount > 0) return listCount;
  return Math.max(1, text.split(/\n{2,}/).filter(Boolean).length);
};

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [projects, setProjects] = useState(initialProjects);
  const [projectTitle, setProjectTitle] = useState("");
  const [targetIdentity, setTargetIdentity] = useState("");
  const [curriculumMarkdown, setCurriculumMarkdown] = useState("");
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(
    null,
  );
  const curriculumUnitEstimate = useMemo(
    () => estimateImportedUnitCount(curriculumMarkdown),
    [curriculumMarkdown],
  );
  const curriculumCharacters = curriculumMarkdown.trim().length;

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
            label="Curriculum"
            description="Optional. Paste the curriculum you already have. Breakpoint will turn rough text into ordered training units."
          >
            <div className="space-y-3">
              <div className="border-border bg-background/45 divide-border divide-y border">
                <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <ClipboardText
                      className="text-foreground/64 mt-0.5 shrink-0"
                      size={17}
                    />
                    <div className="min-w-0">
                      <div className="text-foreground text-[13px] font-medium">
                        Paste curriculum here
                      </div>
                      <div className="text-foreground/50 mt-0.5 text-[12px] leading-5">
                        Works with headings, bullets, numbered modules, plain
                        paragraphs, and JSON exports.
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        preview || createProject.isPending || isReadingFile
                      }
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <UploadSimple size={14} />
                      Upload file
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={
                        preview ||
                        createProject.isPending ||
                        isReadingFile ||
                        curriculumMarkdown.trim().length > 0
                      }
                      onClick={() => setCurriculumMarkdown(CURRICULUM_EXAMPLE)}
                    >
                      Use example
                    </Button>
                  </div>
                </div>
                <div className="px-4 py-3">
                  <Textarea
                    value={curriculumMarkdown}
                    disabled={
                      preview || createProject.isPending || isReadingFile
                    }
                    maxLength={MAX_MARKDOWN_CHARS}
                    className="[&_textarea]:min-h-[220px] [&_textarea]:font-mono [&_textarea]:text-[13px] [&_textarea]:leading-6"
                    placeholder={`Paste any curriculum outline here.

Example:
Module 1: Core idea - What the learner must understand and use.
2) Applied project move: How this becomes proof in the project.
## Failure diagnosis
How to catch and repair weak reasoning.`}
                    onChange={(event) =>
                      setCurriculumMarkdown(event.target.value)
                    }
                  />
                </div>
                <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-foreground/56 flex items-center gap-2 text-[12px]">
                    <ListChecks size={14} />
                    {curriculumCharacters > 0
                      ? `${curriculumUnitEstimate.toLocaleString()} estimated ${curriculumUnitEstimate === 1 ? "unit" : "units"} from ${curriculumCharacters.toLocaleString()} characters`
                      : "Paste text to import a curriculum now, or skip this and generate one later."}
                  </div>
                  <div className="text-foreground/44 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                    <span>Markdown</span>
                    <span>Numbered outline</span>
                    <span>Plain text</span>
                    <span>JSON</span>
                  </div>
                </div>
              </div>
              <Input
                ref={fileInputRef}
                nativeInput
                type="file"
                accept=".md,.markdown,.txt,application/json,text/markdown,text/plain"
                disabled={preview || createProject.isPending || isReadingFile}
                className="hidden"
                tabIndex={-1}
                onChange={handleMarkdownFile}
              />
              <div className="text-foreground/45 flex items-center gap-2 text-[12px]">
                <FileText size={14} />
                Imported curriculum is optional. The parser accepts rough paste
                formats, not just clean Markdown.
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
