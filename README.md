# Raven Token Attestation Skill

A drop-in skill for Claude Code / Codex (and the [Solana AI Kit](https://github.com/solanabr/solana-ai-kit))
that teaches a coding agent to add a **verifiable trust primitive** to any Solana
app or agent: a **production-signed, replayable receipt of on-chain token evidence**
that it — or its user — can verify *locally*, with no trust in any server.

## The problem it solves

Agents and apps act on Solana tokens constantly — swapping, listing, lending,
sniping, recommending — and almost always do it by trusting some API's *opinion*
about a token ("is this safe?"). That's unverifiable and, for a token, unsignable.

This skill wires in a different primitive. Before a token-touching action, the
agent fetches a **Raven receipt** for the mint: the checks performed, the checks
**not** performed (coverage gaps), the observed slot, and an **ed25519 signature**
anyone can verify against Raven's published key. It makes **no safe/unsafe
judgment** and gives no trading advice — the app applies its own policy to
verifiable facts.

The result: agent and app behaviour around tokens becomes **checkable**. A
downstream party (or the user) can verify the evidence without re-trusting the
agent.

## Why it's novel

The ecosystem has skills to *do* things on Solana (trade, deploy, audit code). It
has no clean skill for **verifiable, signed, replayable token evidence an agent
can act on and a user can independently check**. That's a real, cross-domain gap
(security × agents × DeFi) — and it's what this skill fills.

## What's inside

```
skill/
  SKILL.md                  # entry point + task routing (progressive loading)
  integration-patterns.md   # the 5 places a receipt fits (agent / wallet / trading / component / monitoring)
  fetch-and-verify.md       # end-to-end code: fetch /receipt/v1, verify locally vs /pubkey
  receipt-schema.md         # exact receipt v1 fields, findings, coverage gaps, freshness
  evidence-not-verdicts.md  # the presentation discipline + forbidden language (enforced in code)
  resources.md              # endpoints + library links
lib/
  ravenReceipt.ts           # zero-dependency verifier + fetch helpers (Node >=22.6)
  example-verify.ts         # offline demo: verifies a real production receipt + rejects a tampered one
  fixtures/                 # a real production receipt (BONK) + a tampered receipt
install.sh                  # copy the skill into your coding agent's skills dir
LICENSE                     # MIT
```

The `lib/` verifier is **real, tested, zero-dependency code** — not pseudocode.
It reproduces Raven's exact verification recipe (canonical JSON, payload hash,
ed25519 signature, disclaimer + forbidden-word checks) so anyone can confirm a
receipt without trusting Raven.

## Try it in 30 seconds (no API key)

```bash
node --experimental-strip-types lib/example-verify.ts
```

Verifies a **real production-signed** BONK receipt locally (confirming it was
signed by Raven's published key) and proves a tampered receipt is rejected.

## Install

```bash
./install.sh           # copies skill/ + lib/ into your coding agent's skills dir
```

Or copy the `skill/` folder into your agent's skills directory manually. The
entry point is `skill/SKILL.md`.

## Use

Verifying a receipt needs **no API key**. Fetching a fresh receipt calls
`POST /receipt/v1`, which is API-key gated — request a **dev/test** key at
[ravenattest.com](https://ravenattest.com).

```ts
import { verifyAgainstPublishedKey } from "./lib/ravenReceipt.ts";
const result = await verifyAgainstPublishedKey(receipt); // { valid, keyTrusted, stale, reasons }
```

## The one rule

**Raven reports evidence, not verdicts.** Never present `safe/unsafe/legit/
scam-free/approved/guaranteed`, never claim it "prevents rugs," never turn a
receipt into a buy/sell call. The receipt is signed *facts within a stated scope
at a stated slot*; the caller owns the decision. The verifier enforces this in
code. See [skill/evidence-not-verdicts.md](skill/evidence-not-verdicts.md).

## License

MIT. Learn more at [ravenattest.com](https://ravenattest.com).
