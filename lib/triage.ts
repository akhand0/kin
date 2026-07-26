// The intelligence layer. Turns a check-in transcript (any language) into a
// structured TriageResult. Provider order (each falls back to the next on
// failure), overridable with TRIAGE_PROVIDER:
//   OpenAI     when OPENAI_API_KEY is set    (model: OPENAI_MODEL)
//   Claude     when ANTHROPIC_API_KEY is set (model: CLAUDE_MODEL)
//   heuristic  multilingual keyword matching, so the demo runs offline
//
// Kin NEVER gives medical advice — it only classifies and escalates to a human.

import type { Patient, Signal, TriageResult } from "./types";

export const TRIAGE_SYSTEM_PROMPT = `You are Kin, a warm follow-up companion for people with chronic conditions. You do two things at once: (1) talk to the patient, and (2) classify the check-in for their care coordinator. You NEVER give medical advice, diagnosis, or reassurance about symptoms — you acknowledge, and escalate to a human.

Return ONLY valid JSON matching this shape:
{
  "language": "...",
  "med_adherence": "taken | missed | stopped | unclear | na",
  "symptoms": [{"name": "...", "severity": "mild|moderate|severe", "new": true}],
  "mood": "ok | low | distressed | unclear",
  "red_flags": ["..."],
  "triage": "on_track | nudge | red_flag",
  "summary_en": "2 sentences, plain English, written for a care coordinator",
  "suggested_action": "one concrete action for the care coordinator, or null",
  "reply": "your warm, natural reply TO THE PATIENT (1-2 sentences), in the SAME language they wrote in, addressing them by first name if known"
}

Rules:
- red_flag if: chest pain, severe breathlessness, fainting, a fall, confusion, uncontrolled bleeding, medicines stopped entirely, or a symptom clearly worsening versus recent context.
- nudge if: missed doses, ran out of medicine, missed an appointment, or mood is persistently low.
- Be conservative: if evidence is unclear, say "unclear". Never invent details that are not in the transcript.
- The "reply" is you speaking to the patient: kind and human, never clinical. Do NOT diagnose, advise on symptoms, or tell them what a symptom means. If anything is concerning, reassure them you've passed it to their care team so a person can check on them. For plain greetings or small talk, just reply warmly and invite them to share how they're doing.`;

export interface TriageInput {
  transcript: string;
  patient: Pick<Patient, "conditions" | "medicines" | "language" | "name">;
  recentSignals: Signal[]; // last 5, newest last
}

// ── Check-in substance guard ────────────────────────────────────
// A greeting or bit of small talk shouldn't be logged as a health check-in.
// Anything with a health hint is always kept; a message made only of
// greetings/pleasantries is treated as chit-chat and NOT recorded. When in
// doubt we keep it — better to over-log than drop a real concern.
const FILLER = new Set([
  "hello", "hi", "hey", "hiya", "yo", "hallo", "heya", "greetings", "howdy",
  "good", "morning", "afternoon", "evening", "night", "day",
  "how", "are", "you", "u", "r", "is", "it", "going", "today", "doing", "been", "hows",
  "i", "im", "am", "m", "me", "my", "myself", "just", "saying", "checking", "in",
  "fine", "ok", "okay", "okey", "alright", "well", "great", "nice", "cool", "grand",
  "thanks", "thank", "thankyou", "ty", "cheers", "bye", "goodbye", "seeya", "later",
  "yes", "yeah", "yep", "no", "nope", "nothing", "much", "kin", "there", "and", "the",
  "a", "to", "so", "whats", "up", "hope", "welcome",
  // common non-English greetings / pleasantries
  "namaste", "namaskar", "hola", "buenos", "dias", "buenas", "tardes", "noches",
  "gracias", "bonjour", "bonsoir", "salut", "merci", "ca", "va", "ola", "bom", "dia",
  "obrigado", "obrigada", "dzien", "dobry", "czesc", "witaj", "dziekuje",
]);

const HEALTH_HINTS = [
  "med", "dose", "tablet", "pill", "inhaler", "insulin", "injection", "prescription",
  "medicine", "medication", "pain", "ache", "dizzy", "faint", "fell", "fall", "breath",
  "chest", "cough", "fever", "temperature", "sugar", "glucose", "pressure", "bp",
  "swell", "swollen", "bleed", "blood", "sleep", "slept", "tired", "fatigue", "weak",
  "nausea", "vomit", "sick", "symptom", "hospital", "doctor", "gp", "appointment",
  "missed", "forgot", "skip", "stopped", "ran out", "worse", "better", "hurt", "sore",
  "cramp", "sad", "depress", "anxious", "worried", "low", "stress", "lonely", "confused",
  "walk", "eat", "appetite", "rash", "itch", "numb",
  // hindi (romanized)
  "dawai", "dawa", "goli", "chakkar", "dard", "seene", "saans", "bukhar", "neend",
  "thakan", "behosh", "gir",
  // spanish / french / portuguese / polish
  "dolor", "mareo", "pastilla", "medicina", "fiebre", "cansad", "pecho", "aire",
  "azucar", "medicamento", "douleur", "comprim", "medicament", "vertige", "poitrine",
  "souffle", "fievre", "dor", "remedio", "tontura", "febre", "lek", "tabletk", "bol",
];

