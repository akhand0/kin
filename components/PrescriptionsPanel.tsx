"use client";

import { useEffect, useRef, useState } from "react";
import type { Prescription, PrescriptionMeta } from "@/lib/types";
import { timeAgo } from "@/lib/format";

// Clinician-side: review uploaded prescriptions and update the patient's
// medicines. Saving writes through to the DB, which the patient's view polls —
// so the change appears on their side within a few seconds.
export default function PrescriptionsPanel({
  patientId,
  prescriptions,
  medicines,
  onChange,
}: {
  patientId: string;
  prescriptions: PrescriptionMeta[];
  medicines: string[];
  onChange: () => void;
}) {
  const [meds, setMeds] = useState<string[]>(medicines);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [viewing, setViewing] = useState<Prescription | null>(null);
  const [loadingView, setLoadingView] = useState<string | null>(null);

  // Re-sync when switching patients, but don't stomp an in-progress edit.
  const lastPatient = useRef(patientId);
  useEffect(() => {
    if (lastPatient.current !== patientId) {
      lastPatient.current = patientId;
      setMeds(medicines);
      setViewing(null);
      setSaved(false);
    }
  }, [patientId, medicines]);

  const dirty =
    meds.length !== medicines.length ||
    meds.some((m, i) => m !== medicines[i]);

  async function view(id: string) {
    setLoadingView(id);
    try {
      const r = await fetch(`/api/prescriptions/${id}`, { cache: "no-store" });
      if (r.ok) setViewing((await r.json()).prescription);
    } finally {
      setLoadingView(null);
    }
  }

  async function saveMeds(alsoReviewId?: string) {
    setSaving(true);
    try {
      await fetch(`/api/patients/${patientId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ medicines: meds }),
      });
      if (alsoReviewId) {
        await fetch(`/api/prescriptions/${alsoReviewId}`, { method: "PATCH" });
        setViewing(null);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onChange();
    } finally {
      setSaving(false);
    }
  }

  async function markReviewed(id: string) {
    await fetch(`/api/prescriptions/${id}`, { method: "PATCH" });
    onChange();
  }

  const pending = prescriptions.filter((p) => p.status === "pending");

  return (
    <section className="rounded-xl border border-kin-border bg-kin-panel p-5">
      <h3 className="mb-3 flex items-center text-sm font-semibold text-kin-text">
        Prescriptions
        {pending.length > 0 && (
          <span className="ml-2 rounded-full bg-kin-nudge/20 px-2 py-0.5 text-xs text-kin-nudge">
            {pending.length} to review
          </span>
        )}
      </h3>

      {/* uploads */}
      {prescriptions.length === 0 ? (
        <p className="text-sm text-kin-muted">No prescriptions uploaded.</p>
      ) : (
        <ul className="space-y-2">
          {prescriptions.map((rx) => (
            <li
              key={rx.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-kin-border bg-kin-bg px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm text-kin-text">
                  📄 {rx.file_name}
                </div>
                <div className="text-[11px] text-kin-muted">
                  {timeAgo(rx.created_at)} ·{" "}
                  {rx.status === "reviewed" ? "reviewed" : "pending"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => view(rx.id)}
                  className="rounded-lg border border-kin-border px-2.5 py-1 text-xs text-kin-text hover:bg-kin-panel"
                >
                  {loadingView === rx.id ? "…" : "View"}
                </button>
                {rx.status === "pending" && (
                  <button
                    onClick={() => markReviewed(rx.id)}
                    className="rounded-lg border border-kin-border px-2.5 py-1 text-xs text-kin-muted hover:bg-kin-panel"
                  >
                    Mark reviewed
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* viewer */}
      {viewing && (
        <div className="mt-3 rounded-lg border border-kin-border bg-kin-bg p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="truncate text-xs text-kin-muted">
              {viewing.file_name}
            </span>
            <button
              onClick={() => setViewing(null)}
              className="text-xs text-kin-muted hover:text-kin-text"
            >
              Close ✕
            </button>
          </div>
          {viewing.mime_type.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={viewing.file_url}
              alt="Prescription"
              className="max-h-80 w-full rounded object-contain"
            />
          ) : (
            <a
              href={viewing.file_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-kin-accent underline"
            >
              Open {viewing.file_name}
            </a>
          )}
          {viewing.status === "pending" && (
            <button
              onClick={() => saveMeds(viewing.id)}
              disabled={saving}
              className="mt-3 w-full rounded-lg bg-kin-accent px-3 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
            >
              Save medicines & mark reviewed
            </button>
          )}
        </div>
      )}

      {/* medicines editor */}
      <div className="mt-5 border-t border-kin-border pt-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-kin-muted">
          Current medicines
        </div>
        <ul className="space-y-1.5">
          {meds.map((m, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 rounded-lg bg-kin-bg px-3 py-1.5 text-sm text-kin-text"
            >
              <span className="truncate">💊 {m}</span>
              <button
                onClick={() => setMeds(meds.filter((_, j) => j !== i))}
                className="shrink-0 text-kin-muted hover:text-kin-alert"
                aria-label={`Remove ${m}`}
              >
                ✕
              </button>
            </li>
          ))}
          {meds.length === 0 && (
            <li className="text-sm text-kin-muted">None on record.</li>
          )}
        </ul>

        <div className="mt-2 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                setMeds([...meds, draft.trim()]);
                setDraft("");
              }
            }}
            placeholder="Add a medicine, e.g. Amlodipine 10mg"
            className="flex-1 rounded-lg border border-kin-border bg-kin-bg px-3 py-2 text-sm text-kin-text placeholder:text-kin-muted"
          />
          <button
            onClick={() => {
              if (draft.trim()) {
                setMeds([...meds, draft.trim()]);
                setDraft("");
              }
            }}
            className="rounded-lg border border-kin-border px-3 py-2 text-sm text-kin-text hover:bg-kin-bg"
          >
            Add
          </button>
        </div>

        <button
          onClick={() => saveMeds()}
          disabled={saving || !dirty}
          className="mt-3 rounded-lg bg-kin-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save medicines"}
        </button>
      </div>
    </section>
  );
}
