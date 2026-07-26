"use client";

import { useState } from "react";
import type { Patient } from "@/lib/types";

// One-click demo triggers so the 3-minute run never depends on a live mic.
export default function DemoControls({
  roster,
  onAfter,
}: {
  roster: Patient[];
  onAfter: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [customPatient, setCustomPatient] = useState(roster[0]?.id ?? "");

  // The two scripted demo patients (see lib/seed.ts).
  const priya = roster.find((p) => p.id === "p_priya") ?? roster[0];
  const miguel = roster.find((p) => p.id === "p_miguel") ?? roster[1];

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label);
    setNote(null);
    try {
      const msg = await fn();
      setNote(msg);
      onAfter();
      // one more refresh shortly after, so derived alerts show up
      setTimeout(onAfter, 800);
    } catch (e) {
      setNote(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function checkin(patientId: string, transcript: string) {
    const res = await fetch("/api/checkin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patientId, transcript }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    const t = json.signal?.triage as string;
    return `Triaged as “${t}”. ${
      json.alerts?.length
        ? "Escalated to the clinician."
        : "Kin handled it — no escalation."
    }`;
  }

  return (
    <div className="rounded-xl border border-dashed border-kin-border bg-kin-panel/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-kin-muted">
          Demo controls
        </span>
        <span className="text-[11px] text-kin-muted">
          (stand-in for the ElevenLabs voice widget)
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {priya && (
          <button
            disabled={!!busy}
            onClick={() =>
              run("priya", () =>
                checkin(
                  priya.id,
                  "Aaj subah se chakkar aa rahe hain, aur maine apni BP ki dawai do baar nahi li.",
                ),
              )
            }
            className="rounded-lg bg-kin-alert/90 px-3 py-2 text-sm font-semibold text-black hover:bg-kin-alert disabled:opacity-50"
          >
            {busy === "priya"
              ? "…"
              : `▶ Live check-in · ${priya.name} (Hindi)`}
          </button>
        )}

        {miguel && (
          <button
            disabled={!!busy}
            onClick={() =>
              run("push", async () => {
                await fetch("/api/push", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    patientId: miguel.id,
                    answered: false,
                  }),
                });
                return `Follow-up call to ${miguel.name} unanswered. Anomaly sweep run.`;
              })
            }
            className="rounded-lg border border-kin-border px-3 py-2 text-sm font-medium text-kin-text hover:bg-kin-bg disabled:opacity-50"
          >
            {busy === "push"
              ? "…"
              : `📞 Kin calls ${miguel.name} (unanswered)`}
          </button>
        )}

        <button
          disabled={!!busy}
          onClick={() =>
            run("sweep", async () => {
              const res = await fetch("/api/anomaly-check?secret=dev-secret");
              const json = await res.json();
              return `Kin swept the caseload: handled ${json.handled}, escalated ${json.escalated}.`;
            })
          }
          className="rounded-lg border border-kin-border px-3 py-2 text-sm font-medium text-kin-text hover:bg-kin-bg disabled:opacity-50"
        >
          {busy === "sweep" ? "…" : "🔁 Run Kin's sweep"}
        </button>
      </div>

      {/* free-text check-in for judges to try any language */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={customPatient}
          onChange={(e) => setCustomPatient(e.target.value)}
          className="rounded-lg border border-kin-border bg-kin-bg px-2 py-2 text-sm text-kin-text"
        >
          {roster.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.patient_ref}
            </option>
          ))}
        </select>
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Type a check-in in any language…"
          className="min-w-[220px] flex-1 rounded-lg border border-kin-border bg-kin-bg px-3 py-2 text-sm text-kin-text placeholder:text-kin-muted"
          onKeyDown={(e) => {
            if (e.key === "Enter" && custom.trim() && customPatient) {
              const text = custom.trim();
              setCustom("");
              run("custom", () => checkin(customPatient, text));
            }
          }}
        />
        <button
          disabled={!!busy || !custom.trim() || !customPatient}
          onClick={() => {
            const text = custom.trim();
            setCustom("");
            run("custom", () => checkin(customPatient, text));
          }}
          className="rounded-lg bg-kin-accent/90 px-3 py-2 text-sm font-semibold text-black hover:bg-kin-accent disabled:opacity-50"
        >
          Send
        </button>
      </div>

      {note && <p className="mt-2 text-xs text-kin-muted">{note}</p>}
    </div>
  );
}
