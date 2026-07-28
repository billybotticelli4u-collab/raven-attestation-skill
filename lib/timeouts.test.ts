// Network helpers must never hang: a hung verifier rejects fast via
// AbortSignal.timeout(NETWORK_TIMEOUT_MS), on both /pubkey and /receipt/v1.
import test from "node:test";
import assert from "node:assert/strict";

import { fetchPublishedKeys, fetchReceipt, NETWORK_TIMEOUT_MS } from "./ravenReceipt.ts";

const hangingFetch = (async (_url: string, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    const t = setTimeout(() => reject(new Error("should have been aborted")), 60_000);
    init?.signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(Object.assign(new Error("The operation timed out"), { name: "TimeoutError" }));
    });
  })) as unknown as typeof fetch;

test("NETWORK_TIMEOUT_MS is 15s", () => {
  assert.equal(NETWORK_TIMEOUT_MS, 15_000);
});

test("fetchPublishedKeys rejects fast on a hung /pubkey", async () => {
  const started = Date.now();
  await assert.rejects(fetchPublishedKeys("https://verifier.test", hangingFetch), /timed out/);
  // without the signal this would take the mock's 60s hang
  assert.ok(Date.now() - started < 25_000, "must be bounded by NETWORK_TIMEOUT_MS");
});

test("fetchReceipt rejects fast on a hung /receipt/v1 and passes a signal", async () => {
  const started = Date.now();
  await assert.rejects(
    fetchReceipt({
      mintAddress: "So11111111111111111111111111111111111111112",
      tokenProgramAddress: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      apiKey: "test-key",
      verifierUrl: "https://verifier.test",
      fetchImpl: hangingFetch,
    }),
    /timed out/,
  );
  // without the signal this would take the mock's 60s hang
  assert.ok(Date.now() - started < 25_000, "must be bounded by NETWORK_TIMEOUT_MS");
});

test("well-behaved fetches are unaffected (response passes through)", async () => {
  const ok = (async () =>
    new Response(JSON.stringify({ keys: [{ publicKeyBase64: "K" }] }), {
      status: 200, headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
  const keys = await fetchPublishedKeys("https://verifier.test", ok);
  assert.deepEqual([...keys], ["K"]);
});
