import { createHash } from 'crypto'
import { Contract } from 'common/contract'

type FilterCandidate = Pick<Contract, 'id' | 'question'>

/** The verdict depends on the titles as well as membership. Hash the full
 * input to keep Redis keys bounded, and sort without mutating ranked results.
 * Bump the version when the duplicate-filter prompt or policy changes. */
export const relatedMarketsFilterKey = (
  contractId: string,
  question: string,
  candidates: readonly FilterCandidate[]
) => {
  const titles = candidates.map(({ id, question }) => [id, question]).sort()
  const digest = createHash('sha256')
    .update(JSON.stringify([contractId, question, titles]))
    .digest('hex')
  return `related-markets-filter:v2:${digest}`
}

/** Preserve the existing empty-answer fail-open policy. A nonempty answer is
 * usable only if every ID belongs to this input; never cache malformed output. */
export const isValidRelatedMarketsVerdict = (
  verdict: unknown,
  candidates: readonly FilterCandidate[]
): verdict is string[] => {
  const ids = new Set(candidates.map((candidate) => candidate.id))
  return (
    Array.isArray(verdict) &&
    verdict.length > 0 &&
    verdict.every((id) => typeof id === 'string' && ids.has(id))
  )
}
