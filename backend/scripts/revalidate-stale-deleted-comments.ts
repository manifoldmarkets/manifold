import { runScript } from 'run-script'
import { revalidateContractStaticProps } from 'shared/utils'

if (require.main === module) {
  runScript(async ({ pg }) => {
    // Find contracts with deleted comments where no bets or other comments
    // have been placed after the comment's deletedTime
    const contractsToRevalidate = await pg.manyOrNone<{
      slug: string
      creatorUsername: string
    }>(
      `with deleted_comments as (
        select
          cc.contract_id,
          max((cc.data->>'deletedTime')::bigint) as latest_deleted_time
        from contract_comments cc
        where (cc.data->>'deleted')::boolean = true
        group by cc.contract_id
      )
      select distinct c.slug, c.data->>'creatorUsername' as "creatorUsername"
      from deleted_comments dc
      join contracts c on c.id = dc.contract_id
      where
        -- No bets after the deletion
        (c.last_bet_time is null or c.last_bet_time < to_timestamp(dc.latest_deleted_time / 1000.0))
        -- No comments after the deletion
        and (c.last_comment_time is null or c.last_comment_time < to_timestamp(dc.latest_deleted_time / 1000.0))`
    )

    console.log(
      `Found ${contractsToRevalidate.length} contracts with stale deleted comments to revalidate.`
    )

    let i = 0
    for (const contract of contractsToRevalidate) {
      try {
        await revalidateContractStaticProps(contract)
        i++
        if (i % 10 === 0 || i === contractsToRevalidate.length) {
          console.log(`Revalidated ${i} of ${contractsToRevalidate.length}`)
        }
      } catch (e) {
        console.error(
          `Error revalidating ${contract.creatorUsername}/${contract.slug}: ${e}`
        )
      }
    }

    console.log(`Done. Revalidated ${i} contracts.`)
  })
}
