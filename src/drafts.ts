/**
 * Draft reply templates for the demo. Short, generic, and clearly templates —
 * the user sends every real reply herself. Rejects, read-later, and promos
 * get no draft: nothing to reply to.
 */
import type { Label } from "./rules.js";

const TEMPLATES: Partial<Record<Label, string>> = {
  "recruiter/new":
    "Hi, thanks for reaching out — the role sounds interesting. Could you share the team, location, and salary range? Happy to chat if there's a fit. — Hari",
  "recruiter/replied":
    "Hi, thanks for getting back to me — Thursday works for a quick chat. Let me know a time. — Hari",
  interview:
    "Hi, thanks for the invite — I'd love to move ahead. Please let me know the next steps and times that work. — Hari",
  "offer-process":
    "Hi, thank you for the offer — I'm excited about it. Could you share the full details so I can review? — Hari",
  application:
    "Hi, thanks for confirming receipt — I appreciate the update. Looking forward to hearing about next steps. — Hari",
};

export function draftFor(label: Label | "none"): string | null {
  if (label === "none") return null;
  return TEMPLATES[label] ?? null;
}
