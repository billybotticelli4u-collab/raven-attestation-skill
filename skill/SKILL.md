---
name: raven-attestation
description: Add verifiable, signed on-chain token evidence to any Solana app or agent. Before a token-touching action (swap, list, lend, snipe, fund, recommend), fetch a production-signed Raven receipt for a mint and verify it locally against Raven's published key — observed on-chain facts, the checks performed, the checks NOT performed (coverage gaps), the observed slot, and an ed25519 signature anyone can verify. Reports evidence, never a safe/unsafe verdict; the app or agent applies its own policy. Use when adding a pre-action token-evidence step, a wallet pre-swap evidence panel, a trading-strategy pre-execution check, an app-builder receipt component, or any verifiable "what is this token, right now, provably" artifact.
user-invocable: true
---

# Raven Token Attestation Skill

Give a Solana app or agent a **verifiable trust primitive**: a production-signed,
replayable receipt of on-chain token evidence that it (or its user) can verify
locally — no trust in any server required.

> **The gap this fills.** Agents and apps constantly act on Solana tokens —
> swapping, listing, lending, sniping, recommending — usually trusting some
> API's *opinion* about a token. Raven instead returns **signed evidence you can
> check yourself**: what was observed on-chain, what was NOT evaluated, at which
> slot, with an ed25519 signature. It makes **no safe/unsafe judgment** and gives
> no trading advice. The app applies its own policy to verifiable facts.

## What this skill is for

Use it when the user wants to:

- **Add a pre-action token check to an agent** — before an autonomous agent
  touches a mint, fetch a receipt and let the agent reason over *evidence*, then
  hand its user a receipt they can independently verify. → [integration-patterns.md](integration-patterns.md)
- **Add a token-evidence panel to a wallet / trading UI** — show observed facts +
  coverage gaps before a swap/send, with a "verify this yourself" affordance. → [integration-patterns.md](integration-patterns.md)
- **Gate a trading strategy on signed evidence** — an optional, non-blocking
  pre-execution receipt logged with the trade. → [integration-patterns.md](integration-patterns.md)
- **Fetch a receipt** for a mint from the hosted verifier (API-key gated). → [fetch-and-verify.md](fetch-and-verify.md)
- **Verify a receipt locally** — reproduce the exact recipe with zero
  dependencies and confirm it was signed by Raven's published key. → [fetch-and-verify.md](fetch-and-verify.md)
- **Understand a receipt** — fields, findings, coverage gaps, freshness. → [receipt-schema.md](receipt-schema.md)
- **Present it correctly** — the evidence-not-verdicts discipline and the forbidden
  language that keeps the integration honest and liability-safe. → [evidence-not-verdicts.md](evidence-not-verdicts.md)

If the task is general Solana program/frontend work (Anchor, kit, wallet
adapter), use the core [solana-dev-skill](https://github.com/solana-foundation/solana-dev-skill);
this skill is specifically the **token-evidence / attestation** layer.

## Operating procedure

### 1. Decide where evidence belongs in the flow
Find the single moment *before* a token-touching action. That's where a receipt
adds value — as **input to the caller's own policy**, never as a gate that decides
for the user. See [integration-patterns.md](integration-patterns.md).

### 2. Verify-only vs fetch-and-verify
- **Verifying** a receipt needs **no API key** — it's pure, local, zero-dependency.
  Prefer this: have Raven (or anyone) hand you a receipt, then verify it.
- **Fetching** a fresh receipt calls `POST /receipt/v1`, which is API-key gated
  (request a **dev/test** key at https://ravenattest.com). See [fetch-and-verify.md](fetch-and-verify.md).

### 3. Always verify locally before trusting a receipt
Recompute the payload hash, check the ed25519 signature against `signerPublicKey`,
and confirm that key is in Raven's published `/pubkey` set. The bundled
zero-dependency verifier (`lib/ravenReceipt.ts`) does all of this. Never trust a
receipt's fields without verifying its signature first.

### 4. Apply the caller's policy to the EVIDENCE — never invent a verdict
Read `findings` and `coverageGaps`. The app decides what to do. Do **not** render
or imply "safe/unsafe/legit/scam-free". See [evidence-not-verdicts.md](evidence-not-verdicts.md).

### 5. Handle absence honestly
If a check wasn't performed it appears in `coverageGaps` — surface it. A receipt
that is `stale` (older than its `maxAgeSeconds`) is not tampered, just old: re-fetch.

## Progressive disclosure (read when needed)

| File | Read it when you need… |
|------|------------------------|
| [integration-patterns.md](integration-patterns.md) | The five concrete places a receipt fits (agent / wallet / trading / app component / monitoring) and which to use. |
| [fetch-and-verify.md](fetch-and-verify.md) | The end-to-end code: fetch `/receipt/v1`, verify locally against `/pubkey`, resolve the token program from the mint owner. |
| [receipt-schema.md](receipt-schema.md) | Exact receipt v1 fields, what findings / coverage gaps / scope arrays mean, freshness. |
| [evidence-not-verdicts.md](evidence-not-verdicts.md) | The presentation discipline: evidence vs verdict, forbidden words, how to show it to a user. |
| [resources.md](resources.md) | Endpoints, the verifier library, links. |

## Task routing guide

| User asks about… | Primary file |
|------------------|--------------|
| "check a token before my agent acts" | integration-patterns.md → fetch-and-verify.md |
| "show token evidence before a swap" | integration-patterns.md |
| "verify a Raven receipt" | fetch-and-verify.md (+ `lib/ravenReceipt.ts`) |
| "is this receipt genuine / signed by Raven" | fetch-and-verify.md (`/pubkey`, `keyTrusted`) |
| "what do these findings / coverage gaps mean" | receipt-schema.md |
| "how do I get an API key" | fetch-and-verify.md (request a dev key at ravenattest.com) |
| "how should I display the result" | evidence-not-verdicts.md |
| "what must I NOT say" | evidence-not-verdicts.md (forbidden words) |
| "resolve the token program for a mint" | fetch-and-verify.md (owner check) |

## The one rule that must never break

**Raven reports evidence, not verdicts.** Never present, log, or generate
`safe / unsafe / legit / scam-free / approved / guaranteed`, never claim it
"prevents rugs", and never turn a receipt into a buy/sell recommendation. The
receipt is signed *facts within a stated scope at a stated slot*; the caller owns
the decision. This is enforced in code (the verifier rejects receipts containing
those words) and must be respected in every UI string. See
[evidence-not-verdicts.md](evidence-not-verdicts.md).
