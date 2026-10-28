/**
 * Rules baseline for the hackathon demo.
 *
 * Same 8-label taxonomy as Relay, written fresh for this repo.
 * Rules run in precedence order (offer-process first, promos last) and the
 * first match wins. Anything with no match comes back as "none" at 0.4 —
 * the gate's "stays in inbox" case. The Llama classifier lands tomorrow
 * and the gate will require rules + LLM agreement at >= 0.85.
 */

export const LABELS = [
  "interview",
  "offer-process",
  "recruiter/new",
  "recruiter/replied",
  "rejects",
  "application",
  "read-later",
  "promos",
] as const;

export type Label = (typeof LABELS)[number];

export interface Email {
  id: string;
  from: string;
  subject: string;
  body: string;
  /** Ground-truth label for the golden set ("blocked" = safety must refuse it). */
  expected?: string;
}

export interface RuleResult {
  label: Label | "none";
  confidence: number;
  rule: string;
}

interface Rule {
  label: Label;
  confidence: number;
  name: string;
  test: (email: Email) => boolean;
}

function text(email: Email): string {
  return `${email.subject} ${email.body}`;
}

const RULES: Rule[] = [
  {
    label: "offer-process",
    confidence: 0.9,
    name: "offer-letter",
    test: (e) =>
      /offer letter|pleased to offer|compensation package|background check/i.test(
        text(e),
      ),
  },
  {
    label: "interview",
    confidence: 0.9,
    name: "interview-invite",
    test: (e) =>
      /interview invitation|interview invite|phone screen|technical round|onsite|schedule an interview/i.test(
        text(e),
      ),
  },
  {
    label: "rejects",
    confidence: 0.9,
    name: "rejection",
    test: (e) =>
      /unfortunately|won't be moving forward|not moving forward|decided to move forward with other/i.test(
        text(e),
      ),
  },
  {
    label: "recruiter/replied",
    confidence: 0.85,
    name: "re-thread",
    test: (e) =>
      /^re:/i.test(e.subject) &&
      /talent@|recruiting@|careers@/i.test(e.from),
  },
  {
    label: "recruiter/new",
    confidence: 0.85,
    name: "recruiter-outreach",
    test: (e) =>
      /came across your profile/i.test(e.body) ||
      /talent@|recruiting@|careers@/i.test(e.from),
  },
  {
    label: "application",
    confidence: 0.9,
    name: "application-receipt",
    test: (e) =>
      /application received|received your application|application status/i.test(
        text(e),
      ),
  },
  {
    label: "read-later",
    confidence: 0.7,
    name: "newsletter",
    test: (e) => /newsletter|digest|webinar/i.test(text(e)),
  },
  {
    label: "promos",
    confidence: 0.7,
    name: "promo",
    test: (e) => /% off|discount|unsubscribe/i.test(text(e)),
  },
];

export function classifyByRules(email: Email): RuleResult {
  for (const rule of RULES) {
    if (rule.test(email)) {
      return { label: rule.label, confidence: rule.confidence, rule: rule.name };
    }
  }
  return { label: "none", confidence: 0.4, rule: "no-match" };
}
