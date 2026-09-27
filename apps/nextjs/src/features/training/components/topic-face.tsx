"use client";

import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import { motion, useReducedMotion, useSpring } from "motion/react";

// Adapted from SmoothUI's AI Orb Face (smoothui.dev/docs/components/ai-orb-face)
// for a dense list: the WebGL orb body is replaced by its own painted
// fallback, and blinks, hops and saccades are dropped. The only motion is the
// gaze, and only while the pointer is over `trackRef`, so a sidebar full of
// faces costs nothing at rest.

const VIEWBOX = 100;
const CENTER = VIEWBOX / 2;
const EYE_OFFSET = 16;
const EYE_Y = 37;
const EYE_WIDTH = 11;
const EYE_HEIGHT = 26;
const EYE_RADIUS = 5.5;
/** How far the eyes travel from centre, in viewBox units. */
const GAZE_RANGE = 7;
/** Pointer distance, in px, at which the gaze reaches full deflection. */
const GAZE_FALLOFF = 160;

interface EyeShape {
  /** Multiplier on the resting height; `0` is a shut eye. */
  h: number;
  /** Multiplier on the resting width. */
  w: number;
  /** Degrees; positive tilts the inner corner down. */
  rotate?: number;
  /** Vertical offset in viewBox units. */
  dy?: number;
}

export type TopicFaceMood = "idle" | "thinking" | "streaming";

const EXPRESSIONS: Record<TopicFaceMood, { left: EyeShape; right: EyeShape }> =
  {
    idle: { left: { h: 1, w: 1 }, right: { h: 1, w: 1 } },
    thinking: {
      left: { h: 1, w: 1 },
      right: { h: 0.45, w: 1.1, rotate: -14 },
    },
    streaming: { left: { h: 0.55, w: 1.05 }, right: { h: 0.55, w: 1.05 } },
  };

/**
 * Eight body hues at one lightness and chroma, so any mix of faces reads as a
 * matched set rather than a rainbow. Chroma is pushed past sRGB on purpose:
 * P3 displays show it saturated, others gamut-map to their most vivid match.
 * Lilac (322) is SmoothUI's own default.
 */
const BODY_HUES = [322, 25, 65, 145, 185, 230, 265, 355] as const;
const FEATURE_COLOR = "oklch(24% 0.03 280)";

/**
 * Stable per-topic hue: FNV-1a over the seed, so the same topic always gets
 * the same face color with nothing stored.
 */
function hueForSeed(seed: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return BODY_HUES[(hash >>> 0) % BODY_HUES.length] ?? BODY_HUES[0];
}

export function TopicFace({
  seed,
  mood,
  size,
  trackRef,
}: {
  /** Picks the body color; pass something stable, like the topic id. */
  seed: string;
  mood: TopicFaceMood;
  size: number;
  /** Element whose hover drives the gaze (the row, not the whole page). */
  trackRef: RefObject<HTMLElement | null>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const gazeX = useSpring(0, { damping: 26, stiffness: 220 });
  const gazeY = useSpring(0, { damping: 26, stiffness: 220 });

  useEffect(() => {
    const target = trackRef.current;
    if (!target || shouldReduceMotion) return;

    const look = (event: PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const reach = Math.min(1, Math.hypot(dx, dy) / GAZE_FALLOFF) * GAZE_RANGE;
      const angle = Math.atan2(dy, dx);
      gazeX.set(Math.cos(angle) * reach);
      gazeY.set(Math.sin(angle) * reach);
    };
    const rest = () => {
      gazeX.set(0);
      gazeY.set(0);
    };

    target.addEventListener("pointermove", look);
    target.addEventListener("pointerleave", rest);
    return () => {
      target.removeEventListener("pointermove", look);
      target.removeEventListener("pointerleave", rest);
    };
  }, [gazeX, gazeY, shouldReduceMotion, trackRef]);

  const expression = EXPRESSIONS[mood];
  const hue = hueForSeed(seed);

  const renderEye = (side: -1 | 1) => {
    const shape = side === -1 ? expression.left : expression.right;
    const width = EYE_WIDTH * shape.w;
    const height = Math.max(EYE_HEIGHT * shape.h, 0.5);
    const x = CENTER + side * EYE_OFFSET - width / 2;
    // Keep the eye centred as it narrows, so a squint reads as lids meeting.
    const y = EYE_Y + (EYE_HEIGHT - height) / 2 + (shape.dy ?? 0);
    return (
      <motion.rect
        fill={FEATURE_COLOR}
        height={height}
        rx={Math.min(EYE_RADIUS * shape.w, height / 2)}
        style={{
          rotate: shape.rotate ?? 0,
          transformOrigin: `${x + width / 2}px ${y + height / 2}px`,
          x: gazeX,
          y: gazeY,
        }}
        width={width}
        x={x}
        y={y}
      />
    );
  };

  return (
    <span
      aria-hidden="true"
      className="relative block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 34% 28%, oklch(88% 0.12 ${hue}), oklch(66% 0.24 ${hue}) 58%, oklch(56% 0.22 ${hue}))`,
      }}
    >
      <svg
        ref={svgRef}
        className="absolute inset-0 block size-full overflow-visible"
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      >
        {renderEye(-1)}
        {renderEye(1)}
      </svg>
    </span>
  );
}
