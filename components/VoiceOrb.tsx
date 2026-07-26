"use client";

// The tap-to-talk orb, shared by the browser-native voice mode and the
// ElevenLabs agent mode. Purely presentational — the parent maps its own state
// to a Mode and handles taps.
export type Mode = "idle" | "listening" | "thinking" | "speaking";

export function VoiceOrb({ mode, onTap }: { mode: Mode; onTap: () => void }) {
  const listening = mode === "listening";
  const busy = mode === "thinking" || mode === "speaking";
  return (
    <button
      onClick={onTap}
      aria-label={
        mode === "idle" ? "Tap to talk to Kin" : "Tap to end the conversation"
      }
      className="relative flex h-40 w-40 items-center justify-center rounded-full outline-none"
    >
      {/* expanding rings while listening */}
      {listening && (
        <>
          <span className="kin-ring absolute inset-0 rounded-full bg-kin-accent/30" />
          <span
            className="kin-ring absolute inset-0 rounded-full bg-kin-accent/20"
            style={{ animationDelay: "0.6s" }}
          />
        </>
      )}
      {/* the orb */}
      <span
        className={`relative flex h-28 w-28 items-center justify-center rounded-full text-white shadow-lg transition ${
          busy ? "kin-breathe" : ""
        }`}
        style={{
          background: listening
            ? "radial-gradient(circle at 35% 30%, #a5b8ff, #7c9cff)"
            : mode === "thinking"
              ? "radial-gradient(circle at 35% 30%, #3a4150, #2a2f3a)"
              : "radial-gradient(circle at 35% 30%, #8aa2ff, #6b8bff)",
          boxShadow: listening ? "0 0 40px #7c9cff88" : "0 0 24px #7c9cff44",
        }}
      >
        {mode === "thinking" ? (
          <ThinkingSpinner />
        ) : mode === "speaking" ? (
          <SpeakingWave />
        ) : listening ? (
          <Equalizer />
        ) : (
          <MicIcon />
        )}
      </span>
    </button>
  );
}

function MicIcon() {
  // Solid microphone — the clearest "tap to talk" affordance.
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
      <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.75 6.75 0 0 1-6 6.708V22.5a.75.75 0 0 1-1.5 0v-1.542a6.75 6.75 0 0 1-6-6.708v-1.5A.75.75 0 0 1 6 10.5Z" />
    </svg>
  );
}

function Equalizer() {
  // Snappy bars while Kin listens — "I'm hearing you."
  const heights = [14, 26, 20, 30, 16];
  return (
    <div className="flex items-center gap-[4px]" style={{ height: 30 }}>
      {heights.map((h, i) => (
        <span
          key={i}
          className="kin-bar w-[4px] rounded-full bg-white"
          style={{ height: h, animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </div>
  );
}

function SpeakingWave() {
  // A smoother, slower waveform while Kin speaks — distinct from the snappier
  // listening equalizer: more bars, a travelling sine-like ripple.
  const heights = [10, 18, 26, 30, 26, 18, 10];
  return (
    <div className="flex items-center gap-[3px]" style={{ height: 30 }}>
      {heights.map((h, i) => (
        <span
          key={i}
          className="kin-bar w-[3px] rounded-full bg-white"
          style={{
            height: h,
            animationDuration: "1.3s",
            animationDelay: `${i * 0.11}s`,
          }}
        />
      ))}
    </div>
  );
}

function ThinkingSpinner() {
  return (
    <svg
      className="kin-spin"
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
