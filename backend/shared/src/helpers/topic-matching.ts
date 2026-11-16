import { Contract } from 'common/contract'
import { TOPIC_IDS_YOU_CANT_FOLLOW } from 'common/supabase/groups'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { addGroupToContract } from 'shared/update-group-contracts-internal'

// Unsupervised tag attachment for API-created markets without groupIds.
// Differs from get-similar-groups-to-contract.ts (the web-UI suggester):
// pure-distance ranking, no importance-score floor, tighter threshold —
// surfaces niche tags like Mining/Metals/Commodities rather than the
// broad generics the importance-weighted formula favours.

export const NICHE_TOPIC_SIMILARITY_THRESHOLD = 0.42
export const NICHE_AUTOTAG_LIMIT = 3

// Kill switch for tagging markets created through the API without groupIds.
// Without topics such markets never reach For You for users with topic
// interests. Backfill older ones with backend/scripts/backfill-niche-topics.ts.
export const AUTO_TAG_API_MARKET_CREATIONS = true

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
  // A user-made public topic, unrelated to UNRANKED_GROUP_ID, whose name
  // would read as a moderation label on an auto-tagged market.
  'unranked',
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
       -- addGroupToContract unranks or unsubsidizes a market added to these.
       -- They are curated today; keep them out even if that ever changes.
       and g.id not in ($5:list)
       -- Block calendar buckets ('2026', 'august-2025', 'q1-2024') while
       -- preserving event-year tags ('election-2024', 'world-cup-2026').
       and g.slug !~ '^[0-9]{4}$'
       and g.slug !~* '^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december|q[1-4])-(19|20)[0-9]{2}$'
     order by (ge.embedding <=> (select emb from target)) asc
     limit $4`,
    [
      contractId,
      threshold,
      NICHE_TAG_BLOCKLIST,
      limit,
      TOPIC_IDS_YOU_CANT_FOLLOW,
    ],
    (r: { id: string; slug: string; distance: string }) => ({
      id: r.id,
      slug: r.slug,
      distance: Number(r.distance),
    })
  )
}

// Tags a market that has no topics with its niche matches; returns the topics
// added. Matching runs outside the transaction because a cold group_embeddings
// scan can take seconds. The writes then run in one transaction that first
// re-checks, holding the market's row lock, that it is still public, not
// deleted and still without topics, so a market tagged or unlisted meanwhile
// is left alone and a failure part-way leaves no half-written topic.
// Pass userId to attribute the additions (e.g. a backfill) to that account.
export async function autoTagUntaggedContract(
  pg: SupabaseDirectClient,
  contract: Contract,
  userId?: string
) {
  if (contract.outcomeType === 'STONK' || contract.outcomeType === 'POLL')
    return []
  const matches = await getNicheTopicMatchesForContract(pg, contract.id)
  if (matches.length === 0) return []
  return pg.tx(async (tx) => {
    const eligible = await tx.oneOrNone(
      `select 1 from contracts c
       where c.id = $1
         and c.visibility = 'public'
         and coalesce((c.data->>'deleted')::boolean, false) = false
         and not exists (
           select 1 from group_contracts gc where gc.contract_id = c.id
         )
       for update`,
      [contract.id]
    )
    if (!eligible) return []
    for (const match of matches) {
      await addGroupToContract(
        tx,
        contract,
        { id: match.id, slug: match.slug },
        userId
      )
    }
    return matches
  })
}
