# inbox-relay-demo — hackathon demo (synthetic mail only)

A tiny demo of the Relay idea: triage a recruiter inbox with a rules baseline
plus an LLM classifier behind an agreement gate. Run it, watch 12 synthetic
emails get labeled, and see the draft each one would get.

## What it builds on (disclosure)

Relay — my pre-existing inbox triager — is a separate project and is NOT in
this repo. This repo contains only work done Oct 28 and later for the Meta
hackathon: the synthetic data, the rules baseline, the CLI, and (from tomorrow)
the Llama classifier and gate. No pre-hackathon code, no git history from
Relay. Relay's design (8-label taxonomy, rules + LLM agreement gate at
confidence >= 0.85) is the idea this demo implements.

## Data: 100% synthetic

Every email in `data/synthetic-emails.json` is invented. Companies and people
are fictional (`.example` domains). No real Gmail, no OAuth, no real mail is
read, labeled, or sent anywhere in this demo.

## Setup

```sh
npm install
npm run build
npm run demo
```

## What's next

- Tomorrow: Llama classifier (Meta Model API) + the agreement gate — label
  only when rules and LLM agree at confidence >= 0.85, otherwise the mail
  stays in the inbox.
- Then: 2-minute demo video + submit.

## License

MIT
