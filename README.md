# inbox-relay-demo — hackathon demo (synthetic mail only)

Built for the Meta Global AI Developer Hackathon 2026 (indie track).

A command-line demo that triages 14 synthetic recruiter emails with a rules
baseline, shows a safety verdict for each, and prints the draft each one
would get.

## Status: what is actually in this repo (Oct 28)

Built this week, in this repo, and runnable right now:

- `data/synthetic-emails.json` — 14 invented emails, each with an `expected`
  label (the ground truth for scoring).
- `src/rules.ts` — first-match rules over the 8-label taxonomy
  (interview, offer-process, recruiter/new, recruiter/replied, rejects,
  application, read-later, promos). No match → `none` at 0.4.
- `src/safety.ts` — screens every email before any LLM call (see Safety).
- `src/cli.ts` — runs the rules + safety screen and prints label,
  confidence, rule name, safety verdict, decision, and draft.
- `src/drafts.ts` — reply templates for 5 labels; none for
  rejects/read-later/promos.

Not in this repo yet (planned, not claimed as done):

- Llama classifier (Meta Model API), the agreement gate (rules + LLM agree
  at confidence >= 0.85), and scoring against `expected`. These land in
  tomorrow's slice.
- Anything from Relay's codebase. Nothing was copied.

## Disclosure (also the video's opening line)

Pre-existing: Relay, my separate inbox triager (design only — the 8-label
taxonomy and the rules + LLM agreement-gate idea). Built this week in this
repo: synthetic data, rules baseline, safety screen, CLI. Not yet built:
Llama classifier, agreement gate, scoring. Relay lives separately at
https://github.com/Sriya03/inbox-relay — no code or git history from it is
in this repo. This repo was created Oct 28, 2026, and its history starts
that day.

## Data: 100% synthetic

Every email is invented: fictional companies and people, `.example`
domains, fake identifiers in the two sensitive cases (a made-up account
ending, a made-up case number). No real Gmail, no OAuth, no credentials, no
API keys, no real mail anywhere in this repo or its history.

## Safety: what the screen does, and what it does not do yet

`src/safety.ts` runs before any LLM call and returns ok or blocked:

- Blocked senders: banks, government/immigration, employer, payroll.
- Blocked content: SSN, USCIS case numbers, passport, date of birth, bank
  account references.
- Attachments are never fetched or sent. When the Llama module lands, its
  payload will be subject + first 1000 chars of body only.

What it does not do yet: there is no LLM call in this repo today, so today
nothing is sent anywhere — the CLI shows the screen's verdict for each
email (12 ok, 2 blocked: a fake bank statement and a fake USCIS update).
The screen is the contract tomorrow's Llama module must call first.

## Run it

```sh
npm install
npm run build
npm run demo
```

You will see 14 emails. 12 pass the screen (LLM line reads "pending" until
tomorrow's slice); 2 are blocked with "LLM skipped (sensitive — never
sent)".

## What's next (planned, not done)

1. Llama classifier + agreement gate + scoring against `expected`.
2. 2-minute demo video (opens with the disclosure line above).
3. Submit by Nov 4, 9:00 PM ET.

## License

MIT — see LICENSE.
