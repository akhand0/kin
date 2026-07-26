"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PrescriptionMeta } from "@/lib/types";

// Patient-side: upload a prescription photo and Kin reads it back in plain
// language (what it is, how to take it), with a "check with your pharmacist"
// guardrail. It is NOT sent to the clinician for review.
export default function PrescriptionUpload() {
  const [list, setList] = useState<PrescriptionMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/prescriptions", { cache: "no-store" });
      if (r.ok) setList((await r.json()).prescriptions ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onFile = useCallback(
    async (file: File) => {
      setError(null);
      if (file.size > 4.5 * 1024 * 1024) {
        setError("That file is over 4 MB — please choose a smaller photo.");
        return;
      }
      setBusy(true);
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result));
          fr.onerror = () => reject(new Error("read failed"));
          fr.readAsDataURL(file);
        });
        const res = await fetch("/api/prescriptions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            file_name: file.name,
            mime_type: file.type,
            data_url: dataUrl,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Upload failed.");
        } else {
          await load();
        }
      } catch {
        setError("Upload failed. Please try again.");
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [load],
  );

  return (
    <div className="mt-6 rounded-2xl border border-kin-border bg-kin-panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-kin-text">
            Prescriptions
          </div>
          <p className="mt-0.5 text-xs text-kin-muted">
            Snap a photo of a prescription and Kin will explain what it&apos;s
            for and how to take it.
          </p>
        </div>
        <label className="shrink-0 cursor-pointer rounded-lg bg-kin-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90">
          {busy ? "Reading…" : "Upload"}
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
        </label>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-kin-alert/10 px-3 py-2 text-sm text-kin-alert">
          {error}
        </p>
      )}

      {busy && (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-kin-bg px-3 py-2 text-sm text-kin-muted">
          <span className="kin-pulse text-kin-accent">◆</span>
          Reading your prescription…
        </p>
      )}

      {list.length > 0 && (
        <ul className="mt-4 space-y-3">
          {list.map((rx) => (
            <li
              key={rx.id}
              className="rounded-lg border border-kin-border bg-kin-bg p-3"
            >
              <div className="flex items-center gap-2 text-sm text-kin-text">
                <span aria-hidden>📄</span>
                <span className="truncate">{rx.file_name}</span>
              </div>
              {rx.explanation && (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-kin-muted">
                  {rx.explanation}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
