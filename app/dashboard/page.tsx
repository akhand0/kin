"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  AgentAction,
  Alert,
  EngagementEvent,
  Patient,
  Signal,
} from "@/lib/types";
import type { AgentSummary } from "@/lib/agent";
import { timeAgo, TRIAGE_COLOR } from "@/lib/format";
import RhythmSparkline from "@/components/RhythmSparkline";
import AlertCard from "@/components/AlertCard";
import Timeline from "@/components/Timeline";
import WeeklyDigest from "@/components/WeeklyDigest";
import DemoControls from "@/components/DemoControls";
import AgentPanel from "@/components/AgentPanel";
import AgentLog from "@/components/AgentLog";
import MedicinesPanel from "@/components/PrescriptionsPanel";

type RosterItem = Patient & {
  last_checkin: string | null;
  open_alerts: number;
  top_severity: number;
  top_kind: Alert["kind"] | null;
  agent_handling: boolean;
};

interface Bundle {
  patient: Patient;
  events: EngagementEvent[];
  signals: Signal[];
  alerts: Alert[];
  actions: AgentAction[];
}

const KIND_ICON: Record<Alert["kind"], string> = {
  loud_anomaly: "🚩",
  quiet_anomaly: "🌙",
  unreachable: "📵",
  care_request: "💬",
};
const KIND_LABEL: Record<Alert["kind"], string> = {
  loud_anomaly: "red flag",
  quiet_anomaly: "gone quiet",
  unreachable: "unreachable",
  care_request: "contact requested",
};

