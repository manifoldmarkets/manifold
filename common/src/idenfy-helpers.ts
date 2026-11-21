// Pure-logic helpers for processing iDenfy verification webhooks.
// Lives in common/ so we can unit-test it without spinning up the API package.

// Narrowest possible input shape — accepts the full IdenfyCallbackPayload
// from the API package OR a hand-built minimal object from tests.
type UnderageDetectionInput = {
  data?: { docDob?: string | null } | null
  status?: {
    denyReasons?: string[] | null
    suspicionReasons?: string[] | null
  } | null
}

// Anchored regexes for reason strings. Word boundaries ensure substrings like
// "AGE" don't match "ID-VERIFIED" or other unrelated tokens. Defensive-match
// the GIDX codes (ID-UA18, ID-UA19) too in case both providers' reasons land
// in the same field someday.
const AGE_REASON_PATTERNS: RegExp[] = [
  /\bUNDER\s*18\b/,
  /\bUNDERAGE\b/,
  /\bMINOR\b/,
  /\bUNDER[\s-]?AGE\b/,
  /\bAGE[\s_-]?(?:LIMIT|FAIL|RESTRICT|MIN|REQUIREMENT)/,
  /\bID-UA1[89]\b/,
]

// Detect whether a DENIED/SUSPECTED iDenfy result is specifically due to the
// user being under the legal age (18+). Strategies, in order:
//   1. Parse docDob if present and compute current age.
//   2. Scan denyReasons / suspicionReasons against age-keyword regexes.
// Returns false if we can't determine — better to block both bonus and
// sweepstakes sides than to accidentally let a fraudster receive mana
// bonuses by misclassifying a non-age denial as "just underage".
//
// `now` is overridable for testing; defaults to Date.now().
export function isUnderageDenial(
  payload: UnderageDetectionInput,
  now: number = Date.now()
): boolean {
  const dob = payload.data?.docDob
  if (dob) {
    const dobMs = Date.parse(dob)
    if (Number.isFinite(dobMs)) {
      const ageMs = now - dobMs
      const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000)
      if (Number.isFinite(ageYears) && ageYears < 18) {
        return true
      }
    }
  }

  const reasons = [
    ...(payload.status?.denyReasons ?? []),
    ...(payload.status?.suspicionReasons ?? []),
  ]
    .filter(Boolean)
    .map((r) => r.toUpperCase())

  return reasons.some((r) => AGE_REASON_PATTERNS.some((p) => p.test(r)))
}
