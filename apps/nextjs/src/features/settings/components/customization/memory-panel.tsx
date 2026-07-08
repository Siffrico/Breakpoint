"use client";

/* eslint-disable react-hooks/refs -- This component performs imperative file input resets in mutation callbacks. */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import {
  MEMORY_ALLOWED_FILE_EXTENSIONS,
  MEMORY_MAX_IMPORT_BYTES,
} from "@acme/validators";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Textarea } from "@acme/ui/textarea";
import { toast } from "@acme/ui/toast";

import { CHATGPT_MEMORY_IMPORT_PROMPT } from "~/features/settings/lib/chatgpt-prompt";
import {
  SettingField,
  SettingFooter,
  SettingsSection,
} from "~/features/settings/components/settings-shell";
import { useTRPC } from "~/trpc/react";

type Memory = RouterOutputs["memory"]["list"][number];

const formatCountLabel = (count: number) =>
  `${count} memor${count === 1 ? "y" : "ies"}`;

const sortMemories = (memories: Memory[]) =>
  memories.toSorted((left, right) => {
    const leftTime = new Date(left.updatedAt ?? left.createdAt).getTime();
    const rightTime = new Date(right.updatedAt ?? right.createdAt).getTime();
    return rightTime - leftTime;
  });

export function MemoryPanel({ initialMemories }: { initialMemories: Memory[] }) {
  const trpc = useTRPC();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [memories, setMemories] = useState(() => sortMemories(initialMemories));
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
        setMemories((current) =>
          current.filter((memory) => memory.id !== variables.id),
        );
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

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
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
    <div>
      <SettingsSection title="Add memory">
        <SettingField label="New entry">
          <Textarea
            value={manualContent}
            onChange={(event) => setManualContent(event.target.value)}
            placeholder="Paste or type a memory..."
          />
        </SettingField>
        <SettingField label="Import from file">
          <Input
            ref={fileInputRef}
            type="file"
            nativeInput
            accept=".txt,.md"
            onChange={handleFileSelect}
          />
        </SettingField>
        {oversizeWarning ? (
          <div className="text-destructive px-5 pb-2 text-[12px]">
            {oversizeWarning}
          </div>
        ) : null}
        {panelError ? (
          <div className="text-destructive px-5 pb-2 text-[12px]">
            {panelError}
          </div>
        ) : null}
        <SettingFooter>
          <Button
            size="sm"
            loading={createManual.isPending}
            disabled={!manualContent.trim() || isBusy}
            onClick={() => createManual.mutate({ content: manualContent })}
          >
            Save entry
          </Button>
        </SettingFooter>
      </SettingsSection>

      <SettingsSection title="Import from ChatGPT">
        <SettingField label="Copy this prompt">
          <div className="border-foreground/[0.06] bg-foreground/[0.03] text-foreground/66 whitespace-pre-wrap rounded-lg border p-3 font-mono text-[11px] leading-5">
            {CHATGPT_MEMORY_IMPORT_PROMPT}
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(
                  CHATGPT_MEMORY_IMPORT_PROMPT,
                );
                toast.success("Prompt copied.");
              }}
            >
              Copy prompt
            </Button>
          </div>
        </SettingField>
        <SettingField label="Paste result">
          <Textarea
            value={chatGptPaste}
            onChange={(event) => setChatGptPaste(event.target.value)}
            placeholder="Paste the ChatGPT result here..."
          />
        </SettingField>
        <SettingFooter>
          <Button
            size="sm"
            loading={importChatgpt.isPending}
            disabled={!chatGptPaste.trim() || isBusy}
            onClick={() => importChatgpt.mutate({ pasted: chatGptPaste })}
          >
            Import as memories
          </Button>
        </SettingFooter>
      </SettingsSection>

      <SettingsSection title={`Your memories (${memories.length})`}>
        {memories.length === 0 ? (
          <div className="text-foreground/48 px-5 py-8 text-center text-[12px]">
            No memories yet. Add one above, upload a file, or import a ChatGPT
            export.
          </div>
        ) : (
          memories.map((memory) => {
            const isEditing = activeEditId === memory.id;

            return (
              <div key={memory.id} className="px-5 py-4">
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
                    <div className="text-foreground/90 min-w-0 text-[13px] leading-6">
                      {memory.content}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <button
                        type="button"
                        className="text-foreground/50 hover:text-foreground/88 text-[12px] transition-colors"
                        onClick={() => {
                          setActiveEditId(memory.id);
                          setEditDraft(memory.content);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-foreground/50 hover:text-destructive text-[12px] transition-colors"
                        onClick={() => {
                          if (!window.confirm("Delete this memory?")) {
                            return;
                          }

                          removeMemory.mutate({ id: memory.id });
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </SettingsSection>
    </div>
  );
}
