# Resources

## Raven
- **Front door + request a dev API key:** https://ravenattest.com
- **Hosted verifier base URL:** `https://raven-hosted-verifier.onrender.com`
  - `POST /receipt/v1` — fetch a signed receipt (API-key gated)
  - `GET /pubkey` — published signing-key registry (verify locally, no key)
  - `GET /healthz` — liveness + signer status

## In this skill
- `lib/ravenReceipt.ts` — zero-dependency verifier + fetch helpers (Node ≥ 22.6).
  - `verifyRavenReceipt(receipt, { now?, trustedKeys? })` → `{ valid, stale, reasons, keyTrusted?, trusted? }`
  - `fetchPublishedKeys(verifierUrl?, fetchImpl?, timeoutMs?)` → `Set<string>` of published keys
  - `verifyAgainstPublishedKey(receipt, { verifierUrl? })` → verify + key trust in one call
  - `fetchReceipt({ mintAddress, tokenProgramAddress, apiKey, timeoutMs? })` → a fresh receipt (dev key)
- `lib/example-verify.ts` — offline demo: verifies a real production receipt (BONK) + a tampered one.
- `lib/fixtures/` — a real production receipt and a tampered receipt for tests/demos.

## Related kit skills
- Core Solana dev: https://github.com/solana-foundation/solana-dev-skill
- Reference skill shape: https://github.com/solanabr/solana-game-skill

## Notes
- Verifying needs **no** API key — prefer verify-only flows.
- Use a **dev/test** API key for fetching; never a production signer key.
- The receipt is evidence, not a verdict — see [evidence-not-verdicts.md](evidence-not-verdicts.md).
