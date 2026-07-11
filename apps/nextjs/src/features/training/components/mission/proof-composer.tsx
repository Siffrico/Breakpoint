"use client";

import { useRef, useState } from "react";
import { ArrowUp, CircleNotch, Plus, X } from "@phosphor-icons/react";
import { generateReactHelpers } from "@uploadthing/react";

import { toast } from "@acme/ui/toast";

import type { OurFileRouter } from "~/app/api/uploadthing/core";

const { useUploadThing } = generateReactHelpers<OurFileRouter>();

/** MissionProof allows at most 3 images. */
const MAX_IMAGES = 3;

/**
 * Single chat-style composer for mission proof: one raised surface holding
 * attachments, text, and actions. Plus attaches photos, arrow sends,
 * Enter sends, Shift+Enter breaks a line.
 */
export function ProofComposer({
  onSubmit,
  disabled = false,
}: {
  onSubmit: (text: string, imageUrls: string[]) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { startUpload, isUploading } = useUploadThing("missionProof", {
    onClientUploadComplete: (files) => {
      setUrls((current) =>
        [...current, ...files.map((file) => file.ufsUrl)].slice(0, MAX_IMAGES),
      );
    },
    onUploadError: (error) => {
      toast.error(error.message || "Photo upload failed. Try again.");
    },
  });

  const canSend =
    !disabled && !isUploading && (text.trim().length > 0 || urls.length > 0);

  const send = () => {
    if (!canSend) return;
    onSubmit(text.trim(), urls);
  };

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  return (
    <section>
      <div className="rounded-lg border border-[var(--site-line)] bg-[var(--site-raised)] transition-colors focus-within:border-[var(--site-line-strong)]">
        {urls.length ? (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {urls.map((url) => (
              <div key={url} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="Attached proof"
                  className="size-12 rounded-md border border-[var(--site-line)] object-cover"
                />
                <button
                  type="button"
                  aria-label="Remove attachment"
                  onClick={() =>
                    setUrls((current) =>
                      current.filter((existing) => existing !== url),
                    )
                  }
                  className="absolute -top-1.5 -right-1.5 flex size-4.5 items-center justify-center rounded-full bg-[var(--site-fg)] text-[var(--site-bg)] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <X className="size-3" weight="bold" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <textarea
          ref={textareaRef}
          autoFocus
          rows={2}
          value={text}
          disabled={disabled}
          onChange={(event) => {
            setText(event.target.value);
            resize();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="What happened out there?"
          className="max-h-[200px] w-full resize-none bg-transparent px-3.5 pt-3 text-[14px] leading-relaxed text-[var(--site-fg)] outline-none placeholder:text-[var(--site-text-3)]"
        />

        <div className="flex items-center justify-between px-2.5 pb-2.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []).slice(
                0,
                MAX_IMAGES - urls.length,
              );
              if (files.length) void startUpload(files);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            aria-label="Attach a photo"
            disabled={disabled || isUploading || urls.length >= MAX_IMAGES}
            onClick={() => fileInputRef.current?.click()}
            className="flex size-8 items-center justify-center rounded-md text-[var(--site-text-2)] transition-colors outline-none hover:bg-[color-mix(in_oklab,var(--site-fg)_8%,transparent)] hover:text-[var(--site-fg)] disabled:pointer-events-none disabled:opacity-40"
          >
            {isUploading ? (
              <CircleNotch className="size-4.5 animate-spin" />
            ) : (
              <Plus className="size-4.5" />
            )}
          </button>
          <button
            type="button"
            aria-label="Send proof"
            disabled={!canSend}
            onClick={send}
            className="flex size-8 items-center justify-center rounded-md bg-[var(--site-fg)] text-[var(--site-bg)] transition-opacity outline-none hover:opacity-90 disabled:pointer-events-none disabled:opacity-30"
          >
            <ArrowUp className="size-4.5" weight="bold" />
          </button>
        </div>
      </div>
    </section>
  );
}
