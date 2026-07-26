"use client";

import { useCallback, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { isCareTeamRequest } from "@/lib/care-request";
import { VoiceOrb, type Mode } from "./VoiceOrb";

// Strip ElevenLabs audio/emotion tags like "[happy]" from the visible text.
const stripTags = (s: string) =>
  s.replace(/\[[^\]]*\]/g, "").replace(/\s{2,}/g, " ").trim();

interface Turn {
  who: "patient" | "kin";
  text: string;
}

// Turns the patient's own record into a concise brief the agent can read from.
// Deliberately neutral — profile, adherence counts, and the facts the patient
// reported. No triage verdicts or clinical notes (those are for the care team).
function summariseRecord(b: {
  patient?: {
    name?: string;
    conditions?: string[];
    medicines?: string[];
  };
  signals?: {
    ts: string;
    med_adherence?: string;
    symptoms?: { name: string }[];
  }[];
  events?: { direction?: string; ts: string }[];
}): string {
  const p = b.patient ?? {};
  const signals = b.signals ?? [];
  const events = b.events ?? [];
  const MONTH = 30 * 24 * 3600 * 1000;

  const monthCount = events.filter(
    (e) => e.direction === "pull" && Date.now() - new Date(e.ts).getTime() <= MONTH,
  ).length;
  const taken = signals.filter((s) => s.med_adherence === "taken").length;
  const missed = signals.filter(
    (s) => s.med_adherence === "missed" || s.med_adherence === "stopped",
  ).length;

  const label = (a?: string) =>
    a === "taken"
      ? "medicines taken"
      : a === "missed"
        ? "dose missed"
        : a === "stopped"
          ? "medicines paused"
          : "checked in";

  const recent = [...signals]
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, 10)
    .map((s) => {
      const d = new Date(s.ts).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      });
      const sym = (s.symptoms ?? []).map((x) => x.name).join(", ");
      return `- ${d}: ${label(s.med_adherence)}${sym ? `; reported ${sym}` : ""}`;
    })
    .join("\n");

  return [
    `Patient: ${p.name ?? "Unknown"}.`,
    `Conditions: ${(p.conditions ?? []).join(", ") || "none on record"}.`,
    `Current medicines: ${(p.medicines ?? []).join(", ") || "none on record"}.`,
    `Check-ins in the last 30 days: ${monthCount} (medicines taken on ${taken}, missed or paused on ${missed}).`,
    `Recent check-ins:`,
    recent || "(no check-ins yet)",
  ].join("\n");
}

// The patient context handed to the agent at session start, so it can answer
// questions about the patient's own data (meds, conditions, recent check-ins).
export type AgentVariables = Record<string, string>;

// Drives a real ElevenLabs Conversational AI session through Kin's own orb
// (instead of ElevenLabs' floating widget). The user's speech is captured
// client-side and sent through Kin's triage loop when the call ends, so the
// dashboard updates even without the post-call webhook.
export default function AgentVoice({
  agentId,
  variables,
  onCheckin,
}: {
  agentId: string;
  variables: AgentVariables;
  onCheckin?: () => void;
}) {
  return (
    <ConversationProvider>
      <AgentOrb
        agentId={agentId}
        variables={variables}
        onCheckin={onCheckin}
      />
    </ConversationProvider>
  );
}

