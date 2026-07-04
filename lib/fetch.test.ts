// Regression test: the optional fetch helpers must TIME OUT rather than hang
// forever when the verifier host is unresponsive. Uses a local server that
// accepts the connection but never replies — no external network, no API key.
//
//   node --experimental-strip-types lib/fetch.test.ts
import { createServer } from "node:http";
import { fetchReceipt, fetchPublishedKeys } from "./ravenReceipt.ts";

const main = async (): Promise<number> => {
  let failures = 0;
  const check = (name: string, cond: boolean) => {
    console.log(`${cond ? "ok  " : "FAIL"}  ${name}`);
    if (!cond) failures++;
  };

  // A server that accepts connections but NEVER responds.
  const server = createServer(() => {
    /* intentionally never write a response */
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const url = `http://127.0.0.1:${port}`;

  // fetchReceipt must reject with a timeout error, promptly, not hang.
  let receiptErr: Error | null = null;
  const t0 = Date.now();
  try {
    await fetchReceipt({
      mintAddress: "m",
      tokenProgramAddress: "p",
      apiKey: "dev",
      verifierUrl: url,
      timeoutMs: 150,
    });
  } catch (e) {
    receiptErr = e as Error;
  }
  const receiptElapsed = Date.now() - t0;
  check("fetchReceipt rejects on timeout", receiptErr !== null);
  check("fetchReceipt error mentions timeout", /timed out/i.test(receiptErr?.message ?? ""));
  check("fetchReceipt returns promptly (< 2s)", receiptElapsed < 2000);

  // fetchPublishedKeys must also time out.
  let keysErr: Error | null = null;
  const t1 = Date.now();
  try {
    await fetchPublishedKeys(url, fetch, 150);
  } catch (e) {
    keysErr = e as Error;
  }
  const keysElapsed = Date.now() - t1;
  check("fetchPublishedKeys rejects on timeout", keysErr !== null);
  check("fetchPublishedKeys error mentions timeout", /timed out/i.test(keysErr?.message ?? ""));
  check("fetchPublishedKeys returns promptly (< 2s)", keysElapsed < 2000);

  server.closeAllConnections?.();
  server.close();

  // A server that returns a fixed status/body for /pubkey — used to prove
  // fetchPublishedKeys is robust to malformed-but-valid-JSON responses.
  const startResponder = async (status: number, responseBody: string): Promise<{ url: string; close: () => void }> => {
    const s = createServer((_req, res) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(responseBody);
    });
    await new Promise<void>((resolve) => s.listen(0, "127.0.0.1", () => resolve()));
    const addr = s.address();
    const p = typeof addr === "object" && addr ? addr.port : 0;
    return {
      url: `http://127.0.0.1:${p}`,
      close: () => { s.closeAllConnections?.(); s.close(); },
    };
  };

  // Non-array `keys` → empty Set, no throw.
  {
    const responder = await startResponder(200, JSON.stringify({ keys: "not-an-array" }));
    let err: Error | null = null;
    let result: Set<string> | null = null;
    try { result = await fetchPublishedKeys(responder.url, fetch, 2000); } catch (e) { err = e as Error; }
    responder.close();
    check("non-array keys does not throw", err === null);
    check("non-array keys yields empty Set", result?.size === 0);
  }

  // Null entries + non-object entries filtered; only valid publicKeyBase64 kept.
  {
    const responder = await startResponder(200, JSON.stringify({ keys: [null, { publicKeyBase64: "abc" }, {}] }));
    let err: Error | null = null;
    let result: Set<string> | null = null;
    try { result = await fetchPublishedKeys(responder.url, fetch, 2000); } catch (e) { err = e as Error; }
    responder.close();
    check("malformed keys array does not throw", err === null);
    check("malformed keys array yields only valid key", result?.size === 1 && result.has("abc"));
  }

  // Non-JSON body → labeled error mentioning invalid JSON.
  {
    const responder = await startResponder(200, "not json");
    let err: Error | null = null;
    try { await fetchPublishedKeys(responder.url, fetch, 2000); } catch (e) { err = e as Error; }
    responder.close();
    check("non-JSON body rejects", err !== null);
    check("non-JSON body error mentions invalid JSON", /invalid JSON/i.test(err?.message ?? ""));
  }

  console.log(
    failures === 0
      ? "\n✅ fetch timeout regression checks passed."
      : `\n❌ ${failures} check(s) failed.`,
  );
  return failures;
};

const failures = await main();
process.exit(failures === 0 ? 0 : 1);
