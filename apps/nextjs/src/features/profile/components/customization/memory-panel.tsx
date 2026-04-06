"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import {
  MEMORY_ALLOWED_FILE_EXTENSIONS,
  MEMORY_MAX_IMPORT_BYTES,
} from "@acme/validators";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Surface, SurfaceContent, SurfaceDescription, SurfaceHeader, SurfaceTitle } from "@acme/ui/surface";
import { Textarea } from "@acme/ui/textarea";
import { toast } from "@acme/ui/toast";

import { CHATGPT_MEMORY_IMPORT_PROMPT } from "~/features/profile/lib/chatgpt-prompt";
import { useTRPC } from "~/trpc/react";

type Memory = RouterOutputs["memory"]["list"][number];

const formatCountLabel = (count: number) =>
  `${count} memor${count === 1 ? "y" : "ies"}`;

const sortMemories = (memories: Memory[]) =>
  [...memories].sort((left, right) => {
    const leftTime = new Date(left.updatedAt ?? left.createdAt).getTime();
    const rightTime = new Date(right.updatedAt ?? right.createdAt).getTime();
    return rightTime - leftTime;
  });

export function MemoryPanel({ initialMemories }: { initialMemories: Memory[] }) {
  const trpc = useTRPC();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [memories, setMemories] = useState(sortMemories(initialMemories));
  const [manualContent, setManualContent] = useState("");
  const [chatGptPaste, setChatGptPaste] = useState("");
  const [activeEditId, setActiveEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [panelError, setPanelError] = useState<string | null>(null);
  const [oversizeWarning, setOversizeWarning] = useState<string | null>(null);

  useEffect(() => {
    setMemories(sortMemories(initialMemories));
  }, [initialMemories]);

  const upsertMemory = (nextMemory: Memory) => {
    setMemories((current) =>
      sortMemories([
        nextMemory,
        ...current.filter((memory) => memory.id !== nextMemory.id),
      ]),
    );
  };

  const createManual = useMutation(
    trpc.memory.createManual.mutationOptions({
      onSuccess: (memory) => {
        setPanelError(null);
        setManualContent("");
        upsertMemory(memory);
        toast.success("Memory saved.");
      },
      onError: (error) => {
        setPanelError(error.message);
        toast.error(error.message);
      },
    }),
  );

  const uploadFile = useMutation(
    trpc.memory.uploadFile.mutationOptions({
      onSuccess: (result) => {
        setPanelError(null);
        setOversizeWarning(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        setMemories((current) => sortMemories([...result.entries, ...current]));
        toast.success(
          result.entries.length > 0
            ? `Imported ${formatCountLabel(result.entries.length)} from file.`
            : "File processed. No new memories were added.",
        );
      },
      onError: (error) => {
        setPanelError(error.message);
        if (error.data?.code === "PAYLOAD_TOO_LARGE") {
          setOversizeWarning(error.message);
        }
        toast.error(error.message);
      },
    }),
  );

  const importChatgpt = useMutation(
    trpc.memory.importChatgpt.mutationOptions({
      onSuccess: (result) => {
        setPanelError(null);
        setChatGptPaste("");
        setMemories((current) => sortMemories([...result.entries, ...current]));
        toast.success(
          result.entries.length > 0
            ? `Imported ${formatCountLabel(result.entries.length)} from ChatGPT.`
            : "Import finished. No new memories were added.",
        );
      },
      onError: (error) => {
        setPanelError(error.message);
        toast.error(error.message);
      },
    }),
  );

  const updateMemory = useMutation(
    trpc.memory.update.mutationOptions({
      onSuccess: (memory) => {
        setPanelError(null);
        setActiveEditId(null);
        setEditDraft("");
        upsertMemory(memory);
        toast.success("Memory updated.");
      },
      onError: (error) => {
        setPanelError(error.message);
        toast.error(error.message);
      },
    }),
  );

  const removeMemory = useMutation(
    trpc.memory.remove.mutationOptions({
      onSuccess: (_, variables) => {
        setPanelError(null);
        setMemories((current) => current.filter((memory) => memory.id !== variables.id));
        toast.success("Memory deleted.");
      },
      onError: (error) => {
        setPanelError(error.message);
        toast.error(error.message);
      },
    }),
  );

  const isBusy = useMemo(
    () =>
      createManual.isPending ||
      uploadFile.isPending ||
      importChatgpt.isPending ||
      updateMemory.isPending ||
      removeMemory.isPending,
    [
      createManual.isPending,
      importChatgpt.isPending,
      removeMemory.isPending,
      updateMemory.isPending,
      uploadFile.isPending,
    ],
  );

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const fileName = file.name.toLowerCase();
    const isAllowed = MEMORY_ALLOWED_FILE_EXTENSIONS.some((extension) =>
      fileName.endsWith(extension),
    );
    if (!isAllowed) {
      setPanelError("Upload a .txt or .md file.");
      event.target.value = "";
      return;
    }

    if (file.size > MEMORY_MAX_IMPORT_BYTES) {
      setOversizeWarning("That file is too large. Keep it under 200 KB.");
      event.target.value = "";
      return;
    }

    try {
      const text = await file.text();
      setOversizeWarning(null);
      uploadFile.mutate({
        filename: file.name,
        text,
      });
    } catch {
      setPanelError("That file could not be read.");
      event.target.value = "";
    }
  };

  return (
    <div className="grid gap-6">
      <Surface padding="lg">
        <SurfaceHeader>
          <SurfaceTitle>Memory</SurfaceTitle>
          <SurfaceDescription>
            What Breakpoint knows about you across sessions.
          </SurfaceDescription>
        </SurfaceHeader>
        <SurfaceContent className="mt-6 gap-6">
          <div className="grid gap-3">
            <div className="text-sm font-medium text-foreground">Add memory</div>
            <Textarea
              value={manualContent}
              onChange={(event) => setManualContent(event.target.value)}
              placeholder="Paste or type a memory..."
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Input
                ref={fileInputRef}
                type="file"
                nativeInput
                accept=".txt,.md"
                onChange={handleFileSelect}
              />
              <Button
                loading={createManual.isPending}
                disabled={!manualContent.trim() || isBusy}
                onClick={() => createManual.mutate({ content: manualContent })}
              >
                Save entry
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Upload plain text or Markdown under 200 KB.
            </div>
          </div>

          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm font-medium text-foreground">Import from ChatGPT</div>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(CHATGPT_MEMORY_IMPORT_PROMPT);
                  toast.success("Prompt copied.");
                }}
              >
                Copy
              </Button>
            </div>
            <div className="border border-border/80 bg-secondary/30 p-4 font-mono text-xs leading-6 text-muted-foreground whitespace-pre-wrap">
              {CHATGPT_MEMORY_IMPORT_PROMPT}
            </div>
            <Textarea
              value={chatGptPaste}
              onChange={(event) => setChatGptPaste(event.target.value)}
              placeholder="Paste the ChatGPT result here..."
            />
            <div className="flex justify-end">
              <Button
                loading={importChatgpt.isPending}
                disabled={!chatGptPaste.trim() || isBusy}
                onClick={() => importChatgpt.mutate({ pasted: chatGptPaste })}
              >
                Import as memories
              </Button>
            </div>
          </div>

          {oversizeWarning ? (
            <div className="text-sm text-destructive">{oversizeWarning}</div>
          ) : null}
          {panelError ? (
            <div className="text-sm text-destructive">{panelError}</div>
          ) : null}
        </SurfaceContent>
      </Surface>

      <Surface padding="lg" variant="muted">
        <SurfaceHeader>
          <SurfaceTitle>Your memories ({memories.length})</SurfaceTitle>
        </SurfaceHeader>
        <SurfaceContent className="mt-5">
          {memories.length === 0 ? (
            <div className="border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
              No memories yet. Add one manually, upload a file, or import a ChatGPT export.
            </div>
          ) : (
            <div className="grid gap-3">
              {memories.map((memory) => {
                const isEditing = activeEditId === memory.id;

                return (
                  <div
                    key={memory.id}
                    className="border border-border/70 bg-background/60 px-4 py-4 transition-colors hover:border-border"
                  >
                    {isEditing ? (
                      <div className="grid gap-3">
                        <Textarea
                          value={editDraft}
                          onChange={(event) => setEditDraft(event.target.value)}
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setActiveEditId(null);
                              setEditDraft("");
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            loading={updateMemory.isPending}
                            onClick={() =>
                              updateMemory.mutate({
                                id: memory.id,
                                content: editDraft,
                              })
                            }
                          >
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 text-sm leading-6 text-foreground">
                          {memory.content}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                            onClick={() => {
                              setActiveEditId(memory.id);
                              setEditDraft(memory.content);
                            }}
                          >
                            edit
                          </button>
                          <button
                            type="button"
                            className="text-sm text-muted-foreground transition-colors hover:text-destructive"
                            onClick={() => {
                              if (!window.confirm("Delete this memory?")) {
                                return;
                              }

                              removeMemory.mutate({ id: memory.id });
                            }}
                          >
                            x
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SurfaceContent>
      </Surface>
    </div>
  );
}
