import { Contract } from 'common/contract'
import { isEligibleRelatedMarket } from 'common/related-markets'
import { convertContract } from 'common/supabase/contracts'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { contractColumnsToSelectWithPrefix } from 'shared/utils'

/** Helpers shared by the story matcher and the claim reader. */

export type Candidate = { contract: Contract; similarity: number }

/** Below this no market is worth asking the verifier about. */
const CANDIDATE_FLOOR = 0.35

/** The nearest open, public, unresolved markets to an embedding. */
export async function findCandidateMarkets(
  pg: SupabaseDirectClient,
  embedding: number[],
  limit: number
): Promise<Candidate[]> {
  const rows = await pg.tx(async (t) => {
    // The HNSW scan returns at most ef_search rows before the join filters
    // closed and unlisted markets out, so widen it.
    await t.none('set local hnsw.ef_search = 300')
    return t.map(
      `select ${contractColumnsToSelectWithPrefix('c')},
              1 - (ce.embedding <=> $1::vector) as similarity
       from contract_embeddings ce
       join contracts c on c.id = ce.contract_id
       where c.resolution_time is null
         and c.visibility = 'public'
         and c.deleted = false
         and c.close_time > now()
         and c.outcome_type in ('BINARY', 'MULTIPLE_CHOICE', 'PSEUDO_NUMERIC', 'NUMBER', 'MULTI_NUMERIC', 'DATE')
       order by ce.embedding <=> $1::vector
       limit $2`,
      [JSON.stringify(embedding), limit],
      (r) => ({
        contract: convertContract(r) as Contract,
        similarity: Number(r.similarity),
      })
    )
  })
  return rows.filter(
    (r) =>
      Number.isFinite(r.similarity) &&
      r.similarity >= CANDIDATE_FLOOR &&
      isEligibleRelatedMarket(r.contract)
  )
}

/** A market's price in words, for prompts. */
export const describePrice = (c: Contract) => {
  if (c.outcomeType === 'BINARY' && 'prob' in c && Number.isFinite(c.prob))
    return `${Math.round(c.prob * 100)}% yes`
  if ('answers' in c && Array.isArray(c.answers) && c.answers.length > 0) {
    const top = [...c.answers].sort((a, b) => b.prob - a.prob)[0]
    return `top answer "${top.text}" ${Math.round(top.prob * 100)}%`
  }
  return c.outcomeType.toLowerCase()
}

export const describeMarket = (c: Contract) =>
  `id=${c.id} | ${c.question} | closes ${
    c.closeTime ? new Date(c.closeTime).toISOString().slice(0, 10) : 'n/a'
  } | ${describePrice(c)}`

/** Resolves undefined when the promise takes longer than `ms`. */
export const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([
    p,
    new Promise<undefined>((resolve) =>
      setTimeout(() => resolve(undefined), ms)
    ),
  ])

export const cosine = (a: number[], b: number[]) => {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom > 0 ? dot / denom : 0
}
