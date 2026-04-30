const WORDMARK = `██████╗ ██████╗ ███████╗ █████╗ ██╗  ██╗██████╗  ██████╗ ██╗███╗   ██╗████████╗
██╔══██╗██╔══██╗██╔════╝██╔══██╗██║ ██╔╝██╔══██╗██╔═══██╗██║████╗  ██║╚══██╔══╝
██████╔╝██████╔╝█████╗  ███████║█████╔╝ ██████╔╝██║   ██║██║██╔██╗ ██║   ██║
██╔══██╗██╔══██╗██╔══╝  ██╔══██║██╔═██╗ ██╔═══╝ ██║   ██║██║██║╚██╗██║   ██║
██████╔╝██║  ██║███████╗██║  ██║██║  ██╗██║     ╚██████╔╝██║██║ ╚████║   ██║
╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝      ╚═════╝ ╚═╝╚═╝  ╚═══╝   ╚═╝`;

const ORBIT = `              ·    ✦    ·    ✧    ·    ✦    ·
         ·                                       ·
    ✧            ╭───────────────────╮            ✧
              ╱                         ╲
       ·    ╱        ░▒▓█████▓▒░         ╲    ·
           │       ░▓███████████▓░        │
    ✦      │      ▓████   ◉   ████▓       │      ✦
           │       ░▓███████████▓░        │
       ·    ╲        ░▒▓█████▓▒░         ╱    ·
              ╲                         ╱
    ✧            ╰───────────────────╯            ✧
         ·                                       ·
              ·    ✦    ·    ✧    ·    ✦    ·`;

const SHIMMER_CSS = `
@keyframes auth-shimmer {
  0%   { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}
@keyframes auth-orbit-pulse {
  0%, 100% { opacity: 0.78; filter: drop-shadow(0 0 8px rgba(34,211,238,0.35)); }
  50%      { opacity: 1;    filter: drop-shadow(0 0 18px rgba(217,70,239,0.55)); }
}
@keyframes auth-scan {
  0%   { transform: translateY(-100%); }
  100% { transform: translateY(100%); }
}
.auth-shimmer {
  background-image: linear-gradient(
    90deg,
    #f0abfc 0%,
    #67e8f9 25%,
    #fde68a 50%,
    #67e8f9 75%,
    #f0abfc 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: auth-shimmer 8s linear infinite;
}
.auth-orbit {
  animation: auth-orbit-pulse 4.2s ease-in-out infinite;
}
.auth-scan-bar {
  animation: auth-scan 6s linear infinite;
}
`;

export function AuthArt() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-zinc-950 text-white">
      <style>{SHIMMER_CSS}</style>

      {/* color washes */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: [
            "radial-gradient(ellipse 60% 50% at 25% 18%, rgba(217,70,239,0.32), transparent 60%)",
            "radial-gradient(ellipse 55% 45% at 78% 78%, rgba(34,211,238,0.28), transparent 60%)",
            "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(245,158,11,0.10), transparent 70%)",
          ].join(", "),
        }}
      />

      {/* technical grid */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
          maskImage:
            "radial-gradient(ellipse at center, black 30%, transparent 80%)",
        }}
      />

      {/* CRT scanlines */}
      <div
        aria-hidden
        className="absolute inset-0 mix-blend-overlay opacity-30"
        style={{
          backgroundImage:
            "repeating-linear-gradient(180deg, transparent 0, transparent 3px, rgba(0,0,0,0.4) 3px, rgba(0,0,0,0.4) 4px)",
        }}
      />

      {/* sweeping scan bar */}
      <div aria-hidden className="absolute inset-0 overflow-hidden">
        <div
          className="auth-scan-bar absolute inset-x-0 h-32 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(180deg, transparent, rgba(34,211,238,0.18) 50%, transparent)",
          }}
        />
      </div>

      {/* corner brackets */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-6 top-6 h-10 w-10 border-l border-t border-fuchsia-300/50"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute right-6 top-6 h-10 w-10 border-r border-t border-cyan-300/50"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-6 left-6 h-10 w-10 border-b border-l border-cyan-300/50"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-6 right-6 h-10 w-10 border-b border-r border-amber-200/50"
      />

      {/* content */}
      <div className="relative z-10 flex h-full flex-col justify-between gap-10 p-10 font-mono">
        {/* header strip */}
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.4em] text-white/55">
          <div className="flex items-center gap-2">
            <span className="inline-block size-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_10px_rgba(217,70,239,0.9)]" />
            <span className="inline-block size-1.5 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.9)]" />
            <span className="inline-block size-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
            <span className="ml-3 text-white/40">// breakpoint</span>
          </div>
          <span className="text-white/40">v0.1 ░▒▓ secure</span>
        </div>

        {/* wordmark */}
        <div className="space-y-4">
          <pre className="auth-shimmer whitespace-pre text-[7px] leading-[1.05] sm:text-[8px] xl:text-[10px]">
            {WORDMARK}
          </pre>
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.35em] text-white/55">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-fuchsia-400/60 to-transparent" />
            <span>identity · access · momentum</span>
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
          </div>
        </div>

        {/* orbital centerpiece */}
        <div className="flex flex-col items-center gap-4">
          <pre className="auth-orbit whitespace-pre text-[10px] leading-[1.1] text-cyan-200/90 xl:text-[11px]">
            {ORBIT}
          </pre>
          <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-white/45">
            <span className="text-fuchsia-300">▰▰▰</span>{" "}
            <span>signal · locked</span>{" "}
            <span className="text-cyan-300">▰▰▰</span>
          </div>
        </div>

        {/* terminal status */}
        <div className="space-y-1.5 font-mono text-[11px] text-white/65">
          <div className="flex items-center gap-2">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
            <span className="uppercase tracking-[0.3em] text-emerald-300/90">
              session :: ready
            </span>
          </div>
          <StatusLine
            dot="bg-fuchsia-400"
            label="protocol"
            value="handshake.v3 / open"
          />
          <StatusLine
            dot="bg-cyan-300"
            label="cipher"
            value="x25519 · chacha20"
          />
          <StatusLine
            dot="bg-amber-300"
            label="latency"
            value="~ 42ms · 41ms · 39ms"
          />
          <StatusLine
            dot="bg-violet-300"
            label="origin"
            value="local // awaiting auth"
          />
        </div>
      </div>
    </div>
  );
}

function StatusLine({
  dot,
  label,
  value,
}: {
  dot: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={`inline-block size-1.5 rounded-full ${dot}`} />
      <span className="w-20 uppercase tracking-[0.25em] text-white/40 text-[10px]">
        {label}
      </span>
      <span className="text-white/70">{value}</span>
    </div>
  );
}
