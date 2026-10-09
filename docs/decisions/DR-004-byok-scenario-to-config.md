---
id: DR-004
title: "Describe a test scenario": optional, bring your own key, reviewed and audited
status: Accepted
date: 2026-10-09
applies-to: /generate, /ai-log, /methods#ai-use, web/src/lib/ai
---

# DR-004: "Describe a test scenario": optional, bring your own key, reviewed and audited

**Decision in one line:** an optional assistant that turns a plain-language description of the test data someone needs into a proposed generator configuration, called from the visitor's browser with their own key, validated against a schema and the reference table, applied only field by field after the visitor reviews it, and recorded in a local audit log.

## Context

The generator has many settings (count, seed, five designs, weights, four filters, coordinates, format), and testers think in scenarios ("a small fixture that covers every remoteness area"), not settings. Translating one into the other is a reasonable job for a language model. It is also a small, realistic test of governing generative AI: the model's output changes what software does, so it must be constrained, checked and reviewed. There is no budget for an API key and no server for AI, and nothing on the site may depend on AI.

## Decision

- **Bring your own key, browser only.** The visitor pastes an Anthropic (default, Claude Haiku 4.5; Claude Sonnet 5.5 optional) or OpenAI key in AI settings. It stays in `sessionStorage` unless they choose "remember on this device" (`localStorage`), and "Forget key" removes it. Calls go straight from the browser to the provider (`anthropic-dangerous-direct-browser-access: true` for Anthropic). The key never reaches this site, a log or the repository, and anything key-like is redacted before it is stored or shown.
- **Minimal input.** The request carries the scenario (at most 1,000 characters), the current settings, and the catalogue of allowed values (remoteness areas with suburb counts, decile meaning, the 71 council names). No suburb list, no generated addresses, nothing about the visitor.
- **Structured output, checked twice.** The reply must match a JSON schema (provider structured-output modes) and is validated again with zod against exactly the same contract. A second, domain check runs against the reference table: unknown suburbs or councils, out-of-range deciles or seeds, and malformed weights are flagged and cannot be applied; a count above 5,000 is clamped with a note. The model must also list anything the generator cannot do (unit numbers, PO boxes, real addresses, people's names) instead of pretending.
- **Human in the loop.** The proposal is labelled "AI-generated" and shown as a table of changes (setting, now, proposed). The visitor ticks which to apply; nothing is generated until they press Generate. Applying every recommended change is recorded as "accepted", a different selection as "edited" (with exactly what was applied), and "Reject" as "rejected".
- **Audit.** Every call, including failures, refusals and replies that fail validation, is written to an IndexedDB audit log without the key: time, feature, provider, model, input, raw output, latency, token usage, the checks and the human decision. It is viewable and exportable (JSON, CSV) at /ai-log.
- **Refusals.** Claude Sonnet 5.5 requests opt into Anthropic's server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`); a refusal that still comes back is shown plainly and logged.

## Options considered

1. **No AI.** Safe, but misses a genuinely useful shortcut and a governance showcase.
2. **A server proxy with my key.** Costs money, invites abuse and puts a secret on a server.
3. **Let the model generate addresses directly.** Unreproducible, unverifiable and likely to produce real-looking or real addresses: the opposite of what a mock generator is for.
4. **Model proposes configuration only; deterministic code generates** (chosen). The model never touches the data, only the knobs, and every knob it turns is visible and reversible.

## Why

Restricting the model to proposing configuration keeps the part that matters (the seeded, tested generator) deterministic, and makes the AI's contribution small enough to review at a glance. The schema, the reference-table check and the field-by-field review are three independent controls, and the audit log makes each decision traceable. The design is informed by the Australian Government's policy for the responsible use of AI in government, the EU AI Act's transparency principles and the NIST AI Risk Management Framework; it is not a compliance claim.

## What happened

- The provider adapters, error handling, key storage, redaction, audit log and the proposal review are unit-tested with the network mocked (`ai.test.ts`): the key only ever travels in a request header, and invented suburbs or councils are flagged and cannot be applied even if ticked.
- No live call was made during development or CI, because the project has no key. The request shapes follow the providers' documented APIs; a real call is the first thing to check after deployment.
- The domain check catches names that do not exist, not names that exist but are wrong for the scenario (a real council that is not the one the visitor meant). That is what the review table is for.

## What I'd change

- Build a small evaluation set of scenarios with expected settings and score each model on it (field-level agreement with Wilson intervals, paired between models) before recommending one.
- Offer an in-browser model as a no-key option once small models handle structured output reliably.
- Let the visitor save a reviewed configuration as a named preset, so a good proposal is reused without another call.
