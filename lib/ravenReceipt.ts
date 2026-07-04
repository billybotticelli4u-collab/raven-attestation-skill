// raven-receipt-verify — independent, zero-dependency verifier for Raven Receipt v1.
//
// Everything needed to verify a Raven receipt yourself lives in this one file:
// canonical JSON, payload-hash recompute, ed25519 signature verification,
// disclaimer + forbidden-word re-check, and freshness. It depends on NOTHING
// proprietary — no scanner, no signer key, no network (except the optional
// /pubkey fetch helper). The hosted service GENERATES receipts; this VERIFIES them.
//
// A Raven receipt reports observed on-chain facts within a stated scope at a
// stated slot. It is not a safe/unsafe judgment and gives no trading advice.

import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";

// ---------------------------------------------------------------------------
// Canonical JSON (the one hashing rule). Recursively sorts object keys,
// preserves array order, omits `undefined` props, rejects non-canonicalizable
// values. NOT JSON.stringify (which does not guarantee key order).
// ---------------------------------------------------------------------------
export class CanonicalJsonError extends Error {}

export const canonicalJsonStringify = (value: unknown): string => {
  const seen = new WeakSet<object>();
  const enc = (v: unknown): string => {
    if (v === null) return "null";
    const t = typeof v;
    if (t === "string") return JSON.stringify(v);
    if (t === "boolean") return v ? "true" : "false";
    if (t === "number") {
      if (!Number.isFinite(v as number)) throw new CanonicalJsonError("non-finite number");
      return JSON.stringify(v);
    }
    if (t === "bigint") throw new CanonicalJsonError("bigint is not canonicalizable");
    if (t === "undefined" || t === "function" || t === "symbol") {
      throw new CanonicalJsonError(`unsupported value of type ${t}`);
    }
    if (Array.isArray(v)) {
      if (seen.has(v)) throw new CanonicalJsonError("cycle detected");
      seen.add(v);
      const body = v.map(enc).join(",");
      seen.delete(v);
      return "[" + body + "]";
    }
    const obj = v as Record<string, unknown>;
    if (seen.has(obj)) throw new CanonicalJsonError("cycle detected");
    seen.add(obj);
    const parts: string[] = [];
    for (const key of Object.keys(obj).sort()) {
      const val = obj[key];
      if (val === undefined) continue;
      parts.push(JSON.stringify(key) + ":" + enc(val));
    }
    seen.delete(obj);
    return "{" + parts.join(",") + "}";
  };
  return enc(value);
};

// ---------------------------------------------------------------------------
// Receipt v1 constants (must match the signer exactly).
// ---------------------------------------------------------------------------
export const RECEIPT_DOMAIN = "raven-receipt";
export const RECEIPT_VERSION = "v1";
export const RECEIPT_ID_PREFIX = "raven-receipt-v1:";
export const RECEIPT_DISCLAIMER =
  "This attestation reports on-chain state within the defined scope at the stated slot. It is not a prediction, recommendation, or declaration of safety.";

/** Forbidden words — Raven never asserts these; their presence fails a receipt. */
export const FORBIDDEN_WORDS = ["safe", "unsafe", "legit", "scam-free", "approved", "guaranteed"];
// Whole-word, case-insensitive. Word boundaries are essential so "safety" in the
// disclaimer never trips the "safe" rule.
const FORBIDDEN_RE = new RegExp(
  "\\b(?:" + FORBIDDEN_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b",
  "gi",
);

/** The 14 signed-preimage body fields (order is documented; canonical JSON sorts keys). */
export const RECEIPT_BODY_FIELDS = [
  "chain", "mintAddress", "tokenProgramAddress", "slot", "timestamp",
  "rulesVersion", "findingTaxonomyVersion", "scopeChecksPerformed",
  "scopeChecksNotPerformed", "coverageGaps", "findings", "interpretations",
  "maxAgeSeconds", "disclaimer",
];
/** The full receipt field set (18): body + payloadHash/receiptId + signature pair. */
export const RECEIPT_FIELDS = [
  ...RECEIPT_BODY_FIELDS, "payloadHash", "receiptId", "signature", "signerPublicKey",
];

export interface RavenReceipt {
  chain: string;
  mintAddress: string;
  tokenProgramAddress: string;
  slot: number;
  timestamp: string;
  rulesVersion: string;
  findingTaxonomyVersion: string;
  scopeChecksPerformed: string[];
  scopeChecksNotPerformed: string[];
  coverageGaps: string[];
  findings: Array<{ code: string; source: string; subject?: string; evidence?: Record<string, unknown> }>;
  interpretations: Array<{ code: string; text: string; lang: string }>;
  maxAgeSeconds: number;
  disclaimer: string;
  payloadHash: string;
  receiptId: string;
  signature: string;
  signerPublicKey: string;
}

export interface VerifyOptions {
  /** "Now" for the freshness check; ISO string or Date. Defaults to current time. */
  now?: string | Date;
  /** Published Raven public keys (base64 SPKI DER). When supplied, key trust is
   *  reported via `keyTrusted` — NON-FATAL: a self-consistent signature from an
   *  unknown key is still a valid signature; trust is a separate signal. */
  trustedKeys?: ReadonlySet<string> | string[];
}

