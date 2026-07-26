// Shared by the browser voice client and server-side ingestion. An explicit
// request for a person to review or contact the patient is a handoff request
// even when the symptom itself is not a clinical red flag.
export function isCareTeamRequest(transcript: string): boolean {
  const text = transcript.trim().toLowerCase();
  if (!text) return false;

  const person =
    /\b(gp|doctor|nurse|clinician|care team|medical team|healthcare team)\b/;
  const request =
    /\b(connect|contact|call|tell|notify|message|send|speak|talk|reach|book|appointment|pass (?:this|it|that) (?:on|along)|share (?:this|it|that))\b/;
  const directRequest =
    /\b(can|could|would|will|please|want|need|like)\b[\s\S]{0,80}\b(connect|contact|call|tell|notify|message|send|speak|talk|reach|book|pass|share)\b/;

  return person.test(text) && (request.test(text) || directRequest.test(text));
}
