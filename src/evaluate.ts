/**
 * Benchmark scorer: how "best model" is measured, not asserted.
 *
 * Every candidate runs over the same golden set with the same fixed prompt,
 * so the comparison measures the model. The set splits into three buckets:
 *  - Generic mail (expected is a generic template label): accuracy,
 *    calibration (average confidence when right vs wrong), format/API
 *    failures, agreement with the rules, and gate archive precision.
 *    Only this bucket ever reaches a model.
 *  - Local-only mail (expected is a specific label, or "none"): the
 *    classifier must throw before any network call. A throw is a pass
 *    (zero calls, proven by construction: the client throws before fetch
 *    for these). A returned result is a violation and counts as a failure:
 *    it means a call happened that must not have.
 *  - Blocked mail (expected "blocked"): the classifier must refuse. A
 *    refusal is a pass; a returned result counts as a failure.
 *
 * The pick rule: highest generic accuracy, then the biggest calibration
 * gap (confidence when right minus confidence when wrong; with no wrong
 * answers the gap is just the confidence when right), then the fewest
 * failures. On a full tie, the smaller model wins by human judgment (same
 * score, less to run): the scorer prints its pick, and a tie is visible in
 * the table for that call to be made. Repaired predictions do NOT affect
 * the pick: they are reported separately (see repaired below), so a model
 * that needed repair is not silently ranked above a clean one.
 *
 * Diagnosis (this scorer reports, it does not change predictions):
 *  - Every email gets one per-email outcome (id, expected label, rules
 *    label, LLM label + confidence or failure reason, gate decision).
 *    Collecting outcomes reads predictions only; it never changes a
 *    prediction, a gate decision, or any aggregate below.
 *  - Generic failures are bucketed by WHY they failed, from the
 *    classifier's reason prefix: malformed-json (no valid JSON object
 *    produced), api-error (the API call itself failed), invalid-label
 *    (JSON parsed but the label is outside the taxonomy),
 *    invalid-confidence (JSON parsed but confidence is not a finite
 *    number 0 to 1), or other (anything else). A failure is one email,
 *    no matter how many attempts the client took to produce it.
 *  - Repaired predictions (the client had to strip fences or extract the
 *    JSON object to parse the output) are counted separately from clean
 *    predictions. They count as correct/wrong like any prediction for
 *    accuracy, but the repaired count is printed alongside, so a run
 *    that relied on repair is disclosed as such and never mixed into
 *    the original run's numbers.
 */
import { classifyByRules, type Email } from "./rules.js";
import { LLM_ELIGIBLE, LOCAL_ONLY } from "./safety.js";
import { decideGate, decideLocal } from "./gate.js";
import type { LLMClassifier, LLMResult } from "./llama.js";

export type FailureCategory =
  | "malformed-json"
  | "api-error"
  | "invalid-label"
  | "invalid-confidence"
  | "other";

export type EmailOutcomeKind =
  | "correct"
  | "wrong"
  | "failure"
  | "local-ok"
  | "safety-ok";

export interface EmailOutcome {
  id: string;
  expected: string;
  rulesLabel: string;
  llmLabel: string | null;
  llmConfidence: number | null;
  repaired: boolean;
  gateDecision: string;
  outcome: EmailOutcomeKind;
  failureReason: FailureCategory | null;
  failureDetail: string | null;
}

export interface ModelScore {
  model: string;
  accuracy: number;
  correct: number;
  total: number;
  wrong: number;
  avgConfCorrect: number;
  avgConfWrong: number;
  failures: number;
  agree: number;
  agreeTotal: number;
  gateArchives: number;
  gatePrecision: number;
  localOk: number;
  localTotal: number;
  safetyOk: number;
  safetyTotal: number;
  repaired: number;
  failureReasons: Record<FailureCategory, number>;
  outcomes: EmailOutcome[];
}

const FAILURE_CATEGORIES: FailureCategory[] = [
  "malformed-json",
  "api-error",
  "invalid-label",
  "invalid-confidence",
  "other",
];

function categorizeFailure(e: unknown): {
  category: FailureCategory;
  detail: string;
} {
  const msg = e instanceof Error ? e.message : String(e);
  for (const category of FAILURE_CATEGORIES) {
    if (category !== "other" && msg.startsWith(`${category}:`)) {
      return { category, detail: msg.slice(category.length + 1).trim() };
    }
  }
  return { category: "other", detail: msg };
}