// True when the message carries real health content worth recording.
export function isSubstantiveCheckin(transcript: string): boolean {
  const raw = transcript.trim().toLowerCase();
  if (raw.length < 2) return false;
  if (HEALTH_HINTS.some((h) => raw.includes(h))) return true;
  // Drop punctuation and apostrophes so "i'm" → "im", "can't" → "can t".
  const words = raw
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return false;
  // Only greetings/pleasantries → chit-chat, don't log it.
  return !words.every((w) => FILLER.has(w));
}

export async function triage(input: TriageInput): Promise<TriageResult> {
  // Default order prefers OpenAI when its key is present; TRIAGE_PROVIDER can
  // pin a single provider (e.g. "anthropic" or "openai").
  const forced = (process.env.TRIAGE_PROVIDER || "").toLowerCase();
  const order: ("openai" | "anthropic")[] =
    forced === "anthropic"
      ? ["anthropic", "openai"]
      : forced === "openai"
        ? ["openai"]
        : ["openai", "anthropic"];

  for (const provider of order) {
    if (provider === "openai" && process.env.OPENAI_API_KEY) {
      try {
        return await triageWithOpenAI(input);
      } catch (err) {
        console.error("[triage] OpenAI failed, falling back:", err);
      }
    }
    if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
      try {
        return await triageWithClaude(input);
      } catch (err) {
        console.error("[triage] Claude failed, falling back:", err);
      }
    }
  }
  return heuristicTriage(input);
}

// The transcript + structured patient context, shared by both LLM providers.
function buildUserContent(input: TriageInput): string {
  const context = {
    patient_first_name: input.patient.name?.split(" ")[0],
    conditions: input.patient.conditions,
    medicines: input.patient.medicines,
    last_5_signals: input.recentSignals.map((s) => ({
      ts: s.ts,
      med_adherence: s.med_adherence,
      symptoms: s.symptoms,
      mood: s.mood,
      triage: s.triage,
    })),
  };
  return `Patient context:\n${JSON.stringify(
    context,
    null,
    2,
  )}\n\nCheck-in transcript:\n"""${input.transcript}"""`;
}

async function triageWithOpenAI(input: TriageInput): Promise<TriageResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.6-terra",
      messages: [
        { role: "system", content: TRIAGE_SYSTEM_PROMPT },
        { role: "user", content: buildUserContent(input) },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  return parseTriageJson(text, input);
}

async function triageWithClaude(input: TriageInput): Promise<TriageResult> {
  // Imported lazily so the app builds/runs without the dependency resolved.
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const msg = await client.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-sonnet-5",
    max_tokens: 1024,
    system: TRIAGE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserContent(input) }],
  });

  const text = msg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");

  return parseTriageJson(text, input);
}

function parseTriageJson(text: string, input: TriageInput): TriageResult {
  // Tolerate code fences or stray prose around the JSON object.
  const match = text.match(/\{[\s\S]*\}/);
  const raw = match ? match[0] : text;
  const parsed = JSON.parse(raw) as Partial<TriageResult>;
  return normalizeTriage(parsed, input);
}

function normalizeTriage(
  p: Partial<TriageResult>,
  input: TriageInput,
): TriageResult {
  return {
    language: p.language || input.patient.language || "en",
    med_adherence: p.med_adherence || "unclear",
    symptoms: Array.isArray(p.symptoms) ? p.symptoms : [],
    mood: p.mood || "unclear",
    red_flags: Array.isArray(p.red_flags) ? p.red_flags : [],
    triage: p.triage || "on_track",
    summary_en: p.summary_en || "Check-in received.",
    suggested_action: p.suggested_action ?? null,
    reply: p.reply || undefined,
  };
}

// ── Offline heuristic ───────────────────────────────────────────
// Multilingual keyword matching (en / hi-romanized / es) so the scripted
// demo works with no API key. Deliberately conservative.

const has = (t: string, words: string[]) =>
  words.some((w) => t.includes(w));

const HARD_RED_FLAGS: [string, string[]][] = [
  ["chest pain", ["chest pain", "seene mein dard", "seene me dard", "dolor en el pecho", "dolor de pecho"]],
  ["severe breathlessness", ["can't breathe", "cannot breathe", "short of breath", "breathless", "saans nahi", "saans phool", "sin aire", "falta de aire", "ahogo"]],
  ["fainting", ["fainted", "faint", "behosh", "desmay", "me desmayé"]],
  ["a fall", ["i fell", "had a fall", "gir gaya", "gir gayi", "me caí", "caída"]],
  ["confusion", ["confused", "confusion", "bhram", "confundid"]],
  ["uncontrolled bleeding", ["bleeding", "khoon beh", "sangrado", "sangre"]],
];