export interface VerifyResult {
  /** True iff the receipt is internally self-consistent: shape, disclaimer, forbidden-word, payload hash, receiptId, and signature all hold. NOTE: this does NOT prove the receipt came from Raven — any key (including an attacker's) can sign a self-consistent receipt. Use `trusted` (or `valid && keyTrusted`) to accept a genuine Raven attestation. */
  valid: boolean;
  /** True iff the receipt is older than its own maxAgeSeconds. Staleness != tampered. */
  stale: boolean;
  /** Every failed/relevant check (accumulated, not short-circuited). */
  reasons: string[];
  /** Present only when `trustedKeys` was supplied. */
  keyTrusted?: boolean;
  /**
   * True iff the receipt is BOTH internally valid AND signed by one of the supplied
   * `trustedKeys` (`valid && keyTrusted`). This — not `valid` alone — is what establishes
   * that a receipt genuinely came from Raven. Present only when `trustedKeys` was supplied.
   */
  trusted?: boolean;
}

const collectStrings = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const el of value) collectStrings(el, out);
  else if (value && typeof value === "object")
    for (const v of Object.values(value as Record<string, unknown>)) collectStrings(v, out);
  return out;
};

const findForbiddenWords = (strings: readonly string[]): string[] => {
  const hits = new Set<string>();
  for (const s of strings) for (const m of s.matchAll(FORBIDDEN_RE)) hits.add(m[0].toLowerCase());
  return [...hits].sort();
};

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const isFindingArray = (v: unknown): boolean =>
  Array.isArray(v) && v.every((f) => f && typeof f === "object" &&
    typeof (f as Record<string, unknown>).code === "string" &&
    typeof (f as Record<string, unknown>).source === "string");
const isInterpretationArray = (v: unknown): boolean =>
  Array.isArray(v) && v.every((i) => i && typeof i === "object" &&
    typeof (i as Record<string, unknown>).code === "string" &&
    typeof (i as Record<string, unknown>).text === "string" &&
    typeof (i as Record<string, unknown>).lang === "string");

const checkShape = (r: Record<string, unknown>): string[] => {
  const reasons: string[] = [];
  const expected = new Set(RECEIPT_FIELDS);
  for (const k of Object.keys(r)) if (!expected.has(k)) reasons.push(`shape_unexpected_field:${k}`);
  for (const f of RECEIPT_FIELDS) if (!(f in r)) reasons.push(`shape_missing_field:${f}`);
  if (reasons.length > 0) return reasons;
  const str = (k: string) => { if (typeof r[k] !== "string") reasons.push(`shape_type:${k}`); };
  str("chain"); str("mintAddress"); str("tokenProgramAddress");
  if (!Number.isInteger(r.slot)) reasons.push("shape_type:slot");
  str("timestamp"); str("rulesVersion"); str("findingTaxonomyVersion");
  if (!isStringArray(r.scopeChecksPerformed)) reasons.push("shape_type:scopeChecksPerformed");
  if (!isStringArray(r.scopeChecksNotPerformed)) reasons.push("shape_type:scopeChecksNotPerformed");
  if (!isStringArray(r.coverageGaps)) reasons.push("shape_type:coverageGaps");
  if (!isFindingArray(r.findings)) reasons.push("shape_type:findings");
  if (!isInterpretationArray(r.interpretations)) reasons.push("shape_type:interpretations");
  if (!Number.isInteger(r.maxAgeSeconds)) reasons.push("shape_type:maxAgeSeconds");
  str("disclaimer"); str("payloadHash"); str("receiptId"); str("signature"); str("signerPublicKey");
  return reasons;
};

const extractBody = (r: Record<string, unknown>): Record<string, unknown> => {
  const body: Record<string, unknown> = {};
  for (const f of RECEIPT_BODY_FIELDS) body[f] = r[f];
  return body;
};

const recomputePayloadHash = (body: Record<string, unknown>): string =>
  "sha256:" + createHash("sha256").update(canonicalJsonStringify(body), "utf8").digest("hex");

const toIso = (now: string | Date | undefined): string =>
  now === undefined ? new Date().toISOString() : typeof now === "string" ? now : now.toISOString();

/**
 * Verify a Raven Receipt v1. `valid` is gated ONLY by steps 1–5 (shape, disclaimer,
 * forbidden words, payload hash, receiptId, signature). Key trust and freshness are
 * reported but NON-FATAL. Reasons accumulate so a tampered receipt surfaces every
 * failed check.
 */
