# Kin

**Listens when they talk. Notices when they don't.**

A voice-first health companion for people living with chronic conditions, with
an **AI care coordinator** that runs the caseload and escalates to a clinician
only when a human decision is genuinely required. Patients talk to Kin whenever
they like — logging medicines, symptoms, and how they feel, in their own
language. Kin learns each patient's rhythm, chases the ones who go quiet, and
nudges the ones who slip — by itself.

> A clinician can't call 200 patients a week. Kin works the whole list and
> hands over the 2 that need a doctor.

Built for the Consumer Health Hackathon by Juno × Anthropic.

---

## The loop

```
patient talks to the voice agent (ElevenLabs)
        │
        ▼  transcript
   Claude triage  ──►  structured signals (adherence, symptoms, mood, red flags)
        │
        ▼
   Supabase  ──►  anomaly rules  ──►  Kin decides: handle or escalate
        │                                    │
        │                                    ├─► Kin nudges / calls back  (autonomous)
        ▼  realtime / poll                   └─► alert
   Clinician dashboard (Vercel)  ──►  clinician decides  ──►  outcome logged  ──►  baseline updates
```

```bash
npm install
npm run dev        # → http://localhost:3000
```

## Kin is the coordinator

Kin runs the caseload itself and escalates only what needs a clinical decision:

| Situation | Who acts |
| --- | --- |
| Missed dose, low mood, minor symptom | **Kin** nudges the patient, re-checks tomorrow |
| Gone quiet | **Kin** calls the patient back (up to 2 attempts) |
| Still unreachable after the ladder | **Clinician** — escalated |
| Red flag, or medication stopped | **Clinician** — escalated, and Kin does *not* advise the patient |

Every decision is written to `agent_actions` with Kin's reasoning, so the
dashboard doubles as an audit trail. The clinician view is therefore mostly
empty by design — it shows what Kin handled, and the short list that needs a
human.
