# inbox-relay-demo — hackathon demo (synthetic mail only)

Built for the Meta Global AI Developer Hackathon 2026 (indie track).

## The problem: a job seeker's inbox is flooded

A job search produces hundreds of emails: recruiter pitches, interview
invites, offer letters, rejections, application confirmations, newsletters,
and promos. The important mail (an interview invite, an offer) gets buried
under the rest, and missing it costs an opportunity. Triaging by hand takes
hours a week.

This demo labels every email and drafts a reply where one is needed, so the
seeker can spot interviews and offers at a glance and answer in minutes. It
is a command-line demo on 22 synthetic emails: rules label them, a safety
screen checks them, and (with a key) Llama models classify the generic
ones behind an agreement gate.

## How it works: rules first, LLM second (only for generic mail), gate decides

- Rules: fast, precise, offline. They catch the clear cases (an offer
  letter, a rejection) but miss reworded mail.
- LLM: flexible. It catches intent and paraphrases the rules miss, but it
  can be overconfident and wrong. It only ever sees generic template mail
  (see below): specific mail never reaches it.
- Gate: for generic mail, the two must agree AND the LLM must be
  confident (>= 0.85), or the mail stays in the inbox. Interview and offer
  mail is never auto-archived: it is labeled only, because those are the
  emails the seeker must see herself.

Neither side alone is trusted. The gate takes the intersection, and the
honest "I don't know" (label `none`) stays in the inbox instead of being
force-labeled and lost.

## Why guardrails: a job-search inbox holds personal information

Offer letters carry compensation. Background-check forms carry Social
Security numbers and dates of birth. Immigration mail carries USCIS case
numbers. Payroll and bank mail carry account details. A triager that sends
mail to an LLM ships all of that to a third-party API.

So this demo has two boundary layers, both enforced in code before any
network call:

1. Sensitive screen: blocked senders (banks, government/immigration,
   employer, payroll) and blocked content (SSN, USCIS case numbers,
   passport, date of birth, bank account references). Blocked mail is
   rules-only: it is never sent to any model.
2. Category rule: only generic template mail (application confirmations,
   form rejections, promos, newsletters) may reach a model. That mail is
   bulk mail: it reveals nothing specific about the seeker's dealings.
   Specific mail (interviews, offers, recruiter threads) carries the
   seeker's actual dealings: company names, roles, timing, people. That
   mail never leaves the machine: rules-only, label-only, zero API calls.
   Unknown mail also stays local: an unknown email might contain anything,
   so it is never sent to find out.

Payloads for the mail that does go to a model are minimized: subject +
first 1000 chars of body, no attachments, no full threads. And the demo
data is synthetic: no real mail, no credentials, no API keys anywhere in
this repo or its history.

The guardrails are what let this tool graduate from a demo to a real
inbox. Without them, running it on real mail would leak personal
information. With them, the useful part (triaging recruiter mail) works
while the personal part never leaves the machine.

## How Meta models are used, and which one is best

Meta's Llama models (via the Meta Model API, using the hackathon credits)
fill the LLM slot in the gate, for generic mail only. They do not replace
the rules; they cover what the rules miss on the bulk mail, and the gate
keeps them honest.

Best is not picked on vibes. Every candidate model runs over the same
generic golden set (13 emails) with the same fixed prompt (temperature 0,
JSON-only output), and the scorer prints one table: accuracy, confidence
when right vs wrong (calibration), format failures, agreement with the
rules, and gate archive precision. The winner is the highest accuracy,
then the best calibration, then the fewest format failures. If a smaller
model ties a bigger one, the smaller one wins: same score, less to run.
The rules baseline is printed alongside, so you can see exactly what the
LLM adds over rules alone. The scorer also proves the boundary: the 7
local-only emails and the 2 blocked emails must show zero model calls,
and any call on them counts as a failure.

Status: benchmark run Oct 30. Both candidate models tied on the
13-email generic set, so the pick is a tie-break, not a measured
accuracy difference.

