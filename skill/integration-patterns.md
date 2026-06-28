# Integration patterns

Five concrete places a signed Raven receipt fits. In all of them the receipt is
**input to the caller's own policy** — never a gate that decides for the user.

## 1. Agent pre-action receipt (most common)

Before an autonomous agent acts on a Solana mint, it fetches a receipt, verifies
it, reasons over the **evidence**, and can hand its user a receiptId they verify
independently.

```ts
// inside the agent's tool/skill, before a token-touching step
const receipt = await fetchReceipt({ mintAddress, tokenProgramAddress, apiKey });
const result  = await verifyAgainstPublishedKey(receipt);
if (!result.valid) return abort("could not verify token evidence");

// reason over FACTS, then apply YOUR policy — do not invent a verdict
const gaps = receipt.coverageGaps;            // what was NOT evaluated
const findings = receipt.findings.map(f => f.code);
// e.g. policy: "if mint authority is still active AND user is sending > X, ask for confirmation"
```

Why it's strong: the agent's output becomes *checkable*. A downstream party (or
the agent's own user) verifies the receipt without re-trusting the agent.

## 2. Wallet / trading-UI pre-token-interaction panel

In a wallet's token detail or pre-swap view, show the observed facts + coverage
gaps with a "verify this yourself" affordance.

- Fetch + verify on the backend; render `findings` and `coverageGaps`.
- Show `receiptId`, `slot`, and a green "signature verified" badge.
- **Framing:** "Observed on-chain facts (verified). Not evaluated: …". Never a
  safe/unsafe label. The user decides.

## 3. Trading-strategy pre-execution check (non-blocking)

Add an optional evidence node to an automated strategy. Fetch the receipt in
parallel, attach the `receiptId` to the trade's audit log, and let the strategy's
own rules decide whether to gate on a finding. Keep it async so it never adds
latency to execution.

## 4. App-builder receipt component

A reusable component that takes a mint, fetches + verifies a receipt, and renders
findings + coverage gaps + a verify affordance. Drop it into any consumer app so
end users get verifiable evidence without the builder writing crypto.

## 5. Signed evidence artifact for listings / monitoring

Attach a verifiable receipt to a token's listing, market, or launch page, or
store `receiptId` + `payloadHash` as an auditable event in a monitoring pipeline.
The artifact is portable proof of what was observable at a stated slot.

---

## Choosing well

| Surface | Fetch a receipt? | Where it lives |
|---------|------------------|----------------|
| Autonomous agent | Yes, per action | tool/skill call before acting |
| Wallet / swap UI | Yes, on token view | backend, render facts in UI |
| Trading strategy | Yes, async | pre-execution node + audit log |
| App component | Yes | reusable UI component |
| Listing / monitoring | Yes, once per token/event | stored artifact |

## Anti-patterns (don't do these)

- **Don't gate execution on a "verdict."** There is no verdict. Gate on a
  *specific finding* under *your* policy, and make it user-overridable.
- **Don't hide coverage gaps.** Absence of a finding is not absence of risk — it
  may mean a surface wasn't evaluated. Always surface `coverageGaps`.
- **Don't trust a receipt you didn't verify.** Always check the signature first.
- **Don't relabel evidence as safety.** See [evidence-not-verdicts.md](evidence-not-verdicts.md).
