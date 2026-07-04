// Adversarial regression tests for the Raven receipt verifier. Zero-dependency,
// runs offline against the bundled fixtures:
//
//   node --experimental-strip-types lib/verify.test.ts
//
// Covers two properties the verifier MUST hold:
//   1. `valid` alone never establishes trust — only `valid && keyTrusted` (the
//      `trusted` field) does. A self-consistent receipt checked without / against
//      the wrong trusted key is `valid` but NOT `trusted`.
//   2. verifyRavenReceipt never throws on hostile input — non-canonicalizable
//      bodies degrade to `valid:false`, they do not crash the caller.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { verifyRavenReceipt } from "./ravenReceipt.ts";

const here = dirname(fileURLToPath(import.meta.url));
const load = (f: string) => JSON.parse(readFileSync(join(here, "fixtures", f), "utf8"));

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "ok  " : "FAIL"}  ${name}`);
  if (!cond) failures++;
};

const bonk = load("production-receipt-v1-bonk-verified.json");

// 1) Happy path: with the correct trusted key, the real receipt is valid AND trusted.
const trusted = verifyRavenReceipt(bonk.input, {
  now: bonk.input.timestamp,
  trustedKeys: new Set<string>(bonk.trustedKeys ?? []),
});
check("real receipt is valid", trusted.valid === true);
check("real receipt is keyTrusted", trusted.keyTrusted === true);
check("real receipt is trusted (valid && keyTrusted)", trusted.trusted === true);

// 2) Trust gate: a valid receipt is NOT trusted without a trust anchor.
const noAnchor = verifyRavenReceipt(bonk.input, { now: bonk.input.timestamp });
check("valid without trustedKeys", noAnchor.valid === true);
check("but NOT trusted without trustedKeys", !noAnchor.trusted);

// 3) Trust gate: a valid receipt signed by a non-trusted key is valid but not trusted.
const wrongAnchor = verifyRavenReceipt(bonk.input, {
  now: bonk.input.timestamp,
  trustedKeys: new Set<string>(["not-the-raven-key"]),
});
check("valid against a wrong trust anchor", wrongAnchor.valid === true);
check("but keyTrusted is false", wrongAnchor.keyTrusted === false);
check("and trusted is false", wrongAnchor.trusted === false);

// 4) Robustness: non-finite number in free-form evidence must NOT throw.
const hostile = JSON.parse(JSON.stringify(bonk.input));
if (Array.isArray(hostile.findings) && hostile.findings.length > 0) {
  hostile.findings[0].evidence = { injected: Infinity };
} else {
  hostile.findings = [{ code: "x", source: "x", evidence: { injected: Infinity } }];
}
let threw = false;
let hostileResult: ReturnType<typeof verifyRavenReceipt> | null = null;
try {
  hostileResult = verifyRavenReceipt(hostile, { now: bonk.input.timestamp });
} catch {
  threw = true;
}
check("hostile (non-finite) input does not throw", !threw);
check("hostile input is rejected as invalid", hostileResult?.valid === false);
check(
  "hostile input reports payload_hash_mismatch",
  hostileResult?.reasons.includes("payload_hash_mismatch") === true,
);

// 5) Tampered fixture is still rejected.
const bad = load("tampered-disclaimer.json");
const tampered = verifyRavenReceipt(bad.input, { now: bad.now });
check("tampered receipt is invalid", tampered.valid === false);

console.log(
  failures === 0
    ? `\n✅ All ${"regression"} checks passed.`
    : `\n❌ ${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
