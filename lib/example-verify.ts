// Offline demo: verify a REAL production-signed Raven receipt (BONK) and confirm
// a tampered receipt is rejected. No API key, no network needed.
//
//   node --experimental-strip-types lib/example-verify.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { verifyRavenReceipt } from "./ravenReceipt.ts";

const here = dirname(fileURLToPath(import.meta.url));
const load = (f: string) => JSON.parse(readFileSync(join(here, "fixtures", f), "utf8"));

// 1) A real production receipt for BONK, checked against Raven's published key
//    (bundled with the fixture so this runs offline).
const bonk = load("production-receipt-v1-bonk-verified.json");
const good = verifyRavenReceipt(bonk.input, {
  now: bonk.input.timestamp,
  trustedKeys: new Set<string>(bonk.trustedKeys ?? []),
});
console.log(`production BONK receipt → valid=${good.valid} signedByRaven=${good.keyTrusted} stale=${good.stale}`);
console.log(`  findings: ${bonk.input.findings.map((f: { code: string }) => f.code).join(", ")}`);
console.log(`  not evaluated: ${bonk.input.coverageGaps.join(", ")}`);

// 2) A tampered receipt must be rejected with explicit reasons.
const bad = load("tampered-disclaimer.json");
const tampered = verifyRavenReceipt(bad.input, { now: bad.now });
console.log(`\ntampered receipt → valid=${tampered.valid}`);
console.log(`  reasons: ${tampered.reasons.join(", ")}`);

const ok = good.valid && good.keyTrusted && !tampered.valid;
console.log(ok
  ? "\n✅ Verifier reproduces the production receipt and rejects tampering — locally, no server trust."
  : "\n❌ Unexpected result.");
process.exit(ok ? 0 : 1);