export const verifyRavenReceipt = (receipt: unknown, opts: VerifyOptions = {}): VerifyResult => {
  if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)) {
    return { valid: false, stale: false, reasons: ["shape_not_an_object"] };
  }
  const r = receipt as Record<string, unknown>;
  const reasons: string[] = [];

  const shapeReasons = checkShape(r);
  if (shapeReasons.length > 0) return { valid: false, stale: false, reasons: shapeReasons };

  if (r.disclaimer !== RECEIPT_DISCLAIMER) reasons.push("disclaimer_mismatch");

  const body = extractBody(r);
  for (const w of findForbiddenWords(collectStrings(body))) reasons.push(`forbidden_word:${w}`);

  let recomputed: string | null = null;
  try {
    recomputed = recomputePayloadHash(body);
  } catch {
    recomputed = null; // non-canonicalizable body (e.g. non-finite number) → treat as mismatch, never throw
  }
  if (recomputed !== r.payloadHash) reasons.push("payload_hash_mismatch");
  if (r.receiptId !== RECEIPT_ID_PREFIX + (r.payloadHash as string)) reasons.push("receipt_id_mismatch");

  const signedBytes = canonicalJsonStringify({
    domain: RECEIPT_DOMAIN, version: RECEIPT_VERSION, payloadHash: r.payloadHash,
  });
  let signatureOk = false;
  try {
    const pub = createPublicKey({
      key: Buffer.from(r.signerPublicKey as string, "base64"), format: "der", type: "spki",
    });
    signatureOk = cryptoVerify(null, Buffer.from(signedBytes, "utf8"), pub,
      Buffer.from(r.signature as string, "base64"));
  } catch { signatureOk = false; }
  if (!signatureOk) reasons.push("signature_invalid");

  const valid = reasons.length === 0;

  let keyTrusted: boolean | undefined;
  if (opts.trustedKeys) {
    const trusted = opts.trustedKeys instanceof Set ? opts.trustedKeys : new Set(opts.trustedKeys as string[]);
    keyTrusted = trusted.has(r.signerPublicKey as string);
    if (!keyTrusted) reasons.push("key_untrusted");
  }

  const ageSeconds = (Date.parse(toIso(opts.now)) - Date.parse(r.timestamp as string)) / 1000;
  const stale = Number.isFinite(ageSeconds) && ageSeconds > (r.maxAgeSeconds as number);
  if (stale) reasons.push("stale");

  return {
    valid, stale, reasons,
    ...(keyTrusted === undefined ? {} : { keyTrusted, trusted: valid && keyTrusted === true }),
  };
};

// ---------------------------------------------------------------------------
// Optional network helpers.
// ---------------------------------------------------------------------------
export const DEFAULT_VERIFIER_URL = "https://raven-hosted-verifier.onrender.com";

/** Default network timeout (ms) for the optional fetch helpers. The hosted
 *  verifier can cold-start on first request; raise `timeoutMs` if you expect
 *  a cold start, or lower it for latency-sensitive pre-action checks. */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** fetch wrapper that enforces a timeout via AbortSignal and turns an abort
 *  into a clear, catchable error instead of hanging the caller forever. */
const fetchWithTimeout = async (
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<Response> => {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }
    throw err;
  }
};

/** Fetch Raven's published signing keys from /pubkey. Use the returned set as
 *  `trustedKeys` to confirm a receipt was signed by Raven's published key. */
export const fetchPublishedKeys = async (
  verifierUrl: string = DEFAULT_VERIFIER_URL,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Set<string>> => {
  const res = await fetchWithTimeout(fetchImpl, `${verifierUrl.replace(/\/+$/, "")}/pubkey`, {}, timeoutMs, "/pubkey");
  if (!res.ok) throw new Error(`/pubkey returned HTTP ${res.status}`);
  const body = (await res.json()) as { keys?: Array<{ publicKeyBase64?: string }> };
  return new Set((body.keys ?? []).map((k) => k.publicKeyBase64).filter((k): k is string => typeof k === "string"));
};

/** Verify a receipt AND confirm it was signed by Raven's currently-published key. */
export const verifyAgainstPublishedKey = async (
  receipt: unknown,
  opts: Omit<VerifyOptions, "trustedKeys"> & { verifierUrl?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<VerifyResult> => {
  const trustedKeys = await fetchPublishedKeys(opts.verifierUrl ?? DEFAULT_VERIFIER_URL, opts.fetchImpl ?? fetch, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  return verifyRavenReceipt(receipt, { now: opts.now, trustedKeys });
};

/** Fetch a fresh signed receipt from POST /receipt/v1. Requires a Raven API key
 *  (request one at https://ravenattest.com — use a DEV/TEST key here, never a
 *  production signer key). `tokenProgramAddress` is the mint's owning program
 *  (SPL Token or Token-2022); resolve it from the mint account's `owner`. */
export const fetchReceipt = async (
  args: { mintAddress: string; tokenProgramAddress: string; apiKey: string; verifierUrl?: string; commitment?: string; timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<RavenReceipt> => {
  const url = `${(args.verifierUrl ?? DEFAULT_VERIFIER_URL).replace(/\/+$/, "")}/receipt/v1`;
  const res = await fetchWithTimeout(
    args.fetchImpl ?? fetch,
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": args.apiKey },
      body: JSON.stringify({
        mintAddress: args.mintAddress,
        tokenProgramAddress: args.tokenProgramAddress,
        commitment: args.commitment ?? "finalized",
      }),
    },
    args.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    "/receipt/v1",
  );
  if (!res.ok) throw new Error(`/receipt/v1 returned HTTP ${res.status}`);
  return (await res.json()) as RavenReceipt;
};
