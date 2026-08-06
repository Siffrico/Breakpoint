/**
 * Glowing ring with per-letter pulse. Layout-only — the caller owns the
 * backdrop, so the same loader works inside the build screen and anywhere else
 * a long AI job needs a focal point.
 */
export function AiLoader({
  size = 180,
  text = "Generating",
}: {
  size?: number;
  text?: string;
}) {
  return (
    <div
      className="relative flex items-center justify-center select-none"
      style={{ width: size, height: size }}
      role="status"
      aria-label={text}
    >
      {text.split("").map((letter, index) => (
        <span
          key={`${index}-${letter}`}
          aria-hidden="true"
          className="bp-loader-letter inline-block text-[15px] tracking-[0.02em] text-white opacity-40"
          style={{ animationDelay: `${index * 0.1}s` }}
        >
          {/* non-breaking, so spaces in `text` survive inline-block layout */}
          {letter === " " ? " " : letter}
        </span>
      ))}

      <div className="bp-loader-circle absolute inset-0 rounded-full" />
    </div>
  );
}
