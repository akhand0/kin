"use client";

import type { EngagementEvent, Signal } from "@/lib/types";
import { TRIAGE_COLOR } from "@/lib/format";

const DAY = 24 * 3600 * 1000;

// A 30-day "heartbeat" strip. Each day is a bar; height = check-in count,
// colour = worst triage that day. Silent days show a faint baseline tick —
// visually, the rhythm breaking is the anomaly.
export default function RhythmSparkline({
  events,
  signals,
  days = 30,
  now = Date.now(),
}: {
  events: EngagementEvent[];
  signals: Signal[];
  days?: number;
  now?: number;
}) {
  const width = 640;
  const height = 96;
  const pad = 6;
  const slot = (width - pad * 2) / days;
  const maxBar = height - 28;

  const startDay = new Date(now);
  startDay.setHours(0, 0, 0, 0);
  const start = startDay.getTime() - (days - 1) * DAY;

  const buckets = Array.from({ length: days }, (_, i) => {
    const dayStart = start + i * DAY;
    const dayEnd = dayStart + DAY;
    const dayEvents = events.filter((e) => {
      const t = new Date(e.ts).getTime();
      return e.direction === "pull" && t >= dayStart && t < dayEnd;
    });
    const daySignals = signals.filter((s) => {
      const t = new Date(s.ts).getTime();
      return t >= dayStart && t < dayEnd;
    });
    let worst: "on_track" | "nudge" | "red_flag" | null = null;
    for (const s of daySignals) {
      if (s.triage === "red_flag") worst = "red_flag";
      else if (s.triage === "nudge" && worst !== "red_flag") worst = "nudge";
      else if (!worst) worst = "on_track";
    }
    return { count: dayEvents.length, worst, dayStart };
  });

  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="30-day engagement rhythm"
      >
        {/* baseline */}
        <line
          x1={pad}
          x2={width - pad}
          y1={height - 18}
          y2={height - 18}
          stroke="#2a2f3a"
          strokeWidth={1}
        />
        {buckets.map((b, i) => {
          const x = pad + i * slot + slot / 2;
          const barH = b.count === 0 ? 0 : (b.count / maxCount) * maxBar;
          const color = b.worst ? TRIAGE_COLOR[b.worst] : "#2a2f3a";
          const barW = Math.max(3, slot * 0.5);
          return (
            <g key={i}>
              {b.count === 0 ? (
                // silent day — a faint tick on the baseline
                <circle cx={x} cy={height - 18} r={1.6} fill="#3a4150" />
              ) : (
                <rect
                  x={x - barW / 2}
                  y={height - 18 - barH}
                  width={barW}
                  height={barH}
                  rx={2}
                  fill={color}
                />
              )}
            </g>
          );
        })}
        {/* day labels at start / mid / end */}
        {[0, Math.floor(days / 2), days - 1].map((i) => (
          <text
            key={i}
            x={pad + i * slot + slot / 2}
            y={height - 4}
            fontSize={9}
            fill="#9aa2b1"
            textAnchor="middle"
          >
            {new Date(buckets[i].dayStart).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </text>
        ))}
      </svg>
    </div>
  );
}
