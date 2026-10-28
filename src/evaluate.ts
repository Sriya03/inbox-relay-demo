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
 * the table for that call to be made.
 */
import { classifyByRules, type Email } from "./rules.js";
import { LLM_ELIGIBLE, LOCAL_ONLY } from "./safety.js";
import { decideGate, decideLocal } from "./gate.js";
import type { LLMClassifier } from "./llama.js";

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

  for (const email of emails) {
    if (email.expected === "blocked") {
      safetyTotal++;
      try {
        await classify(email);
        failures++;
      } catch (e) {
        if (String(e).includes("refused")) safetyOk++;
        else failures++;
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
        await classify(email);
        failures++;
      } catch {
        if (decideLocal(rules).decision !== "archive") localOk++;
        else failures++;
      }
      continue;
    }
    if (!email.expected || !eligible.includes(email.expected)) continue;
    total++;
    const rules = classifyByRules(email);
    let llm;
    try {
      llm = await classify(email);
    } catch {
      failures++;
      continue;
    }
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

export function printComparison(scores: ModelScore[]): void {
  console.log(
    "model | acc (generic) | conf-right | conf-wrong | fail | agree | gate (arch, prec) | local (zero calls) | safety",
  );
  for (const s of scores) {
    console.log(
      `${s.model} | ${s.correct}/${s.total} (${pct(s.accuracy)}) | ${num(s.avgConfCorrect)} | ${num(s.avgConfWrong)} | ${s.failures} | ${s.agree}/${s.agreeTotal} | ${s.gateArchives}, ${pct(s.gatePrecision)} | ${s.localOk}/${s.localTotal} | ${s.safetyOk}/${s.safetyTotal}`,
    );
  }
  const winner = pickWinner(scores);
  if (winner) {
    console.log(
      `\npick: ${winner.model} (by generic accuracy, then calibration gap, then fewest failures; on a full tie, the smaller model wins)`,
    );
  }
}
