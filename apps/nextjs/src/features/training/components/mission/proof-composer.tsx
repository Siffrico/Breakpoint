"use client";

import { useState } from "react";
import { generateUploadButton } from "@uploadthing/react";

import type { OurFileRouter } from "~/app/api/uploadthing/core";

const UploadButton = generateUploadButton<OurFileRouter>();

export function ProofComposer({
  onSubmit,
}: {
  onSubmit: (text: string, imageUrls: string[]) => void;
}) {
  const [text, setText] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  return (
    <section className="border-border mt-6 border-t pt-5">
      <p className="text-sm">Done it? Show me.</p>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="What happened?"
        className="border-border mt-3 min-h-24 w-full border bg-transparent p-3 text-sm outline-none"
      />
      <div className="mt-3 flex items-center gap-3">
        <UploadButton
          endpoint="missionProof"
          onClientUploadComplete={(files) =>
            setUrls(files.map((file) => file.ufsUrl))
          }
          onUploadError={() => undefined}
          content={{ button: "Add photo", allowedContent: "Images up to 4MB" }}
        />
        <button
          type="button"
          disabled={!text.trim() && urls.length === 0}
          onClick={() => onSubmit(text, urls)}
          className="bg-foreground text-background rounded-full px-4 py-2 text-sm disabled:opacity-40"
        >
          Send proof
        </button>
      </div>
      {urls.length ? (
        <p className="text-muted-foreground mt-2 text-xs">
          {urls.length} photo{urls.length === 1 ? "" : "s"} attached
        </p>
      ) : null}
    </section>
  );
}
