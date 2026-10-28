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
is a command-line demo on 14 synthetic emails: rules label them, a safety
screen checks them, and (with a key) Llama models classify them behind an
agreement gate.

## How it works: rules first, LLM second, gate decides

- Rules: fast, precise, offline. They catch the clear cases (an offer
  letter, a rejection) but miss reworded mail.
- LLM: flexible. It catches intent and paraphrases the rules miss, but it
  can be overconfident and wrong.
- Gate: the two must agree AND the LLM must be confident (>= 0.85), or
  the mail stays in the inbox. Interview and offer mail is never
  auto-archived: it is labeled only, because those are the emails the
  seeker must see herself.

Neither side alone is trusted. The gate takes the intersection, and the
honest "I don't know" (label `none`) stays in the inbox instead of being
force-labeled and lost.

## Why guardrails: a job-search inbox holds personal information

Offer letters carry compensation. Background-check forms carry Social
Security numbers and dates of birth. Immigration mail carries USCIS case
numbers. Payroll and bank mail carry account details. A triager that sends
mail to an LLM ships all of that to a third-party API.

So this demo screens every email BEFORE any LLM call:

- Blocked senders: banks, government/immigration, employer, payroll.
- Blocked content: SSN, USCIS case numbers, passport, date of birth, bank
  account references.
- Blocked mail is rules-only: it is never sent to any model.
- Payloads are minimized: subject + first 1000 chars of body, no
  attachments, no full threads.
- The demo data is synthetic: no real mail, no credentials, no API keys
  anywhere in this repo or its history.

The guardrails are what let this tool graduate from a demo to a real
inbox. Without them, running it on real mail would leak personal
information. With them, the useful part (triaging recruiter mail) works
while the personal part never leaves the machine.

## How Meta models are used, and which one is best

Meta's Llama models (via the Meta Model API, using the hackathon credits)
fill the LLM slot in the gate. They do not replace the rules; they cover
what the rules miss, and the gate keeps them honest.

Best is not picked on vibes. Every candidate model runs over the same
14-email golden set with the same fixed prompt (temperature 0, JSON-only
output), and the scorer prints one table: accuracy, confidence when right
vs wrong (calibration), format failures, agreement with the rules, and
gate archive precision. The winner is the highest accuracy, then the best
calibration, then the fewest format failures. If a smaller model ties a
bigger one, the smaller one wins: same score, less to run. The rules
baseline is printed alongside, so you can see exactly what the LLM adds
over rules alone.

Status: the client, gate, and scorer are built. The benchmark run is
pending (it needs a key and model IDs from the credits dashboard in
`.env`); the table will be added here after the run. Nothing about the
winner is claimed before it is measured.

## Labels

- interview: invites you to, schedules, or confirms an interview, screen, or round
- offer-process: offer letter, compensation, background check, or onboarding steps
- recruiter/new: first outreach from a recruiter about a role you have not discussed before
- recruiter/replied: continues an existing recruiter conversation (a reply) without inviting you to an interview
- rejects: says you were not selected, or they are moving forward with others
- application: confirms your application was received, with no decision yet
- read-later: a newsletter, article, or roundup worth reading later, not a job pitch
- promos: marketing, discounts, course sales, or bulk offers
- none: no rule matched; stays in the inbox (the honest "I don't know")
- blocked: the safety screen refused it; never sent to any model

## Status: what is actually in this repo (Oct 28)

Built and runnable right now:

- `data/synthetic-emails.json`: 14 invented emails, each with an `expected`
  label (the ground truth for scoring).
- `src/rules.ts`: first-match rules over the 8-label taxonomy.
- `src/safety.ts`: the screen described above.
- `src/prompt.ts`: the fixed classification prompt (same for every model).
- `src/llama.ts`: the Meta model client (screen first, minimized payload,
  validates label and confidence).
- `src/gate.ts`: the agreement gate.
- `src/evaluate.ts`: the benchmark scorer and comparison table.
- `src/cli.ts`: demo mode (offline, zero API calls) and `--score` mode
  (benchmark).
- `src/drafts.ts`: reply templates for 5 labels; none for
  rejects/read-later/promos.

Not in this repo: anything from Relay's codebase (nothing copied), any
real mail, any credentials, any API keys. The benchmark table (which model
won) lands here after the run.

## Disclosure (also the video's opening line)

Pre-existing: Relay, my separate inbox triager (design only: the 8-label
taxonomy and the rules + LLM agreement-gate idea). Built this week in this
repo: synthetic data, rules baseline, safety screen, fixed prompt, Llama
client, gate, scorer, CLI. Not yet run: the model benchmark. Relay lives
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

Demo output: 14 emails. 12 pass the screen (LLM line reads "not called in
demo mode"); 2 are blocked with "LLM skipped (sensitive — never sent)".

```sh
cp .env.example .env   # fill in META_API_BASE_URL, META_API_KEY, META_MODELS
npm run score          # benchmark every listed model, print the table
```

## What's next (planned, not done)

1. Benchmark run, then the winner's table goes in this README.
2. 2-minute demo video (opens with the disclosure line above, and answers
   the same questions as this README: the use, the guardrails, the models).
3. Submit by Nov 4, 9:00 PM ET.

## License

MIT: see LICENSE.
