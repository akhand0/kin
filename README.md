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

## Runs offline out of the box

Everything works with **zero API keys** — `npm install && npm run dev` boots the
full loop against an in-memory seeded store with a keyword-based triage
fallback. Add keys to switch each layer to the real backend, one at a time. No
key is required for the demo, which is deliberate: the venue wifi is not a judge.

```bash
npm install
npm run dev        # → http://localhost:3000
```

- **`/login`** — patient & clinician sign-in (SSO + username/password).
- **`/`** — the pitch.
- **`/dashboard`** — the clinician view (10 seeded patients): what Kin did in
  the last 24h, the short **escalated to you** list, Kin's per-patient audit
  log, 30-day rhythm, check-in history, and **Demo controls**.
- **`/talk`** — the patient view, scoped to the signed-in patient. Voice-first:
  a tap-to-talk orb using the browser's Speech APIs (speech-to-text in the
  patient's language + spoken replies) that works with no keys, upgrading to the
  ElevenLabs Conversational AI widget when `NEXT_PUBLIC_ELEVENLABS_AGENT_ID` is
  set. Text is always there as a fallback.

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

### Demo controls (bottom of the dashboard)

| Button | What it does |
| --- | --- |
| **▶ Live check-in · Priya Sharma (Hindi)** | Posts the scripted transcript → Claude/heuristic triage → a **severity-5 red flag jumps to the top of the queue**. The money shot. |
| **📞 Kin calls Miguel Torres (unanswered)** | Another rung of Kin's push ladder; once exhausted it escalates as `unreachable`. |
| **🔁 Run Kin's sweep** | Kin reviews the whole caseload — reports how many it handled vs escalated. |
| Free-text box | Type a check-in in **any language** for any patient — great for judges to try. |

## Going live (optional)

Copy `.env.example` → `.env.local` and fill in what you have. Each layer is
independent.

### Claude (triage intelligence)

```
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-5
```

Without it, triage uses a multilingual keyword heuristic (`lib/triage.ts`). The
system prompt is `TRIAGE_SYSTEM_PROMPT` in the same file — Kin **never** gives
medical advice; it only classifies and escalates to a human.

### Supabase (data + realtime)

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

1. Run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   in the Supabase SQL editor.
2. `npm run seed` — loads the same 30-day demo data into Postgres.
3. Restart; the dashboard header will read **live** instead of **demo data**.

### ElevenLabs (patient voice)

```
NEXT_PUBLIC_ELEVENLABS_AGENT_ID=...
```

Point the agent's **post-call webhook** at `/api/webhook/elevenlabs` with a
bearer token equal to `KIN_CRON_SECRET`, and pass `patient_id` as a dynamic
variable when the call starts. The `/talk` page embeds the Conversational AI
widget when this id is set.

## Anomaly rules (MVP — no ML)

Defined in [`lib/anomaly.ts`](lib/anomaly.ts):

- **quiet_anomaly** — no pull event for longer than `2 × rolling median gap`
  (minimum 48h).
- **loud_anomaly** — triage = `red_flag`, medicines missed twice in a row, or
  `med_adherence = stopped`.
- **unreachable** — two push attempts unanswered within 24h.
- **Hard red flags** (chest pain, severe breathlessness, fainting, a fall,
  confusion, uncontrolled bleeding) escalate immediately.

## Data model

`patients · engagement_events · signals · alerts · agent_actions` — see the
migration. Signals are the structured output of triage; `agent_actions` is Kin's
audit trail; alerts are the subset that reached a clinician.


## Positioning

- Assistants are **pull**; Kin closes the loop — it notices when a patient
  *stops* asking.
- **Not a medical device by design**: Kin coordinates, but never diagnoses,
  advises, or reassures about symptoms. Every *clinical* decision is a human's.
- **Auditable autonomy**: each autonomous action is logged with Kin's reasoning,
  so a clinician can review what was handled without them.
- **Privacy by architecture**: patients sign in and see only their own record;
  clinicians see triaged summaries, not raw transcripts, unless the patient
  opts in.
- **Buyer**: clinics and care agencies that already fund adherence and follow-up
  programmes — Kin is the follow-up layer their coordinators work from.

## Scope cuts (say them proudly)

No telephony, no WhatsApp, no wearables, no ML. A rolling-median anomaly rule
plus Claude classification is the entire brain. Everything cut is a roadmap
slide, not a missing feature.
