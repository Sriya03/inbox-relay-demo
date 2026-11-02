/**
 * Meta model client: the LLM slot in the gate, for generic mail only.
 *
 * Config is env-driven (see .env.example): META_API_BASE_URL comes from the
 * credits dashboard, META_API_KEY is the key, META_MODEL is one model ID.
 * The request shape is the standard OpenAI-compatible chat completions
 * shape: POST {base}/chat/completions with model + messages + temperature.
 * If the dashboard shows a full endpoint path ending in chat/completions,
 * set it as the base URL and it is used as-is; otherwise /chat/completions
 * is appended. No response_format is sent (widest compatibility): the
 * prompt already demands JSON only, and anything unparseable counts as a
 * format failure in the benchmark, which is itself a signal about the model.
 *
 * Output robustness, client-side and API-agnostic (it does not depend on
 * the provider supporting response_format):
 *  - Repair: if the model text is not directly parseable JSON, the client
 *    strips markdown fences (```json ... ```) and extracts the first
 *    JSON object (first "{" to last "}"), then parses again. A prediction
 *    that only parses after repair is flagged repaired: true, so the
 *    scorer reports repaired counts separately from clean predictions.
 *    Repaired numbers are a new run's numbers, never mixed into the
 *    original run's table.
 *  - One retry: if an attempt fails (API error, malformed JSON, invalid
 *    label, invalid confidence), the client retries exactly once with
 *    the same fixed prompt at temperature 0. A second failure is still a
 *    failure: failures are never silently dropped, and one email counts
 *    as one failure no matter how many attempts it took.
 *  - Failure classification: every failure carries a reason prefix so
 *    the scorer can report WHY it failed, not just that it failed:
 *    malformed-json (no valid JSON object produced), api-error (the
 *    API call itself failed or returned no usable content), invalid-label
 *    (JSON parsed but the label is outside the taxonomy), or
 *    invalid-confidence (JSON parsed but confidence is not a finite
 *    number from 0 to 1).
 *
 * Safety, enforced here in order, before any network call:
 *  1. screenForLLM: blocked mail throws ("refused") and is never sent.
 *  2. Category check: the rules label is computed locally, and only
 *     generic template mail (see LLM_ELIGIBLE in safety.ts) proceeds.
 *     Specific mail (interviews, offers, recruiter threads) and unknown
 *     mail throw ("skipped") and never reach the network. The client can
 *     therefore never leak a specific email, even by accident: the fetch
 *     is unreachable for it.
 * Refused, skipped, and missing-env throws happen before the attempt
 * loop and are never retried. The payload is the minimized input
 * (subject + first 1000 chars of body, no attachments). Validation: the
 * returned label must be one of the 8 taxonomy labels and confidence
 * must be a finite number from 0 to 1, or the call throws and the scorer
 * counts it as a failure. The model can never invent a label or smuggle
 * in an unusable confidence.
 */
import {
  classifyByRules,
  LABELS,
  type Email,
  type Label,
} from "./rules.js";
import { LLM_ELIGIBLE, screenForLLM } from "./safety.js";
import { buildClassificationPrompt } from "./prompt.js";

export interface LLMResult {
  label: Label;
  confidence: number;
  model: string;
  /** True when the prediction only parsed after client-side JSON repair. */
  repaired: boolean;
}

export type LLMClassifier = (email: Email) => Promise<LLMResult>;

/**
 * If the text contains a fenced code block, return the first block's
 * contents; otherwise return the text unchanged. Models often wrap JSON
 * in ```json fences despite a JSON-only prompt; the fence is packaging,
 * not content, so stripping it is repair, not reinterpretation.
 */
function stripFences(text: string): string {
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return fence ? fence[1] : text;
}

/** Extract the first JSON object (first "{" to last "}") from the text. */
function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("malformed-json: no JSON object found in model response");
  }
  return text.slice(start, end + 1);
}

function asObject(value: unknown): { label: unknown; confidence: unknown } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("malformed-json: model response was not a JSON object");
  }
  return value as { label: unknown; confidence: unknown };
}

/**
 * Parse one model response. Direct parse first (clean path, repaired:
 * false); on failure, strip fences, extract the object, and parse again
 * (repair path, repaired: true). A failure to parse even after repair
 * is a malformed-json failure.
 */
function parseModelOutput(content: string): {
  label: unknown;
  confidence: unknown;
  repaired: boolean;
} {
  try {
    const parsed = asObject(JSON.parse(content) as unknown);
    return { ...parsed, repaired: false };
  } catch (e) {
    // Only a JSON shape/parse failure falls through to repair. A
    // malformed-json throw from asObject is the same category, so it is
    // safe to attempt repair on any failure here.
    void e;
  }
  const candidate = extractJsonObject(stripFences(content));
  try {
    const parsed = asObject(JSON.parse(candidate) as unknown);
    return { ...parsed, repaired: true };
  } catch (e) {
    throw new Error(
      `malformed-json: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

export function makeLlamaClassifier(model: string): LLMClassifier {
  return async (email: Email): Promise<LLMResult> => {
    const screen = screenForLLM(email);
    if (!screen.allowed) {
      throw new Error(`refused: ${screen.reason}`);
    }
    const rules = classifyByRules(email);
    if (!(LLM_ELIGIBLE as readonly string[]).includes(rules.label)) {
      throw new Error(
        `skipped: ${rules.label} mail stays local (specific, never sent)`,
      );
    }
    const base = process.env.META_API_BASE_URL;
    const key = process.env.META_API_KEY;
    if (!base || !key) {
      throw new Error("missing META_API_BASE_URL or META_API_KEY in .env");
    }
    const { system, user } = buildClassificationPrompt(email);
    const url = /chat\/completions$/.test(base)
      ? base
      : `${base.replace(/\/$/, "")}/chat/completions`;

    const attempt = async (): Promise<LLMResult> => {
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            temperature: 0,
          }),
        });
      } catch (e) {
        throw new Error(
          `api-error: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`api-error: API ${res.status}: ${text.slice(0, 300)}`);
      }
      let data: { choices?: { message?: { content?: unknown } }[] };
      try {
        data = (await res.json()) as {
          choices?: { message?: { content?: unknown } }[];
        };
      } catch (e) {
        throw new Error(
          `api-error: response was not JSON: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.length === 0) {
        throw new Error("malformed-json: empty model response");
      }
      const parsed = parseModelOutput(content);
      if (
        typeof parsed.label !== "string" ||
        !(LABELS as readonly string[]).includes(parsed.label)
      ) {
        throw new Error(`invalid-label: ${String(parsed.label)}`);
      }
      if (
        typeof parsed.confidence !== "number" ||
        !Number.isFinite(parsed.confidence) ||
        parsed.confidence < 0 ||
        parsed.confidence > 1
      ) {
        throw new Error(`invalid-confidence: ${String(parsed.confidence)}`);
      }
      return {
        label: parsed.label as Label,
        confidence: parsed.confidence,
        model,
        repaired: parsed.repaired,
      };
    };

    // Exactly one retry, same prompt, temperature 0. The second failure
    // is the reported failure: one email counts as one failure.
    let lastError: Error | null = null;
    for (let i = 0; i < 2; i++) {
      try {
        return await attempt();
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
    }
    throw lastError ?? new Error("api-error: unknown failure");
  };
}