| model | accuracy (generic) | conf. when right | conf. when wrong | failures | agrees with rules | gate archives @ precision | local (zero calls) | safety |
| muse-wonder-1.0 | 13/13 (100%) | 0.99 | n/a (none wrong) | 0 | 13/13 | 13 @ 100% | 7/7 | 2/2 |
| muse-spark-1.2 | 13/13 (100%) | 0.99 | n/a (none wrong) | 0 | 13/13 | 13 @ 100% | 7/7 | 2/2 |

Rules baseline (no LLM): 13/13 correct on generic mail. Pick:
muse-spark-1.2 — full tie on accuracy, calibration, and failures, so the
smaller model wins by the tie-break rule. Scope: 13 emails is small
(1 email ≈ 7–8 points), so this is directional, not a claim that one
model is generally better.

## Labels

LLM-eligible (generic template mail, may reach a model and be archived):

- application: confirms your application was received, with no decision yet
- rejects: says you were not selected, or they are moving forward with others
- promos: marketing, discounts, course sales, or bulk offers
- read-later: a newsletter, article, or roundup worth reading later, not a job pitch

Local-only (specific mail, never sent to any model, never auto-archived):

- interview: invites you to, schedules, or confirms an interview, screen, or round
- offer-process: offer letter, compensation, background check, or onboarding steps
- recruiter/new: first outreach from a recruiter about a role you have not discussed before
- recruiter/replied: continues an existing recruiter conversation (a reply) without inviting you to an interview

Other outcomes:

- none: no rule matched; stays in the inbox (the honest "I don't know")
- blocked: the safety screen refused it; never sent to any model

## Status: what is actually in this repo (Oct 30)

Built and runnable right now:

- `data/synthetic-emails.json`: 22 invented emails, each with an `expected`
  label (the ground truth for scoring).
- `src/rules.ts`: first-match rules over the 8-label taxonomy.
- `src/safety.ts`: the two boundary layers described above.
- `src/prompt.ts`: the fixed classification prompt (same for every model).
- `src/llama.ts`: the Meta model client (screen first, category check,
  minimized payload, validates label and confidence).
- `src/gate.ts`: the agreement gate, plus the no-LLM local decision.
- `src/evaluate.ts`: the benchmark scorer and comparison table, including
  the zero-calls proof for local-only and blocked mail.
- `src/cli.ts`: demo mode (offline, zero API calls) and `--score` mode
  (benchmark).
- `src/drafts.ts`: reply templates for 5 labels; none for
  rejects/read-later/promos.

Not in this repo: anything from Relay's codebase (nothing copied), any
real mail, any credentials, any API keys. Benchmark run Oct 30 — table in
'How Meta models are used' above.

## Disclosure (also the video's opening line)

Pre-existing: Relay, my separate inbox triager (design only: the 8-label
taxonomy and the rules + LLM agreement-gate idea). Built this week in this
repo: synthetic data, rules baseline, safety screen, fixed prompt, Llama
client, gate, scorer, CLI. Run Oct 30: the model benchmark. Relay lives
separately at https://github.com/Sriya03/inbox-relay: no code or git
history from it is in this repo. This repo was created Oct 28, 2026, and
its history starts that day.

## Data: 100% synthetic

Every email is invented: fictional companies and people, `.example`
domains, fake identifiers in the two sensitive cases (a made-up account
ending, a made-up case number). No real Gmail, no OAuth, no credentials, no
API keys, no real mail anywhere in this repo or its history.

## Run it

```sh
npm install
npm run build
npm run demo    # offline: rules + safety + drafts, zero API calls
```

Demo output: 22 emails. 13 generic ones read "not called in demo mode";
6 specific ones read "never sent (specific mail stays local)"; 1 unknown
reads "never sent (unknown mail stays local)"; 2 blocked ones read "LLM
skipped (sensitive — never sent)".

```sh
cp .env.example .env   # fill in META_API_BASE_URL, META_API_KEY, META_MODELS
npm run score          # benchmark every listed model, print the table
```

## What's next (planned, not done)

1. Benchmark run + winner's table in this README (done Oct 30).
2. 3-minute demo video (opens with the disclosure line above, and answers
   the same questions as this README: the use, the guardrails, the models).
3. Submit by Nov 4, 9:00 PM ET.

## License

MIT: see LICENSE.
