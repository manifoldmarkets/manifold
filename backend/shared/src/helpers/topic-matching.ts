import { SupabaseDirectClient } from 'shared/supabase/init'

// Unsupervised tag attachment for API-created markets without groupIds.
// Differs from get-similar-groups-to-contract.ts (the web-UI suggester):
// pure-distance ranking, no importance-score floor, tighter threshold —
// surfaces niche tags like Mining/Metals/Commodities rather than the
// broad generics the importance-weighted formula favours.

export const NICHE_TOPIC_SIMILARITY_THRESHOLD = 0.42
export const NICHE_AUTOTAG_LIMIT = 3

export const AUTO_TAG_API_MARKET_CREATIONS = false

// Topics the embedding model over-triggers on for quantitative content
// (crypto/bitcoin/numbers) or that are dev-only.
const NICHE_TAG_BLOCKLIST = [
  'olivia',
  'nathans-dashboard',
  'tomeks-specials',
  'austin-less-wrong-2023-predictions',
  'fantasy-football-stock-exchange',
  'ancient-markets',
  'spam',
  'test',
  'sf-bay-rationalists',
  'conditional-markets',
  'crypto-speculation',
  'bitcoin',
  'bitcoin-maxi',
  'numbers',
]

export async function getNicheTopicMatchesForContract(
  pg: SupabaseDirectClient,
  contractId: string,
  limit = NICHE_AUTOTAG_LIMIT,
  threshold = NICHE_TOPIC_SIMILARITY_THRESHOLD
): Promise<{ id: string; slug: string; distance: number }[]> {
  return pg.map(
    `with target as (
       select embedding as emb from contract_embeddings where contract_id = $1
     )
     select g.id, g.slug, (ge.embedding <=> (select emb from target)) as distance
     from groups g
     join group_embeddings ge on g.id = ge.group_id
     where (ge.embedding <=> (select emb from target)) < $2
       and g.privacy_status = 'public'
       and g.total_members >= 1
       and g.slug not in ($3:list)
       -- Block calendar buckets ('2026', 'august-2025', 'q1-2024') while
       -- preserving event-year tags ('election-2024', 'world-cup-2026').
       and g.slug !~ '^[0-9]{4}$'
       and g.slug !~* '^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december|q[1-4])-(19|20)[0-9]{2}$'
     order by (ge.embedding <=> (select emb from target)) asc
     limit $4`,
    [contractId, threshold, NICHE_TAG_BLOCKLIST, limit],
    (r: { id: string; slug: string; distance: string }) => ({
      id: r.id,
      slug: r.slug,
      distance: Number(r.distance),
    })
  )
}