function AgentOrb({
  agentId,
  variables,
  onCheckin,
}: {
  agentId: string;
  variables: AgentVariables;
  onCheckin?: () => void;
}) {
  const [hint, setHint] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const userBuf = useRef("");
  const handoffInFlight = useRef(false);
  const handoffSaved = useRef(false);
  const replaceNextAgentTurn = useRef(false);
  const contextualUpdateRef = useRef<(text: string) => void>(() => {});
  const setAgentVolumeRef = useRef<(volume: number) => void>(() => {});
  const setAgentMutedRef = useRef<(muted: boolean) => void>(() => {});
  // Keep the latest context in a ref so the session always uses it.
  const varsRef = useRef(variables);
  varsRef.current = variables;

  const {
    status,
    isSpeaking,
    startSession,
    endSession,
    sendContextualUpdate,
    setVolume,
    setMuted,
  } = useConversation({
    onConnect: () => {
      contextualUpdateRef.current(
        "Kin can send a structured health note to this patient's care-team dashboard. " +
          "If the patient asks to contact, connect with, or pass details to their GP, doctor, nurse, or care team, " +
          "do not say that you are unable to help. Reassure them that you will pass the details on. " +
          "Use the notify_care_team client tool when it is available; otherwise the complete note is sent automatically when the call ends.",
      );
    },
    onMessage: ({ message, source }) => {
      const text = stripTags(message);
      // When the patient explicitly asks for their GP/care team, the app owns
      // the next response. This prevents a dashboard-configured agent prompt
      // from incorrectly claiming that Kin cannot create the handoff.
      if (source !== "user" && replaceNextAgentTurn.current) {
        replaceNextAgentTurn.current = false;
        return;
      }
      if (text) {
        setTurns((turns) => [
          ...turns,
          { who: source === "user" ? "patient" : "kin", text },
        ]);
      }
      if (source === "user") {
        userBuf.current = `${userBuf.current} ${message}`.trim();
        if (isCareTeamRequest(text) && !handoffInFlight.current) {
          replaceNextAgentTurn.current = true;
          setAgentVolumeRef.current(0);
          setAgentMutedRef.current(true);
          void saveCareTeamHandoff();
        }
      }
    },
    onError: (message) => {
      setHint(
        /permission|microphone|denied/i.test(message)
          ? "Kin needs microphone access — allow it and tap again."
          : "Couldn't connect the call. Please try again.",
      );
    },
    // When the call ends, run everything the patient said through triage.
    onDisconnect: async () => {
      const transcript = userBuf.current.trim();
      userBuf.current = "";
      if (!transcript) return;
      try {
        await fetch("/api/checkin", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ transcript }),
        });
        onCheckin?.();
      } catch {
        /* best-effort — the webhook path also covers this */
      }
    },
  });
  contextualUpdateRef.current = sendContextualUpdate;
  setAgentVolumeRef.current = (volume) => setVolume({ volume });
  setAgentMutedRef.current = setMuted;

  async function saveCareTeamHandoff() {
    const transcript = userBuf.current.trim();
    if (!transcript || handoffInFlight.current) return;

    handoffInFlight.current = true;
    const successMessage =
      "I've sent a note with what you shared to your care team for review. " +
      "I can't promise when they'll respond, so please contact them directly if you need a quicker reply.";
    const failureMessage =
      "I couldn't save that note just now. Please contact your care team directly, especially if you need a quick response.";

    try {
      const response = await fetch("/api/checkin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transcript,
          requestCareTeam: true,
        }),
      });
      if (!response.ok) throw new Error("handoff_failed");

      handoffSaved.current = true;
      userBuf.current = "";
      setTurns((turns) => [...turns, { who: "kin", text: successMessage }]);
      contextualUpdateRef.current(
        "The care-team handoff has now been saved successfully. Do not say that you cannot contact the care team. " +
          "If this comes up again, confirm that the note is in their review queue without promising a response time.",
      );
      onCheckin?.();
      speakLocalConfirmation(successMessage);
    } catch {
      setTurns((turns) => [...turns, { who: "kin", text: failureMessage }]);
      speakLocalConfirmation(failureMessage);
    } finally {
      handoffInFlight.current = false;
    }
  }

  function speakLocalConfirmation(message: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setAgentVolumeRef.current(1);
      setAgentMutedRef.current(false);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = "en-GB";
    const restoreAgentAudio = () => {
      setAgentVolumeRef.current(1);
      setAgentMutedRef.current(false);
    };
    utterance.onend = restoreAgentAudio;
    utterance.onerror = restoreAgentAudio;
    window.speechSynthesis.speak(utterance);
  }

  const mode: Mode =
    status === "connecting"
      ? "thinking"
      : status === "connected"
        ? isSpeaking
          ? "speaking"
          : "listening"
        : "idle";

  const onTap = useCallback(() => {
    if (status === "connected" || status === "connecting") {
      endSession();
      return;
    }
    setHint(null);
    setTurns([]);
    handoffSaved.current = false;
    replaceNextAgentTurn.current = false;
    startSession({
      agentId,
      connectionType: "webrtc",
      dynamicVariables: varsRef.current,
      // Live DB access: the agent calls this mid-conversation to answer
      // questions about the patient's own record. Runs in the browser with the
      // patient's session, so it only ever reads their own data.
      clientTools: {
        get_patient_record: async () => {
          const id = varsRef.current.patient_record_id;
          if (!id) return "No patient record is available right now.";
          try {
            const res = await fetch(`/api/patients/${id}`, {
              cache: "no-store",
            });
            if (!res.ok) return "Sorry, I couldn't reach the record.";
            return summariseRecord(await res.json());
          } catch {
            return "Sorry, I couldn't reach the record right now.";
          }
        },
        // Kept for agents already configured to call this tool. The app also
        // detects care-team requests itself, so correct behaviour does not
        // depend on the model choosing to call it.
        notify_care_team: async (parameters: { details?: string }) => {
          if (handoffSaved.current) {
            return "The health note is already saved in the care team's decision queue.";
          }
          if (handoffInFlight.current) {
            return "A care-team handoff is already being sent.";
          }
          const details =
            typeof parameters?.details === "string"
              ? parameters.details.trim()
              : "";
          const transcript = [userBuf.current.trim(), details]
            .filter(Boolean)
            .join(" ");
          if (!transcript) {
            return "Ask the patient what they want the care team to know first.";
          }

          handoffInFlight.current = true;
          try {
            const response = await fetch("/api/checkin", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                transcript,
                requestCareTeam: true,
              }),
            });
            if (!response.ok) {
              return "The handoff could not be saved. Tell the patient to contact their care team directly.";
            }
            userBuf.current = "";
            onCheckin?.();
            return "The health note was saved to the care team's decision queue. Confirm this to the patient without promising when the team will respond.";
          } catch {
            return "The handoff could not be saved. Tell the patient to contact their care team directly.";
          } finally {
            handoffInFlight.current = false;
          }
        },
      },
    });
  }, [status, startSession, endSession, agentId]);

  const label =
    status === "connecting"
      ? "Connecting…"
      : status === "connected"
        ? isSpeaking
          ? "Kin is speaking… tap to end"
          : "Listening… tap to end"
        : "Tap to talk to Kin";

  return (
    <div className="mt-8 flex flex-col items-center">
      <VoiceOrb mode={mode} onTap={onTap} />
      <p className="mt-5 text-sm font-medium text-kin-muted">{label}</p>
      {hint && (
        <p className="mt-3 max-w-sm text-center text-sm text-kin-nudge">{hint}</p>
      )}

      {turns.length > 0 && (
        <div className="mt-8 w-full space-y-3">
          {turns.map((turn, index) => (
            <div
              key={index}
              className={`flex ${
                turn.who === "patient" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                  turn.who === "patient"
                    ? "bg-kin-accent text-black"
                    : "bg-kin-panel2 text-kin-text"
                }`}
              >
                {turn.text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
