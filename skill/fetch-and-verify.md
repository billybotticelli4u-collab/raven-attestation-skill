# Fetch and verify

Two operations. **Verifying** needs no API key and is the important one.
**Fetching** a fresh receipt is API-key gated.

The bundled zero-dependency verifier is `lib/ravenReceipt.ts` (Node ≥ 22.6; no
runtime deps). Copy it into your project or `import` it.

## Verify a receipt (no key, local, the part that matters)

```ts
import { verifyRavenReceipt, fetchPublishedKeys } from "./lib/ravenReceipt.ts";

// `receipt` is the JSON Raven returned. Confirm it was signed by Raven's
// CURRENTLY-published key by passing /pubkey as trustedKeys:
const trustedKeys = await fetchPublishedKeys();           // GET /pubkey
const r = verifyRavenReceipt(receipt, { trustedKeys });

if (r.valid && r.keyTrusted) {
  // Genuine, unmodified Raven receipt — verified locally, no server trust.
} else {
  // r.reasons explains every failed check, e.g. ["payload_hash_mismatch","signature_invalid"]
}
```

`verifyRavenReceipt` returns:

```ts
{ valid: boolean, stale: boolean, reasons: string[], keyTrusted?: boolean }
```

- `valid` — signature + payload hash + receiptId + disclaimer + forbidden-word
  checks all hold (integrity). **This is what gates trust.**
- `keyTrusted` — present only when you pass `trustedKeys`: was it signed by
  Raven's published key? (non-fatal, reported separately)
- `stale` — older than the receipt's own `maxAgeSeconds` (freshness, not tampering).
- `reasons` — every relevant failed check, accumulated.

### What the verifier checks (the recipe — reproducible by anyone)

1. **Shape** — exactly the 18 receipt fields, correct types.
2. **Disclaimer** — byte-for-byte exact.
3. **Forbidden words** — no `safe/unsafe/legit/scam-free/approved/guaranteed` in any
   signed field (Raven reports evidence, never those judgments).
4. **Payload hash** — `sha256` over the *canonical JSON* of the 14 body fields equals `payloadHash`.
5. **Receipt id** — `raven-receipt-v1:<payloadHash>`.
6. **Signature** — ed25519 over `canonicalJson({domain:"raven-receipt", version:"v1", payloadHash})`,
   verified against `signerPublicKey`.
7. *(optional)* **Key trust** — is `signerPublicKey` in `/pubkey`?
8. *(optional)* **Freshness** — older than `maxAgeSeconds`?

Canonical JSON = recursively sorted keys, preserved array order, `undefined`
omitted. It is **not** `JSON.stringify` (which doesn't guarantee key order). The
bundled verifier implements it; match it exactly if you re-implement.

## Fetch a fresh receipt (needs a dev API key)

`POST /receipt/v1` is API-key gated. Request a key at https://ravenattest.com and
use a **dev/test** key in code — never a production signer key.

```ts
import { fetchReceipt } from "./lib/ravenReceipt.ts";

const receipt = await fetchReceipt({
  mintAddress: "<mint>",
  tokenProgramAddress: "<owning program>",   // see "Resolve the token program" below
  apiKey: process.env.RAVEN_API_KEY!,         // dev/test key only
  // commitment: "finalized" (default)
});
```

### Resolve the token program for a mint (required input)

`tokenProgramAddress` is the program that **owns** the mint account — SPL Token or
Token-2022. Resolve it from the mint account's `owner`; do not guess.

```ts
async function resolveTokenProgram(rpcUrl: string, mint: string): Promise<string | null> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo",
      params: [mint, { encoding: "base64", commitment: "finalized" }] }),
  });
  const owner = (await res.json())?.result?.value?.owner;
  return typeof owner === "string" ? owner : null;   // == the token program
}
```

The hosted verifier independently re-checks this owner and fails closed on a
mismatch, so passing the wrong program cannot produce a misleading signed receipt.

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/receipt/v1` | `x-api-key` (dev key) | Fetch a signed receipt v1 for a mint |
| GET | `/pubkey` | none | Published signing-key registry (verify locally) |
| GET | `/healthz` | none | Liveness + whether the signer is configured |

Base URL: `https://raven-hosted-verifier.onrender.com` (override via the
`verifierUrl` option). Front door + key requests: https://ravenattest.com.

## Try it now (offline demo, zero key)

`lib/example-verify.ts` verifies a bundled **real production receipt** (BONK) and
a tampered one:

```bash
node --experimental-strip-types lib/example-verify.ts
```
