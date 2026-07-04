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

// Fix: forbidden verdict word used as an object KEY (not just a value) is caught.
const forbiddenKey = JSON.parse(JSON.stringify(bonk.input));
if (Array.isArray(forbiddenKey.findings) && forbiddenKey.findings.length > 0) {
  forbiddenKey.findings[0].evidence = { safe: true };
} else {
  forbiddenKey.findings = [{ code: "x", source: "x", evidence: { safe: true } }];
}
const fk = verifyRavenReceipt(forbiddenKey, { now: bonk.input.timestamp });
check("forbidden word as an evidence KEY is detected", fk.reasons.includes("forbidden_word:safe"));

// Fix: an unparseable timestamp is surfaced as a non-fatal reason (does not throw, does not go stale silently).
const badTs = JSON.parse(JSON.stringify(bonk.input));
badTs.timestamp = "banana";
let tsThrew = false;
let tsResult: ReturnType<typeof verifyRavenReceipt> | null = null;
try {
  tsResult = verifyRavenReceipt(badTs, { now: bonk.input.timestamp });
} catch {
  tsThrew = true;
}
check("unparseable timestamp does not throw", !tsThrew);
check("unparseable timestamp is reported", tsResult?.reasons.includes("timestamp_unparseable") === true);
check("unparseable timestamp is not marked stale", tsResult?.stale === false);

// No-throw hardening: verifier must fail closed, never throw, on hostile/garbage input.
const noThrow = (name: string, fn: () => unknown) => {
  let threw = false;
  try { fn(); } catch { threw = true; }
  check(name, !threw);
};

// throwing getter on a receipt field
const getterReceipt: Record<string, unknown> = JSON.parse(JSON.stringify(bonk.input));
Object.defineProperty(getterReceipt, "slot", { enumerable: true, get() { throw new Error("boom"); } });
noThrow("throwing getter does not escape", () => verifyRavenReceipt(getterReceipt, { now: bonk.input.timestamp }));
check("throwing getter yields valid=false", verifyRavenReceipt(getterReceipt, { now: bonk.input.timestamp }).valid === false);

// cyclic evidence
const cyclic: any = JSON.parse(JSON.stringify(bonk.input));
if (Array.isArray(cyclic.findings) && cyclic.findings.length) { cyclic.findings[0].evidence = {}; cyclic.findings[0].evidence.self = cyclic.findings[0].evidence; }
noThrow("cyclic evidence does not overflow", () => verifyRavenReceipt(cyclic, { now: bonk.input.timestamp }));
check("cyclic evidence yields valid=false", verifyRavenReceipt(cyclic, { now: bonk.input.timestamp }).valid === false);

// non-iterable trustedKeys
noThrow("non-iterable trustedKeys does not throw", () => verifyRavenReceipt(bonk.input, { now: bonk.input.timestamp, trustedKeys: 123 as any }));
check("non-iterable trustedKeys → keyTrusted false", verifyRavenReceipt(bonk.input, { now: bonk.input.timestamp, trustedKeys: 123 as any }).keyTrusted === false);

// bad opts.now
noThrow("garbage now does not throw", () => verifyRavenReceipt(bonk.input, { now: {} as any }));
check("garbage now still returns a verdict (valid true for real receipt)", verifyRavenReceipt(bonk.input, { now: {} as any }).valid === true);

// null opts
noThrow("null opts does not throw", () => verifyRavenReceipt(bonk.input, null as any));
check("null opts still returns valid=true for real receipt", verifyRavenReceipt(bonk.input, null as any).valid === true);

// Fail-closed: evidence nested beyond the scan-depth cap must NOT silently pass.
const deep: any = JSON.parse(JSON.stringify(bonk.input));
let node: any = {};
const deepEvidence = node;
for (let i = 0; i < 5000; i++) { node.child = {}; node = node.child; }
node.safe = true; // a forbidden verdict word buried deep, below the cap
if (Array.isArray(deep.findings) && deep.findings.length) deep.findings[0].evidence = deepEvidence;
else deep.findings = [{ code: "x", source: "x", evidence: deepEvidence }];
let deepThrew = false;
let deepRes: ReturnType<typeof verifyRavenReceipt> | null = null;
try { deepRes = verifyRavenReceipt(deep, { now: bonk.input.timestamp }); } catch { deepThrew = true; }
check("deep evidence does not throw", !deepThrew);
check("deep evidence fails closed (valid=false)", deepRes?.valid === false);
check("deep evidence reports evidence_too_deep", deepRes?.reasons.includes("evidence_too_deep") === true);

console.log(
  failures === 0
    ? `\n✅ All ${"regression"} checks passed.`
    : `\n❌ ${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
