# inbox-relay-demo

A privacy-first inbox triage demo for job seekers, built for the Meta Global AI Developer Hackathon 2026.

Job hunting floods an inbox. Recruiter pitches, interview invites, offer letters, rejections, application confirmations, and promos arrive mixed together, and the mail that matters most — an interview invite, an offer — is the easiest to miss. inbox-relay-demo sorts that inbox so interviews and offers do not get buried under promos.

## What it does

The demo labels mail, drafts a reply where one fits, and never sends anything on its own. It runs on synthetic mail only, so you can see the full pipeline — rules, safety screen, model, and gate — without handing over a real inbox.

It sorts mail into 8 labels:

| Label | Means |
|---|---|
| interview | Invites, schedules, or confirms an interview, screen, or round |
| offer-process | Offer letter, compensation, background check, or onboarding steps |
| recruiter/new | First outreach from a recruiter about a role not discussed before |
| recruiter/replied | A reply in a recruiter conversation already under way, with no interview invite |
| rejects | You were not selected, or the team is moving forward with others |
| application | Confirmation your application was received, with no decision yet |
| read-later | A newsletter, article, or roundup worth reading later, not a job pitch |
| promos | Marketing, discounts, course sales, or bulk offers |

Two more outcomes are possible, and both stay in the inbox: `none` means no rule matched, and `blocked` means the safety screen refused the mail.

## How it works

Every email is read locally first. The rules on your machine label it, and that local label decides what happens next.

- **Rules only, for personal dealings.** Interview, offer-process, recruiter/new, and recruiter/replied mail is classified by rules alone. It never leaves the machine, and it is never auto-archived. It is labeled only, so it stays visible.
- **Rules plus a model, for generic template mail.** Application confirmations, form rejections, promos, and read-later mail may reach a Meta model, which returns a label and a confidence.
- **A gate decides an archive.** For generic mail, the rules and the model must agree, and the model must be at least 0.85 confident, or the mail stays in the inbox. A disagreement, a low confidence, or an unknown label all mean the same thing: stay, do not archive.
- **Drafts only.** The demo can draft a reply. It never sends one.

Neither side is trusted alone. The rules are fast and explainable but miss reworded mail. The model catches intent and paraphrases but can be overconfident. The gate takes only the intersection, and the honest "I don't know" stays in the inbox instead of being force-labeled and lost.

## Privacy and safety

A job-search inbox holds personal information. Offer letters carry compensation. Background-check forms carry Social Security numbers and dates of birth. Immigration mail carries case numbers. Payroll and bank mail carry account details. A triager that sends mail to a model ships all of that to a third-party API. This demo is built so that does not happen.

Two boundary layers run in code, before any network call:

1. **Sensitive screen.** Blocked senders (banks, government and immigration, employer, payroll) and blocked content (Social Security numbers, case numbers, passport, date of birth, bank account references) are refused outright. Blocked mail is rules-only and is never sent to any model.
2. **Category rule.** Only generic template mail may reach a model. That mail is bulk mail: it reveals nothing specific about your dealings. Specific mail carries your actual dealings — company names, roles, timing, people — so it never leaves the machine. Unknown mail also stays local: an unknown email might contain anything, so it is never sent to find out.

For mail that does reach a model, the payload is minimized: sender, subject, and the first 1000 characters of the body. No attachments, no full threads. The demo data is synthetic, so no real mail, no Gmail credentials, and no API keys are in this repo or its history.

The boundary is proven, not just claimed: the scorer verifies that local-only and blocked mail had zero model calls. Any call on that mail would count as a failure.

## Results

### Synthetic benchmark

The benchmark runs every candidate model over the same 32-email generic synthetic set, with the same fixed prompt (temperature 0, JSON-only output). The scorer prints accuracy, confidence when right, agreement with the rules, and gate archive precision, with the rules baseline alongside, so you can see exactly what the model adds over rules alone.

| Model | Accuracy (generic) | Confidence when right | Agreement with rules | Gate archives at precision | Local (zero calls) | Safety |
|---|---|---|---|---|---|---|
| muse-wonder-1.0 | 19/32 (59%) | 0.96 | 19/19 | 18 at 100% | 33/33 | 2/2 |
| muse-spark-1.2 | 19/32 (59%) | 0.98 | 19/19 | 19 at 100% | 33/33 | 2/2 |

Rules alone, with no model: 19/32 on generic mail.

The pick is muse-spark-1.2. The two models tied on accuracy, so the pick is a tie-break on confidence and size, not a measured accuracy advantage: higher confidence when right (0.98 versus 0.96), and the smaller model wins a tie.

