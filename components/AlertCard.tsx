"use client";

import { useState } from "react";
import type { Alert } from "@/lib/types";
import { timeAgo } from "@/lib/format";

const KIND_META: Record<
  Alert["kind"],
  { label: string; color: string; icon: string }
> = {
  loud_anomaly: { label: "Red flag", color: "#f87171", icon: "🚩" },
  quiet_anomaly: { label: "Gone quiet", color: "#fbbf24", icon: "🌙" },
  unreachable: { label: "Unreachable", color: "#fb923c", icon: "📵" },
  care_request: { label: "Contact requested", color: "#60a5fa", icon: "💬" },
};

export default function AlertCard({
  alert,
  onChange,
}: {
  alert: Alert;
  onChange: (a: Alert) => void;
}) {
  const [busy, setBusy] = useState(false);
  const meta = KIND_META[alert.kind];
  const isOpen = alert.status === "open";

  async function setStatus(status: Alert["status"]) {
    setBusy(true);
    try {
      const res = await fetch(`/api/alerts/${alert.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.alert) onChange(json.alert);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`kin-pop rounded-xl border bg-kin-panel2 p-4 ${
        isOpen ? "" : "opacity-60"
      }`}
      style={{ borderColor: isOpen ? meta.color : "#2a2f3a" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold"
            style={{ background: `${meta.color}22`, color: meta.color }}
          >
            {meta.icon} {meta.label}
          </span>
          <span className="text-xs text-kin-muted">
            {timeAgo(alert.created_at)}
          </span>
        </div>
        <span className="text-xs text-kin-muted">
          {"●".repeat(alert.severity)}
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-kin-text">
        {alert.context}
      </p>

      {alert.suggested_action && (
        <p className="mt-2 rounded-lg bg-kin-bg/60 px-3 py-2 text-sm text-kin-accent">
          → {alert.suggested_action}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        {isOpen && (
          <>
            <button
              disabled={busy}
              onClick={() => setStatus("acked")}
              className="rounded-lg border border-kin-border px-3 py-1.5 text-xs font-medium text-kin-text hover:bg-kin-bg disabled:opacity-50"
            >
              Claim
            </button>
            <button
              disabled={busy}
              onClick={() => setStatus("resolved")}
              className="rounded-lg bg-kin-calm/90 px-3 py-1.5 text-xs font-semibold text-black hover:bg-kin-calm disabled:opacity-50"
            >
              Mark resolved
            </button>
          </>
        )}
        {alert.status === "acked" && (
          <>
            <span className="text-xs text-kin-muted">Claimed</span>
            <button
              disabled={busy}
              onClick={() => setStatus("resolved")}
              className="rounded-lg bg-kin-calm/90 px-3 py-1.5 text-xs font-semibold text-black hover:bg-kin-calm disabled:opacity-50"
            >
              Mark resolved
            </button>
          </>
        )}
        {alert.status === "resolved" && (
          <span className="text-xs text-kin-calm">
            ✓ Resolved {alert.resolved_at ? timeAgo(alert.resolved_at) : ""}
          </span>
        )}
      </div>
    </div>
  );
}
