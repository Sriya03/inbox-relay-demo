# inbox-relay-demo — hackathon demo (synthetic mail only)

A tiny demo of the Relay idea: triage a recruiter inbox with a rules baseline
plus an LLM classifier behind an agreement gate. Run it, watch 14 synthetic
emails get labeled, and see the draft each one would get.

## What it builds on (disclosure)

Relay — my pre-existing inbox triager — is a separate project and is NOT in
this repo. This repo contains only work done Oct 28 and later for the Meta
hackathon: the synthetic data, the rules baseline, the safety screen, the CLI,
and (from tomorrow) the Llama classifier and gate. No pre-hackathon code, no
git history from Relay. Relay's design (8-label taxonomy, rules + LLM
agreement gate at confidence >= 0.85) is the idea this demo implements.

## Data: 100% synthetic

Every email in `data/synthetic-emails.json` is invented. Companies and people
are fictional (`.example` domains), and the two sensitive cases use fake
identifiers (a made-up account ending, a made-up case number). No real Gmail,
no OAuth, no real mail is read, labeled, or sent anywhere in this demo.

Each email carries an `expected` field — its ground-truth label. That makes
the data set a golden set: tomorrow's scoring compares rules, Llama, and gate
outputs against `expected` on this same set. (`blocked` means the safety
screen must refuse it, not a label.)

## Safety: sensitive data never reaches the model

`src/safety.ts` screens every email BEFORE any LLM call: blocked sender
domains/keywords (banks, government/immigration, employer, payroll), content
patterns (SSN, USCIS case numbers, passport, date of birth, bank account
references), and attachments are never sent. Payloads are minimized to subject
+ first 1000 chars of body. Two synthetic sensitive emails in the data set
exist so you can watch the screen block them.

Training leakage: this demo sends nothing real anywhere (synthetic only). For
real mail, the same screen applies, plus: never fine-tune on user mail, the
golden set is eval-only, and the provider's current API data terms must
exclude training before any real mail is sent.

## Setup

```sh
npm install
npm run build
npm run demo
```

## What's next

- Tomorrow: Llama classifier (Meta Model API) + the agreement gate + scoring
  against `expected` (rules, then Llama, then gate, all on this same set).
- Then: 2-minute demo video + submit.

## License

MIT
