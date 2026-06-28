# Receipt v1 schema

A Raven Receipt v1 is a flat JSON object with 18 fields: 14 signed body fields +
4 integrity/signature fields. Everything except the last four is part of the
signed payload.

## Fields

| Field | Type | Meaning |
|-------|------|---------|
| `chain` | string | e.g. `solana-mainnet`. |
| `mintAddress` | string | The token mint that was observed. |
| `tokenProgramAddress` | string | Owning program (SPL Token or Token-2022), re-checked against the mint's on-chain owner. |
| `slot` | int | The observed on-chain slot. The receipt is a snapshot *at this slot*. |
| `timestamp` | string (ISO) | Estimated block time of `slot`. |
| `rulesVersion` | string | Rule/policy set version. |
| `findingTaxonomyVersion` | string | Finding-code taxonomy version. |
| `scopeChecksPerformed` | string[] | Checks that actually ran (performed-ness is explicit, not inferred from findings). |
| `scopeChecksNotPerformed` | string[] | Checks that did not run. |
| `coverageGaps` | string[] | Surfaces NOT evaluated (the authoritative limitation list). **Always surface these.** |
| `findings` | object[] | Observed facts (see below). May be empty. |
| `interpretations` | object[] | Plain-language, fact-only descriptions per finding code (incl. language). |
| `maxAgeSeconds` | int | Freshness budget; older than this ⇒ `stale`. |
| `disclaimer` | string | Mandatory, byte-exact: states this is scope-bounded observed state, not a safety declaration. |
| `payloadHash` | string | `sha256:` over canonical JSON of the 14 body fields. |
| `receiptId` | string | `raven-receipt-v1:<payloadHash>`. |
| `signature` | string | ed25519 (base64) over the domain-separated envelope. |
| `signerPublicKey` | string | SPKI DER (base64). Verify it's in `/pubkey`. |

## Findings

```ts
interface Finding {
  code: string;     // machine-readable, e.g. "issuer_control.mint_authority_active"
  source: string;   // where the fact came from, e.g. "mint_account_evidence"
  subject?: string; // e.g. "mint_authority"
  evidence?: Record<string, unknown>; // fact-only detail (addresses, flags, raw values as strings)
}
```

Findings are **observed facts**, never judgments. `code` is stable and
machine-routable; `interpretations[]` carries the human-readable text. Examples of
the *kinds* of facts surfaced: presence/absence of mint or freeze authority, the
owning token program tier, and Token-2022 extension state (transfer fee, transfer
hook, permanent delegate, etc.). A finding states *what is*, e.g. "freeze
authority is held by a non-program address" — it does not say what that *means*
for safety.

## Coverage gaps

`coverageGaps` is the **authoritative** list of what was NOT evaluated (e.g.
`liquidity`, `top_holders`, `deployer_outcomes`). Treat absence of a finding as
"not observed within scope," not "nothing there." Surfacing gaps honestly is what
keeps the integration trustworthy — silence must never imply a clean result.

## Freshness vs tampering

- `stale: true` ⇒ the receipt is older than `maxAgeSeconds`. It is **not** tampered;
  the facts were true at `slot`. Re-fetch for a current view.
- `valid: false` ⇒ integrity failed (bad signature, altered field, wrong hash).
  **Never** use an invalid receipt.

## Replayability

The receipt binds `slot`, the request, and the observed findings under a signed
payload hash. A third party can reproduce the payload hash from the same body and
verify the signature — the receipt is a *replayable* claim, not an opaque score.