export async function scoreModel(
  name: string,
  classify: LLMClassifier,
  emails: Email[],
): Promise<ModelScore> {
  const eligible = LLM_ELIGIBLE as readonly string[];
  const localOnly = LOCAL_ONLY as readonly string[];
  let correct = 0;
  let total = 0;
  let wrong = 0;
  let failures = 0;
  let agree = 0;
  let agreeTotal = 0;
  let confC = 0;
  let nC = 0;
  let confW = 0;
  let nW = 0;
  let arch = 0;
  let archCorrect = 0;
  let localOk = 0;
  let localTotal = 0;
  let safetyOk = 0;
  let safetyTotal = 0;
  let repaired = 0;
  const failureReasons: Record<FailureCategory, number> = {
    "malformed-json": 0,
    "api-error": 0,
    "invalid-label": 0,
    "invalid-confidence": 0,
    other: 0,
  };
  const outcomes: EmailOutcome[] = [];

  for (const email of emails) {
    if (email.expected === "blocked") {
      safetyTotal++;
      const rules = classifyByRules(email);
      try {
        const returned = await classify(email);
        failures++;
        outcomes.push({
          id: email.id,
          expected: email.expected,
          rulesLabel: rules.label,
          llmLabel: returned.label,
          llmConfidence: returned.confidence,
          repaired: returned.repaired,
          gateDecision: "—",
          outcome: "failure",
          failureReason: "other",
          failureDetail: "blocked mail reached model (safety violation)",
        });
      } catch (e) {
        if (String(e).includes("refused")) {
          safetyOk++;
          outcomes.push({
            id: email.id,
            expected: email.expected,
            rulesLabel: rules.label,
            llmLabel: null,
            llmConfidence: null,
            repaired: false,
            gateDecision: "—",
            outcome: "safety-ok",
            failureReason: null,
            failureDetail: null,
          });
        } else {
          failures++;
          const { category, detail } = categorizeFailure(e);
          outcomes.push({
            id: email.id,
            expected: email.expected,
            rulesLabel: rules.label,
            llmLabel: null,
            llmConfidence: null,
            repaired: false,
            gateDecision: "—",
            outcome: "failure",
            failureReason: category,
            failureDetail: detail,
          });
        }
      }
      continue;
    }
    if (
      email.expected === "none" ||
      (email.expected && localOnly.includes(email.expected))
    ) {
      localTotal++;
      const rules = classifyByRules(email);
      try {
        const returned = await classify(email);
        failures++;
        outcomes.push({
          id: email.id,
          expected: email.expected,
          rulesLabel: rules.label,
          llmLabel: returned.label,
          llmConfidence: returned.confidence,
          repaired: returned.repaired,
          gateDecision: "—",
          outcome: "failure",
          failureReason: "other",
          failureDetail: "local-only mail reached model (safety violation)",
        });
      } catch {
        const local = decideLocal(rules);
        if (local.decision !== "archive") {
          localOk++;
          outcomes.push({
            id: email.id,
            expected: email.expected,
            rulesLabel: rules.label,
            llmLabel: null,
            llmConfidence: null,
            repaired: false,
            gateDecision: local.decision,
            outcome: "local-ok",
            failureReason: null,
            failureDetail: null,
          });
        } else {
          failures++;
          outcomes.push({
            id: email.id,
            expected: email.expected,
            rulesLabel: rules.label,
            llmLabel: null,
            llmConfidence: null,
            repaired: false,
            gateDecision: local.decision,
            outcome: "failure",
            failureReason: "other",
            failureDetail: "local decision was archive",
          });
        }
      }
      continue;
    }
    if (!email.expected || !eligible.includes(email.expected)) continue;
    total++;
    const rules = classifyByRules(email);
    let llm: LLMResult | undefined;
    try {
      llm = await classify(email);
    } catch (e) {
      failures++;
      const { category, detail } = categorizeFailure(e);
      failureReasons[category]++;
      outcomes.push({
        id: email.id,
        expected: email.expected,
        rulesLabel: rules.label,
        llmLabel: null,
        llmConfidence: null,
        repaired: false,
        gateDecision: "—",
        outcome: "failure",
        failureReason: category,
        failureDetail: detail,
      });
      continue;
    }
    if (llm.repaired) repaired++;
    if (llm.label === email.expected) {
      correct++;
      confC += llm.confidence;
      nC++;
    } else {
      wrong++;
      confW += llm.confidence;
      nW++;
    }
    agreeTotal++;
    if (llm.label === rules.label) agree++;
    const gate = decideGate(rules, llm);
    if (gate.decision === "archive") {
      arch++;
      if (llm.label === email.expected) archCorrect++;
    }
    outcomes.push({
      id: email.id,
      expected: email.expected,
      rulesLabel: rules.label,
      llmLabel: llm.label,
      llmConfidence: llm.confidence,
      repaired: llm.repaired,
      gateDecision: gate.decision,
      outcome: llm.label === email.expected ? "correct" : "wrong",
      failureReason: null,
      failureDetail: null,
    });
  }

  return {
    model: name,
    accuracy: total ? correct / total : 0,
    correct,
    total,
    wrong,
    avgConfCorrect: nC ? confC / nC : Number.NaN,
    avgConfWrong: nW ? confW / nW : Number.NaN,
    failures,
    agree,
    agreeTotal,
    gateArchives: arch,
    gatePrecision: arch ? archCorrect / arch : Number.NaN,
    localOk,
    localTotal,
    safetyOk,
    safetyTotal,
    repaired,
    failureReasons,
    outcomes,
  };
}

