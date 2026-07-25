"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowsInSimple, ArrowUp } from "@phosphor-icons/react";

import { cn } from "@acme/ui";
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

interface FocusComposerProps {
  open: boolean;
  initialMarkdown: string;
  placeholder: string;
  /** Same column class as the chat content, so writing lines up under the prompt. */
  columnClassName: string;
  canSubmit: boolean;
  isSubmitting: boolean;
  onChange: (markdown: string) => void;
  onClose: () => void;
  onSubmit: (markdown: string) => void;
  awaitingUnitAdvance?: boolean;
  onAdvanceUnit?: () => void;
}

export function FocusComposer({
  open,
  initialMarkdown,
  placeholder,
  columnClassName,
  canSubmit,
  isSubmitting,
  onChange,
  onClose,
  onSubmit,
  awaitingUnitAdvance = false,
  onAdvanceUnit,
}: FocusComposerProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  // Track the latest markdown without re-seeding the editor on every keystroke.
  const lastEmittedRef = useRef<string>(initialMarkdown);
  const [isEmpty, setIsEmpty] = useState<boolean>(!initialMarkdown.trim());
  // Drives the slide-up: false on the first paint after `open`, then flips
  // true on the next frame so the sheet transitions in from below.
  const [entered, setEntered] = useState(false);

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
    // `markdownToHtml` HTML-escapes all input, then emits only a fixed,
    // attribute-free tag whitelist (headings, p, lists, strong/em/code,
    // blockquote) — no href/event handlers/scripts — so it cannot inject.
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

  // The sheet is contained to the chat column, so the transcript behind it
  // stays scrollable on purpose — no background scroll lock. Flip `entered`
  // on the frame after open so the panel slides up instead of snapping in.
  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
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

      if (
        awaitingUnitAdvance &&
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.nativeEvent.isComposing
      ) {
        event.preventDefault();
        onAdvanceUnit?.();
        return;
      }

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
          event.key === "b"
            ? "bold"
            : event.key === "i"
              ? "italic"
              : "underline";
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
    [
      awaitingUnitAdvance,
      canSubmit,
      emitChange,
      handleSubmit,
      isSubmitting,
      onAdvanceUnit,
      onClose,
    ],
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
    // Contained to the chat column (the positioned ancestor lives in
    // education-unit-workspace), so the sidebar, header, and coach panel stay
    // live and the sheet can never anchor to the wrong element the way a
    // viewport-`fixed` overlay did.
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-end">
      {/* Dimming scrim. Click it to collapse — the sheet must never trap the
          learner, so tapping the dimmed area dismisses it and frees the
          sidebar / curriculum, exactly as a standard bottom sheet does. */}
      <button
        type="button"
        aria-label="Collapse editor"
        tabIndex={-1}
        onClick={onClose}
        className={cn(
          "bg-background/45 pointer-events-auto flex-1 cursor-default backdrop-blur-[1px] transition-opacity duration-300 outline-none motion-reduce:transition-none",
          entered ? "opacity-100" : "opacity-0",
        )}
      />
      <dialog
        open
        aria-modal="true"
        aria-label="Focus editor"
        className={cn(
          "bg-sidebar border-foreground/[0.08] pointer-events-auto m-0 flex h-[66%] w-full max-w-none flex-col border-t shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.35)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          entered ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="flex items-center justify-between px-5 py-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Collapse editor"
            className="text-foreground/55 hover:text-foreground/85 hover:bg-foreground/[0.04] flex size-8 items-center justify-center transition-colors outline-none focus:outline-none focus-visible:outline-none"
          >
            <ArrowsInSimple size={16} />
          </button>

          <div className="flex items-center gap-3">
            {isSubmitting ? (
              <Spinner
                className="text-foreground/55 size-4"
                aria-label="Submitting"
              />
            ) : null}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmitting}
              aria-label="Send"
              className="text-foreground focus-visible:ring-foreground/20 [&_svg:not([class*='text-'])]:text-foreground/70 relative inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-[9px] border border-[var(--bp-toolbar-border)] bg-[var(--bp-toolbar-surface)] bg-clip-padding px-3 text-sm font-medium whitespace-nowrap shadow-[var(--bp-toolbar-shadow)] transition-colors outline-none hover:bg-[var(--bp-toolbar-surface-hover)] focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-64 [&_svg]:pointer-events-none [&_svg]:-mx-0.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg:not([class*='opacity-'])]:opacity-85"
            >
              <ArrowUp weight="bold" />
              Send
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className={cn(columnClassName, "pt-6 pb-32")}>
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
                aria-label="Focus editor content"
                suppressContentEditableWarning
                spellCheck
                tabIndex={0}
                onInput={syncEditorContent}
                onKeyDown={handleKeyDown}
                className="focus-composer text-foreground/92 caret-foreground [&_blockquote]:border-foreground/20 [&_blockquote]:text-foreground/65 [&_code]:bg-foreground/[0.06] relative min-h-[60vh] text-[16px] leading-[1.6] tracking-[-0.005em] outline-none [&_blockquote]:my-3 [&_blockquote]:border-l [&_blockquote]:pl-4 [&_code]:rounded-[3px] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[14px] [&_h1]:mt-6 [&_h1]:mb-2 [&_h1]:text-[30px] [&_h1]:font-semibold [&_h1]:tracking-[-0.02em] [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-[24px] [&_h2]:font-semibold [&_h2]:tracking-[-0.015em] [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-[19px] [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-7 [&_p]:my-2 [&_strong]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-7 [&>*:first-child]:mt-0"
              />
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
}
