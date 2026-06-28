# Evidence, not verdicts — the presentation discipline

This is the rule that makes the integration trustworthy and liability-safe. It is
enforced in code (the verifier rejects receipts containing the forbidden words)
and **must** be respected in every UI string, log line, and agent message.

## The principle

A Raven receipt reports **observed on-chain facts within a stated scope at a
stated slot**. It does **not** judge a token. There is no safe/unsafe rating, no
risk score, no buy/sell call. The app or agent applies *its own* policy to the
facts and owns the decision.

Why this matters:
- A "safe/unsafe" label is an opinion you can't sign for — it would make your
  integration liable for an outcome it can't control.
- Facts + explicit coverage gaps are *defensible*: "here is what was observed,
  here is what wasn't, verify it yourself." That is a stronger, more honest UX.

## Forbidden language (never emit, anywhere)

`safe` · `unsafe` · `legit` · `scam-free` · `approved` · `guaranteed`
— and never "prevents rugs", "risk score", or any buy/sell recommendation.

The **only** acceptable use of those words is to state that Raven does **not** make
them, e.g. *"This is signed evidence, not a safe/unsafe verdict."* The bundled
verifier fails any receipt whose signed fields contain them — mirror that in your
own copy.

## Allowed framing

- "Observed on-chain facts (signature verified)."
- "Checks performed / not performed (coverage gaps)."
- "At slot N — a point-in-time, replayable receipt."
- "Apply your own policy to this evidence."
- "Verify this receipt yourself against Raven's published key."

## Showing it to a user (good vs bad)

**Bad:** `⚠️ This token is UNSAFE (mint authority active)`
**Good:** `Observed: mint authority is active. Not evaluated: liquidity, top holders. Signature verified. You decide.`

**Bad:** `✅ Approved by Raven`
**Good:** `Raven receipt verified (signed by Raven's published key). Evidence, not a verdict.`

## For autonomous agents

- Reason over `findings` / `coverageGaps` internally, then state the **action** you
  took and the **evidence** behind it — not a safety claim.
- When you hand a user a result, include the `receiptId` and how to verify it.
- If `coverageGaps` is non-empty, say so plainly. Do not imply completeness.
- If you can't verify a receipt (`valid: false`), do not act on its contents.

## One sentence to reuse

> Raven returns a production-signed, scope-bounded receipt of observed on-chain
> facts. It does not make trading calls or safety judgments; the agent or app
> applies its own policy.
