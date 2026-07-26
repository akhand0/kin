"use client";

import { useEffect, useRef, useState } from "react";

// Clinician-side medicines editor. Saving writes through to the DB, which the
// patient's view polls — so the change appears on their side within seconds.
// (Prescription uploads are now explained to the patient by Kin, not reviewed
// here.)
export default function MedicinesPanel({
  patientId,
  medicines,
  onChange,
}: {
  patientId: string;
  medicines: string[];
  onChange: () => void;
}) {
  const [meds, setMeds] = useState<string[]>(medicines);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Re-sync when switching patients, but don't stomp an in-progress edit.
  const lastPatient = useRef(patientId);
  useEffect(() => {
    if (lastPatient.current !== patientId) {
      lastPatient.current = patientId;
      setMeds(medicines);
      setSaved(false);
    }
  }, [patientId, medicines]);

  const dirty =
    meds.length !== medicines.length ||
    meds.some((m, i) => m !== medicines[i]);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/patients/${patientId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ medicines: meds }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onChange();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-kin-border bg-kin-panel p-5">
      <h3 className="mb-3 text-sm font-semibold text-kin-text">Medicines</h3>

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
        onClick={save}
        disabled={saving || !dirty}
        className="mt-3 rounded-lg bg-kin-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save medicines"}
      </button>
    </section>
  );
}
