import { runScript } from 'run-script'
import { HOUSE_LIQUIDITY_PROVIDER_ID } from 'common/antes'
import {
  autoTagUntaggedContract,
  getNicheTopicMatchesForContract,
} from 'shared/helpers/topic-matching'
import { getContractsDirect } from 'shared/supabase/contracts'

// Gives topics to a creator's public markets that have none, using the same
// matcher that tags API-created markets at creation. Markets without topics
// never reach For You for users with topic interests. Prints the plan; pass
// --apply to write it. Markets the matcher finds nothing for are left alone.
// Writes go through autoTagUntaggedContract: one transaction per market that
// re-checks the market is still public, not deleted and untagged, and records
// the additions as made by the house account rather than the creator.
//
//   npx ts-node backfill-niche-topics.ts --creator=<userId> [--apply]

if (require.main === module) {
  runScript(async ({ pg }) => {
    const apply = process.argv.includes('--apply')
    const creatorIds = process.argv
      .filter((arg) => arg.startsWith('--creator='))
      .flatMap((arg) => arg.slice('--creator='.length).split(','))
      .filter((id) => id.length > 0)
    if (creatorIds.length === 0)
      throw new Error('Pass --creator=<userId> (comma-separate several)')

    const ids = await pg.map(
      `select c.id from contracts c
       where c.creator_id = any($1)
         and c.visibility = 'public'
         and coalesce((c.data->>'deleted')::boolean, false) = false
         and c.outcome_type not in ('STONK', 'POLL')
         and not exists (
           select 1 from group_contracts gc where gc.contract_id = c.id
         )
       order by c.created_time`,
      [creatorIds],
      (r: { id: string }) => r.id
    )
    const contracts = await getContractsDirect(ids, pg)

    let tagged = 0
    let tags = 0
    const perTopic = new Map<string, number>()
    for (const contract of contracts) {
      const matches = apply
        ? await autoTagUntaggedContract(
            pg,
            contract,
            HOUSE_LIQUIDITY_PROVIDER_ID
          )
        : await getNicheTopicMatchesForContract(pg, contract.id)
      const label = contract.question.slice(0, 90)
      if (matches.length === 0) {
        console.log(`none  ${contract.id}  ${label}`)
        continue
      }
      tagged++
      tags += matches.length
      for (const m of matches)
        perTopic.set(m.slug, (perTopic.get(m.slug) ?? 0) + 1)
      console.log(
        `${apply ? 'write' : 'plan '} ${contract.id}  ${label}  -> ${matches
          .map((m) => `${m.slug} (${m.distance.toFixed(3)})`)
          .join(', ')}`
      )
    }

    const topTopics = [...perTopic.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([slug, n]) => `${slug} ${n}`)
      .join(', ')
    console.log(`topics used: ${topTopics}`)
    console.log(
      `${tagged} of ${contracts.length} untagged markets ${
        apply ? 'tagged' : 'would be tagged; pass --apply to write'
      } (${tags} topic links)`
    )
  })
}