The 13 cases counted as failures for each model are skipped cases, not format failures. Per-email reporting shows the rules labeled that generic mail as local-only (11 as none, 2 as recruiter/new), so the model was never called on it. On the mail the models were actually called on, they were right on all 19, with no valid wrong predictions. The harder set exposed rules fragility — rules miss generic mail — not model output fragility, and the gate held at 100% precision on both models.

32 emails is a small set (one email is about 3 points), so treat these numbers as directional, not as a claim that one model is generally better.

### Current state on real mail

We are continuously improving this, and this is the current state on real mail. Both runs below were dry runs only: nothing applied, nothing recorded, aggregate counts only, no real mail shown.

- First run, 30 emails: the gate agreed on 21, 9 stayed in the inbox.
- Second run, labeled, 30 emails: rules got 18 right, the model got 22 of the 23 it saw, and the gate archived 11 at 100% precision.

Coverage is what we are improving next. The first run was promo-heavy (23 promos, no interview or offer mail), so the local-only branch was proven on unknown mail, not on interview or offer mail.

## Run it

You need Node.js and npm. No key is needed for the offline demo. A Meta API key is needed only for the benchmark.

```sh
npm install
npm run build
npm run demo    # offline: rules + safety + drafts, zero API calls
```

Demo output covers 67 emails: 32 generic emails read as not called in demo mode, 32 specific emails read as never sent, 1 unknown email read as never sent, and 2 blocked emails read as skipped as sensitive.

```sh
cp .env.example .env   # fill in META_API_BASE_URL, META_API_KEY, META_MODELS
npm run score          # benchmark every listed model and print the table
```

Your `.env` file is gitignored. Never commit it, and never show it on screen.

## Can I run this on my own Gmail?

Not from this repo. This demo does not connect to Gmail, on purpose: it is synthetic only, so judges and readers can run the full pipeline without handing over a real inbox, and no real mail ever enters this repo.

If you want the same idea on real mail, start from Relay, the separate project this demo builds on: https://github.com/Sriya03/inbox-relay

Relay connects to Gmail with a local, read-only-first approach — read, label, and draft only, never auto-send — and its real-mail work proceeds dry-run and label-only first, with approval before anything archives. A Gmail runner is not part of this demo, and adding one here would change the privacy story above, so it belongs in Relay, not in this demo.

## Data

**Synthetic data, in this repo and reproducible.** `data/synthetic-emails.json` holds 67 invented emails, each with an expected label: 8 per label across the 8 labels, plus 1 none and 2 blocked safety cases. Every company, person, and domain is fictional (`.example` domains, made-up identifiers in the blocked cases). Run `npm run score` to reproduce the synthetic benchmark table above.

**Real-mail data, not in this repo and not reproducible from it.** The two real-mail runs quoted above were run locally on a private inbox, dry-run only. No dataset is published, no content is shared, and no real mail is in this repo or its history. That is intentional: publishing real inbox mail would break the privacy rule this project is built on. Judges can reproduce the synthetic numbers; the real-mail numbers are aggregate counts only, and should be read as a current-state check, not as a reproducible benchmark.

## Future work

The direction is clear, and it starts with better labeling, not with sending more mail out:

1. A bigger golden set: 100–200 labeled real emails, with a held-out test split that is never tuned on, plus per-label metrics and error analysis.
2. A local model first: classify type locally, including interview mail, so interview mail gets a proper label without leaving the machine. Rules then handle just the simple template cases.
3. An external model for generic mail only, with the gate threshold tuned on data instead of asserted, and confidence calibrated on that data.
4. Safety hardening: explicit domain lists instead of substring matching, PII redaction on generic payloads, an audit log with undo for archives, and a provider terms check before any real mail is sent.
5. A staged rollout: shadow mode, then label-only, then archive promos only, then archive all agreed — with monitoring (none-rate, disagreement-rate, archive precision, drift) and versioned rules, prompt, and threshold checked against the test set before every change.
6. Metadata tagging on top of the flat 8 labels (company, role, thread stage, deadline, action requested), with no subcategories: the 8 labels stay.
7. Tests for rules, safety, gate, and scorer, with continuous integration and the tie-break rule enforced in code.
8. Interview and offer mail always label-only, never auto-archived, whatever the classifier says.

## Disclosure

Pre-existing: Relay, the separate inbox triager — its design only, namely the 8-label taxonomy and the rules-plus-model agreement-gate idea. No code or history from Relay is in this repo.

Built here: synthetic data, the rules baseline, the safety screen, the fixed prompt, the Meta model client, the gate, the scorer, and the command-line interface. This demo runs on synthetic data only: no real mail, no Gmail credentials, and no API keys anywhere in this repo or its history.

## License

MIT: see LICENSE.