export default function Dashboard() {
  const router = useRouter();
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [backend, setBackend] = useState("");
  const [clinician, setClinician] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;

  const loadRoster = useCallback(async () => {
    const res = await fetch("/api/patients", { cache: "no-store" });
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    const json = await res.json();
    setBackend(json.backend);
    setAgent(json.agent);
    setClinician(json.session?.name ?? "");
    setRoster(json.patients);
    if (!selectedRef.current && json.patients.length) {
      const sorted = [...json.patients].sort(
        (a, b) => b.top_severity - a.top_severity,
      );
      setSelectedId(sorted[0].id);
    }
  }, [router]);

  const loadBundle = useCallback(async (id: string) => {
    const res = await fetch(`/api/patients/${id}`, { cache: "no-store" });
    if (res.ok) setBundle(await res.json());
  }, []);

  useEffect(() => {
    loadRoster();
    const t = setInterval(loadRoster, 4000);
    return () => clearInterval(t);
  }, [loadRoster]);

  useEffect(() => {
    if (!selectedId) return;
    loadBundle(selectedId);
    const t = setInterval(() => {
      if (selectedRef.current) loadBundle(selectedRef.current);
    }, 3000);
    return () => clearInterval(t);
  }, [selectedId, loadBundle]);

  const refresh = useCallback(() => {
    loadRoster();
    if (selectedRef.current) loadBundle(selectedRef.current);
  }, [loadRoster, loadBundle]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  const escalated = useMemo(
    () =>
      roster
        .filter((p) => p.open_alerts > 0)
        .sort((a, b) => b.top_severity - a.top_severity),
    [roster],
  );
  const handling = useMemo(
    () => roster.filter((p) => p.open_alerts === 0 && p.agent_handling),
    [roster],
  );
  const onTrack = useMemo(
    () => roster.filter((p) => p.open_alerts === 0 && !p.agent_handling),
    [roster],
  );

  const openAlerts = useMemo(
    () => (bundle?.alerts ?? []).filter((a) => a.status === "open"),
    [bundle],
  );
  const pastAlerts = useMemo(
    () => (bundle?.alerts ?? []).filter((a) => a.status !== "open"),
    [bundle],
  );

  return (
    <div className="min-h-screen bg-kin-bg">
      <Header
        backend={backend}
        clinician={clinician}
        escalated={escalated.length}
        total={roster.length}
        onSignOut={signOut}
      />

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 lg:flex-row">
        <aside className="lg:w-80 lg:shrink-0">
          <AgentPanel summary={agent} escalations={escalated.length} />

          <div className="mt-5">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-kin-alert">
              Escalated to you
            </h2>
            <div className="space-y-2">
              {escalated.map((p) => (
                <QueueCard
                  key={p.id}
                  item={p}
                  active={p.id === selectedId}
                  onClick={() => {
                    setSelectedId(p.id);
                    setBundle(null);
                  }}
                />
              ))}
              {roster.length > 0 && escalated.length === 0 && (
                <div className="rounded-xl border border-kin-border bg-kin-panel p-4 text-center text-sm text-kin-calm">
                  Nothing escalated.
                </div>
              )}
              {roster.length === 0 && (
                <p className="text-sm text-kin-muted">Loading…</p>
              )}
            </div>
          </div>

          {handling.length > 0 && (
            <MutedGroup
              title={`Kin is handling · ${handling.length}`}
              tone="#fbbf24"
              items={handling}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                setBundle(null);
              }}
            />
          )}

          {onTrack.length > 0 && (
            <MutedGroup
              title={`On track · ${onTrack.length}`}
              tone="#4ade80"
              items={onTrack}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                setBundle(null);
              }}
            />
          )}
        </aside>

        <main className="min-w-0 flex-1 space-y-6">
          {bundle ? (
            <>
              <PatientHeader patient={bundle.patient} signals={bundle.signals} />

              <section>
                <SectionTitle>
                  Needs your decision
                  {openAlerts.length > 0 && (
                    <span className="ml-2 rounded-full bg-kin-alert/20 px-2 py-0.5 text-xs text-kin-alert">
                      {openAlerts.length}
                    </span>
                  )}
                </SectionTitle>
                {openAlerts.length === 0 ? (
                  <div className="rounded-xl border border-kin-border bg-kin-panel p-6 text-center">
                    <p className="text-sm text-kin-calm">
                      Kin is handling this patient — nothing needs you.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {openAlerts.map((a) => (
                      <AlertCard key={a.id} alert={a} onChange={refresh} />
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-kin-border bg-kin-panel p-5">
                <SectionTitle>Kin&apos;s actions for this patient</SectionTitle>
                <AgentLog actions={bundle.actions} />
              </section>

              <section className="rounded-xl border border-kin-border bg-kin-panel p-5">
                <SectionTitle>Engagement rhythm · last 30 days</SectionTitle>
                <RhythmSparkline
                  events={bundle.events}
                  signals={bundle.signals}
                />
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-kin-muted">
                  <Legend color={TRIAGE_COLOR.on_track} label="On track" />
                  <Legend color={TRIAGE_COLOR.nudge} label="Nudge" />
                  <Legend color={TRIAGE_COLOR.red_flag} label="Red flag" />
                  <Legend color="#3a4150" label="No check-in" dot />
                </div>
              </section>

              <MedicinesPanel
                patientId={bundle.patient.id}
                medicines={bundle.patient.medicines}
                onChange={refresh}
              />

              <div className="grid gap-6 lg:grid-cols-2">
                <section className="rounded-xl border border-kin-border bg-kin-panel p-5">
                  <SectionTitle>Check-in history</SectionTitle>
                  <Timeline signals={bundle.signals} />
                </section>
                <div className="space-y-6">
                  <WeeklyDigest
                    signals={bundle.signals}
                    alerts={bundle.alerts}
                  />
                  {pastAlerts.length > 0 && (
                    <section className="rounded-xl border border-kin-border bg-kin-panel p-5">
                      <SectionTitle>Resolved</SectionTitle>
                      <div className="space-y-3">
                        {pastAlerts.slice(0, 4).map((a) => (
                          <AlertCard key={a.id} alert={a} onChange={refresh} />
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              </div>

              <DemoControls roster={roster} onAfter={refresh} />
            </>
          ) : (
            <div className="rounded-xl border border-kin-border bg-kin-panel p-10 text-center text-kin-muted">
              Loading…
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Header({
  backend,
  clinician,
  escalated,
  total,
  onSignOut,
}: {
  backend: string;
  clinician: string;
  escalated: number;
  total: number;
  onSignOut: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-kin-border bg-kin-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-lg font-bold tracking-tight">
            Kin
          </Link>
          <span className="hidden text-xs text-kin-muted sm:inline">
            {escalated} of {total} need you · Kin has the rest
          </span>
        </div>
        <div className="flex items-center gap-3">
          {backend && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide"
              style={{
                background: backend === "supabase" ? "#4ade8022" : "#7c9cff22",
                color: backend === "supabase" ? "#4ade80" : "#7c9cff",
              }}
            >
              {backend === "supabase" ? "live" : "demo data"}
            </span>
          )}
          {clinician && (
            <span className="hidden text-sm text-kin-muted sm:inline">
              {clinician}
            </span>
          )}
          <button
            onClick={onSignOut}
            className="rounded-lg border border-kin-border px-3 py-1.5 text-sm text-kin-text hover:bg-kin-panel"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

function MutedGroup({
  title,
  tone,
  items,
  selectedId,
  onSelect,
}: {
  title: string;
  tone: string;
  items: RosterItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="h-px flex-1 bg-kin-border" />
        <span className="text-[11px] text-kin-muted">{title}</span>
        <span className="h-px flex-1 bg-kin-border" />
      </div>
      <div className="space-y-1">
        {items.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
              p.id === selectedId
                ? "bg-kin-panel2 text-kin-text"
                : "text-kin-muted hover:bg-kin-panel"
            }`}
          >
            <span className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: tone }}
              />
              {p.name}
            </span>
            <span className="text-[11px] text-kin-muted">
              {p.last_checkin ? timeAgo(p.last_checkin) : "—"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function QueueCard({
  item,
  active,
  onClick,
}: {
  item: RosterItem;
  active: boolean;
  onClick: () => void;
}) {
  const color =
    item.top_severity >= 5
      ? "#f87171"
      : item.top_severity >= 4
        ? "#fb923c"
        : "#fbbf24";
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl border p-3 text-left transition ${
        active
          ? "border-kin-accent bg-kin-panel2"
          : "border-kin-border bg-kin-panel hover:bg-kin-panel2"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-kin-text">{item.name}</span>
        <span className="kin-pulse text-xs" style={{ color }}>
          {item.top_kind ? KIND_ICON[item.top_kind] : "●"}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-xs font-medium" style={{ color }}>
          {item.top_kind ? KIND_LABEL[item.top_kind] : "needs action"}
        </span>
        <span className="text-[11px] text-kin-muted">
          · sev {item.top_severity}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-kin-muted">
        <span>{item.patient_ref}</span>
        <span>
          {item.last_checkin
            ? `last ${timeAgo(item.last_checkin)}`
            : "no check-ins"}
        </span>
      </div>
    </button>
  );
}

function PatientHeader({
  patient,
  signals,
}: {
  patient: Patient;
  signals: Signal[];
}) {
  const last = signals[signals.length - 1];
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-kin-text">
          {patient.name}{" "}
          <span className="text-base font-normal text-kin-muted">
            · {patient.patient_ref}
          </span>
        </h1>
        <div className="mt-1.5 flex flex-wrap gap-2 text-sm text-kin-muted">
          {patient.conditions.map((c) => (
            <span
              key={c}
              className="rounded-full bg-kin-panel px-2 py-0.5 text-xs"
            >
              {c}
            </span>
          ))}
          <span className="rounded-full bg-kin-panel px-2 py-0.5 text-xs uppercase">
            {patient.language}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-full bg-kin-panel px-3 py-1.5">
        <span className="h-2 w-2 rounded-full bg-kin-calm kin-pulse" />
        <span className="text-xs text-kin-muted">
          {last
            ? `Last check-in ${timeAgo(last.ts)}`
            : "Awaiting first check-in"}
        </span>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center text-sm font-semibold text-kin-text">
      {children}
    </h3>
  );
}

function Legend({
  color,
  label,
  dot,
}: {
  color: string;
  label: string;
  dot?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={dot ? "h-1.5 w-1.5 rounded-full" : "h-2.5 w-2 rounded-sm"}
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