const CONCERNING_SYMPTOMS: [string, string[]][] = [
  ["dizziness", ["dizzy", "dizziness", "chakkar", "mareo", "mareado", "mareada"]],
  ["palpitations", ["palpitations", "dhadkan", "palpitaciones"]],
  ["swelling", ["swelling", "sujan", "hinchazón", "hinchado"]],
  ["blurred vision", ["blurred vision", "dhundhla", "visión borrosa"]],
];

export function heuristicTriage(input: TriageInput): TriageResult {
  const t = input.transcript.toLowerCase();
  const lang = input.patient.language || "en";
  const who = input.patient.name || "Patient";
  const isCardiac = input.patient.conditions.some((c) =>
    /hypertension|blood pressure|heart|cardiac|diabetes/i.test(c),
  );

  // Medication adherence.
  let med_adherence: TriageResult["med_adherence"] = "na";
  const stopped = has(t, ["stopped", "band kar di", "band kar diya", "dejé de tomar", "quit taking"]);
  const missed = has(t, ["forgot", "missed", "didn't take", "did not take", "skip", "bhool", "nahi li", "olvidé", "no tomé", "no me tomé"]);
  const tookThem = has(t, ["took", "taken", "le li", "dawai li", "tomé mis", "tomé las"]);
  if (stopped) med_adherence = "stopped";
  else if (missed) med_adherence = "missed";
  else if (tookThem) med_adherence = "taken";

  const repeated = has(t, ["twice", "two times", "do baar", "dos veces", "again"]);

  // Symptoms.
  const symptoms: TriageResult["symptoms"] = [];
  const redFlags: string[] = [];
  for (const [name, words] of HARD_RED_FLAGS) {
    if (has(t, words)) {
      symptoms.push({ name, severity: "severe", new: true });
      redFlags.push(name);
    }
  }
  let hasConcerning = false;
  for (const [name, words] of CONCERNING_SYMPTOMS) {
    if (has(t, words)) {
      symptoms.push({ name, severity: "moderate", new: true });
      hasConcerning = true;
    }
  }
  if (has(t, ["tired", "fatigue", "thakan", "cansad"])) {
    symptoms.push({ name: "fatigue", severity: "mild", new: false });
  }

  // Mood.
  let mood: TriageResult["mood"] = "ok";
  if (has(t, ["sad", "depress", "hopeless", "udaas", "akela", "triste", "deprimid", "solo", "sola"])) {
    mood = "low";
  }
  if (has(t, ["scared", "panic", "can't cope", "distress", "ghabra", "asustad"])) {
    mood = "distressed";
  }

  // Triage decision.
  let triageLevel: TriageResult["triage"] = "on_track";
  let suggested: string | null = null;

  if (redFlags.length > 0 || med_adherence === "stopped") {
    triageLevel = "red_flag";
  } else if (hasConcerning && med_adherence === "missed" && isCardiac) {
    // e.g. dizziness + missed BP medication — escalate for a human to review.
    triageLevel = "red_flag";
    redFlags.push("concerning symptom with missed medication");
  } else if (med_adherence === "missed" || mood === "low" || mood === "distressed" || hasConcerning) {
    triageLevel = "nudge";
  }

  // Summary + action, plain English for a care coordinator.
  const parts: string[] = [];
  if (med_adherence === "stopped") parts.push(`${who} reports stopping medication`);
  else if (med_adherence === "missed") parts.push(`${who} missed medication${repeated ? " (twice)" : ""}`);
  else if (med_adherence === "taken") parts.push(`${who} took their medication`);
  if (symptoms.length) parts.push(`reported ${symptoms.map((s) => s.name).join(", ")}`);
  if (mood !== "ok") parts.push(`mood ${mood}`);
  const summary_en =
    parts.length > 0
      ? `${parts.join("; ")}. ${triageLevel === "red_flag" ? "Flagged for clinical review." : triageLevel === "nudge" ? "Follow-up recommended." : ""}`.trim()
      : `${who} checked in — no new concerns.`;

  if (triageLevel === "red_flag") {
    suggested = redFlags.some((f) => HARD_RED_FLAGS.map((h) => h[0]).includes(f))
      ? `Contact patient now; escalate for urgent clinical assessment.`
      : `Call patient today; consider booking a GP review.`;
  } else if (triageLevel === "nudge") {
    suggested = med_adherence === "missed" ? `Reinforce medication routine at next contact.` : `Add to follow-up list.`;
  }

  // Offline fallback reply (used only when no LLM is configured).
  const first = who.split(" ")[0];
  const reply =
    triageLevel === "red_flag"
      ? `Thank you for telling me — that sounds important. I'm not a doctor so I won't guess, but I've passed this to your care team so someone can check on you. You're not alone, ${first}.`
      : triageLevel === "nudge"
        ? `Thanks for sharing that with me, ${first}. I've made a note and I'll check in again tomorrow. Is there anything you'd like me to remind you about?`
        : `Lovely to hear from you, ${first}. I've noted today's check-in — take care, and talk soon.`;

  return {
    language: lang,
    med_adherence,
    symptoms,
    mood,
    red_flags: redFlags,
    triage: triageLevel,
    summary_en,
    suggested_action: suggested,
    reply,
  };
}
