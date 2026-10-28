/**
 * The agreement gate: the decision after rules and LLM have both spoken.
 *
 * Why a gate at all: rules are precise but brittle (they miss reworded
 * mail), and the LLM is flexible but overconfident (it can be wrong and
 * sure about it). Neither side alone is trusted. The gate takes the
 * intersection: only when both agree AND the LLM is confident does mail
 * become archive-eligible. Everything else stays, because a wrongly
 * archived interview invite is worse than an unarchived promo.
 *
 * Two hard rules on top of agreement:
 *  - Interview and offer-process mail is NEVER auto-archived (label-only).
 *    Those are the emails the seeker must see herself.
 *  - Rules label "none" means the system does not know: stays, always.
 *
 * decideLocal is the no-LLM decision, used for mail that never reaches a
 * model (specific mail and unknown mail): specific mail is labeled only,
 * unknown mail stays, generic mail without an LLM vote also stays (no
 * agreement, so no archive).
 *
 * In this demo, "archive" is a printed decision, not a real archive: there
 * is no real mail here to archive.
 */
import type { Label, RuleResult } from "./rules.js";
import type { LLMResult } from "./llama.js";
import { LOCAL_ONLY } from "./safety.js";

export type GateDecision = "archive" | "label-only" | "stays";

export interface GateOutcome {
  decision: GateDecision;
  reason: string;
}

const LABEL_ONLY: Label[] = ["interview", "offer-process"];

export function decideGate(
  rules: RuleResult,
  llm: LLMResult,
): GateOutcome {
  if (rules.label === "none") {
    return { decision: "stays", reason: "rules matched nothing" };
  }
  if (LABEL_ONLY.includes(rules.label)) {
    return {
      decision: "label-only",
      reason: `${rules.label} is never auto-archived`,
    };
  }
  if (rules.label !== llm.label) {
    return {
      decision: "stays",
      reason: `rules and LLM disagree (${rules.label} vs ${llm.label})`,
    };
  }
  if (llm.confidence < 0.85) {
    return {
      decision: "stays",
      reason: `agreement but LLM confidence ${llm.confidence} < 0.85`,
    };
  }
  return {
    decision: "archive",
    reason: `agree on ${rules.label} at ${llm.confidence}`,
  };
}

export function decideLocal(rules: RuleResult): GateOutcome {
  if (rules.label === "none") {
    return { decision: "stays", reason: "rules matched nothing" };
  }
  if ((LOCAL_ONLY as readonly string[]).includes(rules.label)) {
    return {
      decision: "label-only",
      reason: `${rules.label} is never auto-archived`,
    };
  }
  return {
    decision: "stays",
    reason: "no LLM vote, so no archive",
  };
}
