/**
 * Safety screen: the boundary between local processing and any LLM call.
 *
 * Rules are local — they can look at anything. The LLM is external, so
 * NOTHING sensitive may cross this boundary:
 *  - Blocked senders: banks, government/immigration, employer, payroll.
 *  - Sensitive content: SSN, USCIS case numbers, passport, date of birth,
 *    bank account references.
 *  - Attachments: never fetched, never sent. The classifier only ever sees
 *    subject + trimmed body (see toLLMInput).
 *
 * What sensitive information can a job-search inbox actually hold? Offer
 * letters carry compensation. Background-check forms carry Social Security
 * numbers and dates of birth. Immigration mail carries USCIS case numbers.
 * Payroll and bank mail carry account details. A triager that sends mail to
 * an LLM ships all of that to a third-party API. This screen exists so the
 * tool can triage recruiter mail, the useful part, while that personal
 * information never leaves the machine.
 *
 * Second boundary layer: which mail may reach an LLM at all. Generic
 * template mail (application confirmations, form rejections, promos,
 * newsletters) is bulk mail: it reveals nothing specific about the
 * seeker's dealings, so it may be classified by a model and archived.
 * Specific mail (interviews, offers, recruiter threads) carries the
 * seeker's actual dealings: company names, roles, timing, people. That
 * mail never leaves the machine: rules-only, label-only, zero API calls.
 * Unknown mail ("none") also stays local: an unknown email might contain
 * anything, so it is never sent to find out.
 *
 * Deliberately NOT blocked: compensation/salary words. Offer mail routinely
 * mentions compensation, and triaging recruiter mail (including offers) is
 * the job this tool is for. The boundary is the mail TYPE (bank / gov /
 * employer / identity), not every sensitive word. If you want compensation
 * blocked too, add it to SENSITIVE_PATTERNS — one line.
 *
 * Substring matching here is demo-simple; production hardens this to
 * explicit domain allow/block lists.
 *
 * Training leakage: code cannot enforce a provider's training policy, so
 * the guarantees are structural — (1) this screen keeps sensitive content
 * out of every payload, (2) payloads are minimized, (3) the demo sends
 * nothing real (synthetic only), (4) for real mail: never fine-tune on user
 * mail, the golden set is eval-only, and the provider's current API data
 * terms must exclude training before any real mail is sent.
 */
import type { Email, Label } from "./rules.js";

export interface ScreenResult {
  allowed: boolean;
  reason: string;
}

const BLOCKED_SENDER =
  /uscis|immigration|\.gov\b|bank|chase|wellsfargo|citi|payroll|insightglobal/i;

const SENSITIVE_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: "uscis-case-number", pattern: /\bIOE\d{10}\b/i },
  { name: "passport", pattern: /passport/i },
  { name: "date-of-birth", pattern: /date of birth/i },
  { name: "bank-account", pattern: /account\s+(ending|number)/i },
];

/**
 * Which mail may reach an LLM at all (second boundary layer, see header).
 * Generic template mail may be classified and archived; specific mail and
 * unknown mail never leave the machine.
 */
export const LLM_ELIGIBLE: Label[] = [
  "application",
  "rejects",
  "promos",
  "read-later",
];

export const LOCAL_ONLY: Label[] = [
  "interview",
  "offer-process",
  "recruiter/new",
  "recruiter/replied",
];

export function screenForLLM(email: Email): ScreenResult {
  if (BLOCKED_SENDER.test(email.from)) {
    return { allowed: false, reason: `blocked sender (${email.from})` };
  }
  const haystack = `${email.subject} ${email.body}`;
  for (const entry of SENSITIVE_PATTERNS) {
    if (entry.pattern.test(haystack)) {
      return { allowed: false, reason: `sensitive pattern: ${entry.name}` };
    }
  }
  return { allowed: true, reason: "ok" };
}

/**
 * Minimized LLM input. Wired into the Llama module tomorrow; the shape is
 * fixed now so the boundary is visible: subject + first 1000 chars of body.
 * No attachments, no full threads, no extra headers.
 */
export function toLLMInput(email: Email): {
  from: string;
  subject: string;
  body: string;
} {
  return {
    from: email.from,
    subject: email.subject,
    body: email.body.slice(0, 1000),
  };
}
