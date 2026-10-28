/**
 * Demo CLI. Two modes:
 *  - default (no args): offline demo. Runs the rules baseline + safety
 *    screen over the 14 synthetic emails and prints label, confidence,
 *    rule, safety verdict, decision, and draft. Makes ZERO API calls, so
 *    it runs without any key.
 *  - --score: benchmark mode. Runs every model in META_MODELS over the
 *    same golden set with the same prompt and prints the comparison table
 *    (accuracy, calibration, format failures, gate precision) plus the
 *    rules baseline. Needs .env (see .env.example). No key is committed.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { classifyByRules, LABELS, type Email } from "./rules.js";
import { draftFor } from "./drafts.js";
import { screenForLLM } from "./safety.js";
import { makeLlamaClassifier } from "./llama.js";
import {
  printComparison,
  scoreModel,
  type ModelScore,
} from "./evaluate.js";

const dataUrl = new URL("../data/synthetic-emails.json", import.meta.url);
const emails = JSON.parse(await readFile(dataUrl, "utf-8")) as Email[];

if (process.argv.includes("--score")) {
  const models = (process.env.META_MODELS ?? process.env.META_MODEL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    !process.env.META_API_KEY ||
    !process.env.META_API_BASE_URL ||
    models.length === 0
  ) {
    console.log(
      "Benchmark needs .env: META_API_BASE_URL, META_API_KEY, and META_MODELS (comma-separated model IDs from the credits dashboard). Copy .env.example to .env and fill it in. .env is gitignored; no key is committed.",
    );
    process.exit(1);
  }
  const labelEmails = emails.filter(
    (e) => e.expected && (LABELS as readonly string[]).includes(e.expected),
  );
  const rulesCorrect = labelEmails.filter(
    (e) => classifyByRules(e).label === e.expected,
  ).length;
  console.log(
    `rules baseline: ${rulesCorrect}/${labelEmails.length} correct (no LLM)`,
  );
  console.log("");
  const scores: ModelScore[] = [];
  for (const m of models) {
    scores.push(await scoreModel(m, makeLlamaClassifier(m), emails));
  }
  printComparison(scores);
} else {
  emails.forEach((email, i) => {
    const result = classifyByRules(email);
    const screen = screenForLLM(email);
    const draft = draftFor(result.label);
    console.log(`[${i + 1}] "${email.subject}" (from ${email.from})`);
    console.log(
      `  rules → ${result.label} (${result.confidence}) [${result.rule}]`,
    );
    console.log(
      `  safety → ${screen.allowed ? "ok" : `BLOCKED: ${screen.reason}`}`,
    );
    if (screen.allowed) {
      console.log(
        `  LLM → not called in demo mode (offline; run npm run score with .env)`,
      );
    } else {
      console.log(`  LLM → skipped (sensitive — never sent)`);
    }
    if (result.label === "none") {
      console.log(`  decision → stays in inbox (low confidence)`);
    } else {
      console.log(`  decision → label shown; no archive in demo`);
    }
    console.log(`  draft → ${draft ?? "none (no reply needed)"}`);
    console.log("");
  });
}
