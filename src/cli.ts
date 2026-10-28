/**
 * Demo CLI: runs every synthetic email through the rules baseline and the
 * safety screen, and prints label + confidence + draft. The safety screen
 * runs FIRST: blocked mail never reaches an LLM. The Llama step lands
 * tomorrow: it will fill the "LLM" line, and the gate will archive-label
 * only when rules and LLM agree at confidence >= 0.85. Nothing here
 * touches real mail.
 */
import { readFile } from "node:fs/promises";
import { classifyByRules, type Email } from "./rules.js";
import { draftFor } from "./drafts.js";
import { screenForLLM } from "./safety.js";

const dataUrl = new URL("../data/synthetic-emails.json", import.meta.url);
const emails = JSON.parse(await readFile(dataUrl, "utf-8")) as Email[];

emails.forEach((email, i) => {
  const result = classifyByRules(email);
  const screen = screenForLLM(email);
  const draft = draftFor(result.label);
  console.log(`[${i + 1}] "${email.subject}" (from ${email.from})`);
  console.log(`  rules → ${result.label} (${result.confidence}) [${result.rule}]`);
  console.log(
    `  safety → ${screen.allowed ? "ok" : `BLOCKED: ${screen.reason}`}`,
  );
  if (screen.allowed) {
    console.log(`  LLM → pending (lands tomorrow)`);
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
