"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowsInSimple, ArrowUp } from "@phosphor-icons/react";

import { Spinner } from "@acme/ui/spinner";

import {
  convertBlockToList,
  ensureEditorHasBlock,
  exitEmptyListItem,
  getAncestorLi,
  getDirectChildBlock,
  htmlToMarkdown,
  indentOrStartBullet,
  markdownToHtml,
  matchMarkdownTrigger,
  outdent,
  placeCaretAtEnd,
  replaceBlockWithTag,
} from "./rich-text-helpers";

interface NotionComposerProps {
  open: boolean;
  initialMarkdown: string;
  placeholder: string;
  canSubmit: boolean;
  isSubmitting: boolean;
  onChange: (markdown: string) => void;
  onClose: () => void;
  onSubmit: (markdown: string) => void;
}

export function NotionComposer({
  open,
  initialMarkdown,
  placeholder,
  canSubmit,
  isSubmitting,
  onChange,
  onClose,
  onSubmit,
}: NotionComposerProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  // Track the latest markdown without re-seeding the editor on every keystroke.
  const lastEmittedRef = useRef<string>(initialMarkdown);
  const [isEmpty, setIsEmpty] = useState<boolean>(!initialMarkdown.trim());

  const emitChange = useCallback(() => {
    const root = editorRef.current;
    if (!root) return;
    const md = htmlToMarkdown(root);
    const nextEmpty = md.trim().length === 0;
    setIsEmpty((prev) => (prev === nextEmpty ? prev : nextEmpty));
    if (md === lastEmittedRef.current) return;
    lastEmittedRef.current = md;
    onChange(md);
  }, [onChange]);

  // Seed the editor exactly once per open transition. Re-seeding on every
  // `initialMarkdown` change would clobber the caret and the user's edits.
  useEffect(() => {
    if (!open) return;
    const root = editorRef.current;
    if (!root) return;
    const seedHtml = markdownToHtml(initialMarkdown);
    root.innerHTML = seedHtml || "<p><br></p>";
    ensureEditorHasBlock(root);
    lastEmittedRef.current = initialMarkdown;
    setIsEmpty(!initialMarkdown.trim());
    // Place caret at end and focus so typing is immediate.
    const last = root.lastElementChild as HTMLElement | null;
    if (last) placeCaretAtEnd(last);
    root.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Lock background scroll while overlay is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleSubmit = useCallback(() => {
    const root = editorRef.current;
    const md = root ? htmlToMarkdown(root) : lastEmittedRef.current;
    onSubmit(md);
  }, [onSubmit]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const root = editorRef.current;
      if (!root) return;

      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        if (canSubmit && !isSubmitting) handleSubmit();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        (event.key === "b" || event.key === "i" || event.key === "u")
      ) {
        event.preventDefault();
        const cmd =
          event.key === "b" ? "bold" : event.key === "i" ? "italic" : "underline";
        document.execCommand(cmd);
        emitChange();
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        const anchor = window.getSelection()?.anchorNode ?? null;
        if (event.shiftKey) outdent(anchor);
        else indentOrStartBullet(root, anchor);
        emitChange();
        return;
      }

      if (event.key === "Enter" && !event.shiftKey) {
        const anchor = window.getSelection()?.anchorNode ?? null;
        const li = getAncestorLi(anchor);
        if (li?.textContent.length === 0) {
          event.preventDefault();
          exitEmptyListItem(li);
          emitChange();
          return;
        }
      }
    },
    [canSubmit, emitChange, handleSubmit, isSubmitting, onClose],
  );

  // Markdown shortcuts run after the space lands so we see the trigger text.
  const syncEditorContent = useCallback(() => {
    const root = editorRef.current;
    if (!root) {
      return;
    }
    ensureEditorHasBlock(root);

    const sel = window.getSelection();
    const anchor = sel?.anchorNode ?? null;
    const block = getDirectChildBlock(root, anchor);

    if (block && block.tagName !== "UL" && block.tagName !== "OL") {
      const trigger = matchMarkdownTrigger(block.textContent);
      if (trigger) {
        if (trigger.type === "ul" || trigger.type === "ol") {
          convertBlockToList(block, trigger.type, trigger.rest);
        } else if (trigger.type === "quote") {
          replaceBlockWithTag(block, "blockquote", trigger.rest);
        } else {
          replaceBlockWithTag(block, trigger.type, trigger.rest);
        }
      }
    }

    emitChange();
  }, [emitChange]);

  if (!open) return null;

  return (
    <dialog
      open
      aria-modal="true"
      aria-label="Expanded note editor"
      className="bg-background fixed inset-0 z-50 flex flex-col"
    >
      <div className="border-foreground/[0.08] flex items-center justify-between border-b px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Collapse editor"
          className="text-foreground/55 hover:text-foreground/85 hover:bg-foreground/[0.04] flex size-8 items-center justify-center transition-colors outline-none focus:outline-none focus-visible:outline-none"
        >
          <ArrowsInSimple size={16} />
        </button>

        <div className="flex items-center gap-3">
          <span className="text-foreground/35 hidden text-[12px] tracking-[-0.005em] sm:inline">
            <kbd className="font-sans">⌘</kbd>
            <kbd className="ml-0.5 font-sans">↵</kbd> to send · <kbd className="font-sans">Esc</kbd> to collapse
          </span>
          {isSubmitting ? (
            <Spinner className="text-foreground/55 size-4" aria-label="Submitting" />
          ) : null}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            aria-label="Send"
            className="bg-foreground text-background hover:bg-foreground/85 disabled:bg-foreground/25 inline-flex size-8 items-center justify-center rounded-[5px] transition-colors outline-none focus:outline-none focus-visible:outline-none"
          >
            <ArrowUp size={15} weight="bold" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] px-6 pt-16 pb-32 sm:px-10">
          <div className="relative">
            {isEmpty ? (
              <span
                aria-hidden="true"
                className="text-foreground/32 pointer-events-none absolute top-0 left-0 text-[16px] leading-[1.6] tracking-[-0.005em] select-none"
              >
                {placeholder}
              </span>
            ) : null}
              <div
                ref={editorRef}
                contentEditable
                role="textbox"
                aria-label="Expanded note editor content"
                suppressContentEditableWarning
                spellCheck
                tabIndex={0}
                onInput={syncEditorContent}
                onKeyDown={handleKeyDown}
                className="notion-composer text-foreground/92 caret-foreground relative min-h-[60vh] text-[16px] leading-[1.6] tracking-[-0.005em] outline-none [&_blockquote]:border-foreground/20 [&_blockquote]:text-foreground/65 [&_blockquote]:my-3 [&_blockquote]:border-l [&_blockquote]:pl-4 [&_code]:bg-foreground/[0.06] [&_code]:rounded-[3px] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[14px] [&_h1]:mt-6 [&_h1]:mb-2 [&_h1]:text-[30px] [&_h1]:font-semibold [&_h1]:tracking-[-0.02em] [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-[24px] [&_h2]:font-semibold [&_h2]:tracking-[-0.015em] [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-[19px] [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-7 [&_p]:my-2 [&_strong]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-7 [&>*:first-child]:mt-0"
              />
          </div>
        </div>
      </div>
    </dialog>
  );
}
