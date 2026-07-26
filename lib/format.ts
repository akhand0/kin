// Small formatting helpers shared by client components.

export function timeAgo(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  return `${d}d ago`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function shortDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const TRIAGE_COLOR: Record<string, string> = {
  on_track: "#4ade80",
  nudge: "#fbbf24",
  red_flag: "#f87171",
};

export const TRIAGE_LABEL: Record<string, string> = {
  on_track: "On track",
  nudge: "Needs a nudge",
  red_flag: "Red flag",
};
