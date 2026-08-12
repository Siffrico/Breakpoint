"use client";

/**
 * The scenario, read on demand as a spring-loaded peek.
 *
 * Hold the trigger (or the `S` key) and the brief slides down over the trail;
 * release and it retracts. A quick tap pins it open instead, and a second tap
 * dismisses it. Because the gesture is held rather than toggled, there is no
 * mode to forget you are in — and because nothing here touches the trail's
 * scroll offset, a reply streaming in behind the sheet keeps auto-following
 * exactly as if the sheet were never opened.
 */
import type { PointerEvent as ReactPointerEvent } from "react";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import { AssistantRichText } from "../assistant-rich-text";

export interface ScenarioBrief {
  stateA: string;
  stateB: string;
  frictionNoise: string | null;
}

export type ScenarioView = "closed" | "peeking" | "pinned";

/** Under this, a press reads as a tap (pin); over it, as a hold (spring). */
const PIN_THRESHOLD_MS = 180;

const PEEK_ELEMENT_ID = "scenario-peek";
const SCENARIO_RICH_TEXT_CLASS =
  "text-foreground/94 mt-2 text-[15px] leading-7 [&_h1]:!mt-5 [&_h1]:!text-[16px] [&_h2]:!mt-5 [&_h2]:!text-[15px] [&_h3]:!mt-4 [&_h3]:!text-[15px] [&_li]:my-1 [&_ol]:my-3 [&_p]:my-3 [&_ul]:my-3";

/**
 * Where a press lands when it is released. A press that started on a pinned
 * sheet always dismisses, so the trigger can never pin something already
 * pinned.
 */
export const nextViewOnRelease = ({
  viewOnPress,
  heldMs,
}: {
  viewOnPress: ScenarioView;
  heldMs: number;
}): ScenarioView => {
  if (viewOnPress === "pinned") return "closed";
  return heldMs < PIN_THRESHOLD_MS ? "pinned" : "closed";
};

/**
 * True when the event target is somewhere the learner is composing text. The
 * `S` shortcut must never fire while they are writing an answer.
 */
export const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return /^(input|textarea|select)$/i.test(target.tagName);
};

interface ScenarioTriggerProps {
  "aria-expanded": boolean;
  "aria-controls": string;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}

/**
 * Owns the peek gesture. `scenarioKey` identifies the brief on the board —
 * when the pass advances it changes, and the sheet resets so a stale scenario
 * can never sit over a new one. `autoPin` opens the sheet on arrival for a
 * scenario the transcript never spelled out.
 */
export const useScenarioPeek = ({
  scenarioKey,
  autoPin,
}: {
  scenarioKey: string | null;
  autoPin: boolean;
}) => {
  // The gesture is stored against the scenario it acted on, so the reset at a
  // pass boundary is a derivation rather than an effect: a brief the learner
  // has not touched yet simply has no gesture on record, and falls back to
  // `autoPin`. No effect can fire late and leave a stale sheet open.
  const [gesture, setGesture] = useState<{
    key: string | null;
    view: ScenarioView;
  } | null>(null);
  const untouchedView: ScenarioView = autoPin ? "pinned" : "closed";
  const view: ScenarioView =
    gesture?.key === scenarioKey ? gesture.view : untouchedView;

  // Mirrors `view` so the pointer and key handlers can read the live value
  // without touching a ref during render.
  const viewRef = useRef<ScenarioView>("closed");
  const viewOnPressRef = useRef<ScenarioView>("closed");
  const pressedAtRef = useRef(0);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const setView = useCallback(
    (next: ScenarioView) => setGesture({ key: scenarioKey, view: next }),
    [scenarioKey],
  );

  const press = useCallback(() => {
    const current = viewRef.current;
    viewOnPressRef.current = current;
    pressedAtRef.current = performance.now();
    if (current !== "pinned") setView("peeking");
  }, [setView]);

  const release = useCallback(() => {
    setView(
      nextViewOnRelease({
        viewOnPress: viewOnPressRef.current,
        heldMs: performance.now() - pressedAtRef.current,
      }),
    );
  }, [setView]);

  // `S` mirrors the pointer exactly — hold to peek, tap to pin — so the
  // keyboard path is the same gesture, not a second set of rules.
  useEffect(() => {
    if (scenarioKey === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setView("closed");
        return;
      }
      if (event.key !== "s" && event.key !== "S") return;
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey)
        return;
      if (isTypingTarget(event.target)) return;
      press();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "s" && event.key !== "S") return;
      if (isTypingTarget(event.target)) return;
      release();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [press, release, scenarioKey, setView]);

  const isOpen = view !== "closed";

  const triggerProps: ScenarioTriggerProps = {
    "aria-expanded": isOpen,
    "aria-controls": PEEK_ELEMENT_ID,
    onPointerDown: (event) => {
      // Keeps the press from stealing focus or selecting the label, so the
      // learner can peek mid-sentence without losing the composer's caret.
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      press();
    },
    onPointerUp: release,
    onPointerCancel: () => setView("closed"),
    onKeyDown: (event) => {
      // The press gesture swallows focus, so Tab + Enter/Space is the keyboard
      // path to the trigger itself: it toggles the pin rather than springing,
      // because a held key on a focused button is not a gesture people make.
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      setView(viewRef.current === "pinned" ? "closed" : "pinned");
    },
  };

  return { isOpen, triggerProps };
};

function ScenarioPeekComponent({
  scenario,
  open,
  columnClassName,
}: {
  scenario: ScenarioBrief;
  open: boolean;
  columnClassName: string;
}) {
  return (
    // Always mounted so a hold paints on the first frame — the sheet rides in
    // on a transform, which composites without touching layout or the trail.
    <div
      id={PEEK_ELEMENT_ID}
      role="region"
      aria-label="Scenario"
      aria-hidden={!open}
      className={`bg-background border-foreground/[0.08] absolute inset-x-0 top-0 z-20 max-h-full overflow-y-auto border-b transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
        open
          ? "translate-y-0 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)]"
          : "pointer-events-none -translate-y-full"
      }`}
    >
      <div className={`${columnClassName} py-6 font-sans`}>
        <h2 className="text-foreground/52 text-[13px] font-medium tracking-[0.08em]">
          THE SITUATION
        </h2>
        <AssistantRichText
          content={scenario.stateA}
          className={SCENARIO_RICH_TEXT_CLASS}
        />

        <h2 className="text-foreground/52 mt-7 text-[13px] font-medium tracking-[0.08em]">
          WHAT DONE LOOKS LIKE
        </h2>
        <AssistantRichText
          content={scenario.stateB}
          className={SCENARIO_RICH_TEXT_CLASS}
        />

        {scenario.frictionNoise ? (
          <>
            <h2 className="text-foreground/52 mt-7 text-[13px] font-medium tracking-[0.08em]">
              COMPLICATIONS
            </h2>
            <AssistantRichText
              content={scenario.frictionNoise}
              className={SCENARIO_RICH_TEXT_CLASS}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Memoised because the workspace re-renders on every streamed chunk, and the
 * sheet's props change only when the pass does.
 */
export const ScenarioPeek = memo(ScenarioPeekComponent);
