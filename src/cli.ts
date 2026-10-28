/**
 * Demo CLI. Two modes:
 *  - default (no args): offline demo. Runs the rules baseline + safety
 *    screen over the synthetic emails and prints label, confidence, rule,
 *    safety verdict, LLM handling, decision, and draft. Makes ZERO API
 *    calls, so it runs without any key.
 *  - --score: benchmark mode. Runs every model in META_MODELS over the
 *    generic golden set with the same prompt and prints the comparison
 *    table (accuracy, calibration, format failures, gate precision) plus
 *    the rules baseline. Needs .env (see .env.example). No key is
 *    committed.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { classifyByRules, type Email } from "./rules.js";
import { LLM_ELIGIBLE } from "./safety.js";
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
  const eligible = LLM_ELIGIBLE as readonly string[];
  const genericEmails = emails.filter(
    (e) => e.expected && eligible.includes(e.expected),
  );
  const rulesCorrect = genericEmails.filter(
    (e) => classifyByRules(e).label === e.expected,
  ).length;
  console.log(
    `rules baseline: ${rulesCorrect}/${genericEmails.length} correct (generic mail, no LLM)`,
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
    if (!screen.allowed) {
      console.log(`  LLM → skipped (sensitive — never sent)`);
    } else if (result.label === "none") {
      console.log(`  LLM → never sent (unknown mail stays local)`);
    } else if (
      !(LLM_ELIGIBLE as readonly string[]).includes(result.label)
    ) {
      console.log(`  LLM → never sent (specific mail stays local)`);
    } else {
      console.log(
        `  LLM → not called in demo mode (offline; run npm run score with .env)`,
      );
    }
    if (result.label === "none") {
      console.log(`  decision → stays in inbox (low confidence)`);
    } else if (
      !(LLM_ELIGIBLE as readonly string[]).includes(result.label)
    ) {
      console.log(`  decision → label-only (specific mail is never archived)`);
    } else {
      console.log(
        `  decision → label shown; archive-eligible only with LLM agreement (see npm run score)`,
      );
    }
    console.log(`  draft → ${draft ?? "none (no reply needed)"}`);
    console.log("");
  });
}
