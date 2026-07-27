// Smoke suite: the kernel loads, a genuine production-signed receipt verifies,
// the F-01 freshness contract holds, and hostile nesting is contained.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { verifyRavenReceipt } from "./ravenReceipt.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => JSON.parse(readFileSync(join(here, "fixtures", `${name}.json`), "utf8"));

test("a genuine production-signed receipt verifies", () => {
  const fx = fixture("production-receipt-v1-bonk-verified");
  const r = verifyRavenReceipt(fx.input, { now: fx.now, trustedKeys: new Set(fx.trustedKeys) });
  assert.equal(r.valid, true);
  assert.equal(r.keyTrusted, true);
  assert.deepEqual(r.reasons, []);
});

test("F-01 contract: unparseable timestamp => stale:true + timestamp_unparseable", () => {
  const fx = fixture("unparseable-timestamp");
  const r = verifyRavenReceipt(fx.input, { now: fx.now, trustedKeys: new Set(fx.trustedKeys) });
  assert.equal(r.stale, true);
  assert.ok(r.reasons.includes("timestamp_unparseable"));
});

test("F-02 contract: hostile nesting is contained, never thrown", () => {
  const fx = fixture("production-receipt-v1-bonk-verified");
  const hostile = JSON.parse(JSON.stringify(fx.input));
  hostile.findings = [{ code: "T", source: "t", evidence: {} }];
  let cur = hostile.findings[0].evidence;
  for (let i = 0; i < 200_000; i++) { (cur as Record<string, unknown>).n = {}; cur = (cur as Record<string, unknown>).n as object; }
  let r;
  assert.doesNotThrow(() => { r = verifyRavenReceipt(hostile, { now: fx.now }); });
  assert.equal(r!.valid, false);
  assert.ok(r!.reasons.includes("canonicalization_failed"));
});
