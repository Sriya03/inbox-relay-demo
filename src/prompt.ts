/**
 * The fixed classification prompt. Fixed means the same prompt is used for
 * every candidate model in the benchmark, so the benchmark measures the
 * model, not the prompt. The label definitions below are the same taxonomy
 * the rules use (see LABELS in rules.ts). The model must pick one of them
 * and say how confident it is. Low confidence (below 0.6) is the honest
 * answer when unsure: the gate keeps low-confidence mail in the inbox
 * instead of archiving it.
 */
import { LABELS, type Email } from "./rules.js";
import { toLLMInput } from "./safety.js";

const DEFINITIONS: Record<string, string> = {
  interview:
    "invites you to, schedules, or confirms an interview, screen, or round",
  "offer-process":
    "offer letter, compensation, background check, or onboarding steps",
  "recruiter/new":
    "first outreach from a recruiter about a role you have not discussed before",
  "recruiter/replied":
    "continues an existing recruiter conversation (a reply) without inviting you to an interview",
  rejects:
    "says you were not selected, or they are moving forward with other candidates",
  application:
    "confirms your application was received, with no decision yet",
  "read-later":
    "a newsletter, article, or roundup worth reading later, not a job pitch",
  promos: "marketing, discounts, course sales, or bulk offers",
};

export function buildClassificationPrompt(email: Email): {
  system: string;
  user: string;
} {
  const input = toLLMInput(email);
  const labelLines = LABELS.map((l) => `- ${l}: ${DEFINITIONS[l]}`).join(
    "\n",
  );
  const system =
    `You classify job-search emails. Pick exactly one label from this list, nothing else:\n${labelLines}\n\n` +
    `Reply with JSON only: {"label": "<one label from the list>", "confidence": <number 0 to 1>}. ` +
    `Confidence is your estimated probability the label is right. If unsure, still pick the closest label and give a LOW confidence (below 0.6). Never invent a label outside the list.`;
  const user = `From: ${input.from}\nSubject: ${input.subject}\nBody: ${input.body}`;
  return { system, user };
}
