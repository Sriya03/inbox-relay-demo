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
 * Safety, enforced here in order, before any network call:
 *  1. screenForLLM: blocked mail throws ("refused") and is never sent.
 *  2. Category check: the rules label is computed locally, and only
 *     generic template mail (see LLM_ELIGIBLE in safety.ts) proceeds.
 *     Specific mail (interviews, offers, recruiter threads) and unknown
 *     mail throw ("skipped") and never reach the network. The client can
 *     therefore never leak a specific email, even by accident: the fetch
 *     is unreachable for it.
 * The payload is the minimized input (subject + first 1000 chars of body,
 * no attachments). Validation: the returned label must be one of the 8
 * taxonomy labels and confidence must be a number from 0 to 1, or the
 * call throws and the scorer counts it as a failure. The model can never
 * invent a label or smuggle in an unusable confidence.
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
}

export type LLMClassifier = (email: Email) => Promise<LLMResult>;

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
    const res = await fetch(url, {
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
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new Error("empty model response");
    }
    const parsed = JSON.parse(content) as {
      label?: unknown;
      confidence?: unknown;
    };
    if (
      typeof parsed.label !== "string" ||
      !(LABELS as readonly string[]).includes(parsed.label)
    ) {
      throw new Error(`label outside taxonomy: ${String(parsed.label)}`);
    }
    if (
      typeof parsed.confidence !== "number" ||
      parsed.confidence < 0 ||
      parsed.confidence > 1
    ) {
      throw new Error(`bad confidence: ${String(parsed.confidence)}`);
    }
    return {
      label: parsed.label as Label,
      confidence: parsed.confidence,
      model,
    };
  };
}