function pct(x: number): string {
  return Number.isNaN(x) ? "n/a" : `${Math.round(x * 100)}%`;
}

function num(x: number): string {
  return Number.isNaN(x) ? "n/a" : x.toFixed(2);
}

function calibrationGap(s: ModelScore): number {
  return s.avgConfCorrect - (s.wrong ? s.avgConfWrong : 0);
}

export function pickWinner(scores: ModelScore[]): ModelScore | null {
  if (scores.length === 0) return null;
  return [...scores].sort(
    (a, b) =>
      b.accuracy - a.accuracy ||
      calibrationGap(b) - calibrationGap(a) ||
      a.failures - b.failures,
  )[0];
}

function failureBreakdown(s: ModelScore): string {
  const parts = FAILURE_CATEGORIES.filter(
    (c) => s.failureReasons[c] > 0,
  ).map((c) => `${c} ${s.failureReasons[c]}`);
  return parts.length > 0 ? parts.join(", ") : "none";
}

export function printComparison(scores: ModelScore[]): void {
  console.log(
    "model | acc (generic) | conf-right | conf-wrong | fail | agree | gate (arch, prec) | local (zero calls) | safety",
  );
  for (const s of scores) {
    console.log(
      `${s.model} | ${s.correct}/${s.total} (${pct(s.accuracy)}) | ${num(s.avgConfCorrect)} | ${num(s.avgConfWrong)} | ${s.failures} | ${s.agree}/${s.agreeTotal} | ${s.gateArchives}, ${pct(s.gatePrecision)} | ${s.localOk}/${s.localTotal} | ${s.safetyOk}/${s.safetyTotal}`,
    );
    console.log(
      `  repaired: ${s.repaired} | failures by reason (generic): ${failureBreakdown(s)}`,
    );
  }
  const winner = pickWinner(scores);
  if (winner) {
    console.log(
      `\npick: ${winner.model} (by generic accuracy, then calibration gap, then fewest failures; on a full tie, the smaller model wins)`,
    );
  }
}

function truncate(detail: string | null, max = 120): string {
  if (!detail) return "";
  return detail.length > max ? `${detail.slice(0, max)}…` : detail;
}

export function printPerEmailOutcomes(scores: ModelScore[]): void {
  for (const s of scores) {
    console.log(`\nper-email outcomes: ${s.model}`);
    for (const o of s.outcomes) {
      const llm =
        o.outcome === "local-ok"
          ? "not-sent (local-only)"
          : o.outcome === "safety-ok"
            ? "refused"
            : o.llmLabel === null
              ? "FAILED"
              : `${o.llmLabel} (${num(o.llmConfidence ?? Number.NaN)})${o.repaired ? " [repaired]" : ""}`;
      const tag =
        o.outcome === "failure"
          ? `FAILURE: ${o.failureReason}${o.failureDetail ? ` (${truncate(o.failureDetail)})` : ""}`
          : o.outcome;
      console.log(
        `[${o.id}] expected=${o.expected} | rules=${o.rulesLabel} | llm=${llm} | gate=${o.gateDecision} | ${tag}`,
      );
    }
  }
}
