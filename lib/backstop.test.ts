// Never-throws backstop: hostile objects that escape the contained paths must
// fail closed with a dedicated reason, never throw into caller code.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { verifyRavenReceipt } from "./ravenReceipt.ts";

const here = dirname(fileURLToPath(import.meta.url));
const validReceipt = () => JSON.parse(readFileSync(join(here, "fixtures", "production-receipt-v1-bonk-verified.json"), "utf8"));

test("behavior is byte-exact for inputs the core already handles", () => {
  const fx = validReceipt();
  const r = verifyRavenReceipt(fx.input, { now: fx.now });
  assert.equal(r.valid, true);
  assert.equal(r.stale, false);
  assert.deepEqual(r.reasons, []);
});

test("a receipt with a throwing getter fails closed, never throws", () => {
  const hostile = validReceipt().input;
  Object.defineProperty(hostile, "disclaimer", { get() { throw new Error("hostile getter"); } });
  let r;
  assert.doesNotThrow(() => { r = verifyRavenReceipt(hostile, { now: "2026-07-27T00:00:00.000Z" }); });
  assert.equal(r.valid, false);
  assert.equal(r.stale, true);
  assert.deepEqual(r.reasons, ["internal_error"]);
});

test("a non-iterable trustedKeys value fails closed, never throws", () => {
  const fx = validReceipt();
  let r;
  assert.doesNotThrow(() => {
    r = verifyRavenReceipt(fx.input, { now: fx.now, trustedKeys: {} as unknown as string[] });
  });
  assert.equal(r.valid, false);
  assert.equal(r.stale, true);
  assert.deepEqual(r.reasons, ["internal_error"]);
  assert.equal(r.keyTrusted, false);
});

test("unparseable-timestamp semantics are unchanged (stale:true + reason)", () => {
  const fx = JSON.parse(readFileSync(join(here, "fixtures", "unparseable-timestamp.json"), "utf8"));
  const r = verifyRavenReceipt(fx.input, { now: fx.now, trustedKeys: new Set(fx.trustedKeys) });
  assert.equal(r.stale, true);
  assert.ok(r.reasons.includes("timestamp_unparseable"));
});

test("forbidden words as object KEYS stay unflagged (verifier-contract control)", () => {
  const fx = validReceipt();
  const r0 = JSON.parse(JSON.stringify(fx.input));
  r0.findings = [{ code: "X", source: "t", evidence: { safe: "ordinary" } }];
  const r = verifyRavenReceipt(r0, { now: fx.now });
  assert.ok(!r.reasons.some((x) => String(x).startsWith("forbidden_word")));
});
