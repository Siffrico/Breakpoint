const HARD_MAX_HEIGHT_PX = 640;
const VIEWPORT_RATIO_CAP = 0.5;

/**
 * Grow a textarea to fit its content, clamped between `minHeightPx` and the
 * smaller of a hard cap and half the viewport. Shared by every composer shape
 * so growth behaviour stays identical across onboarding and the workspace.
 */
export function syncComposerHeight(
  element: HTMLTextAreaElement | null,
  minHeightPx: number,
  maxHeightPx = HARD_MAX_HEIGHT_PX,
) {
  if (!element) return;

  const viewportCap =
    typeof window === "undefined"
      ? maxHeightPx
      : Math.min(
          maxHeightPx,
          Math.floor(window.innerHeight * VIEWPORT_RATIO_CAP),
        );
  const maxHeight = Math.max(minHeightPx, viewportCap);

  element.style.height = "0px";
  const nextHeight = Math.max(
    minHeightPx,
    Math.min(element.scrollHeight, maxHeight),
  );
  element.style.height = `${nextHeight}px`;
  element.style.overflowY =
    element.scrollHeight > maxHeight ? "auto" : "hidden";
}
