import * as fs from 'fs'
import { runScript } from 'run-script'
import { revalidateContractStaticProps } from 'shared/utils'

const DELETOR_ID = 'AJwLWoo3xue32XIiAVrL5SyR1WB2' // Ian's user id

if (require.main === module) {
  runScript(async ({ pg }) => {
    // Read the spam comments CSV
    const csvPath = process.argv[2] || 'spam-comments.csv'

    if (!fs.existsSync(csvPath)) {
      console.error(`CSV file not found: ${csvPath}`)
      process.exit(1)
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8')
    const lines = csvContent.split('\n').filter((line) => line.trim())

    // Skip header row and extract comment IDs
    const commentIds = lines
      .slice(1)
      .map((line) => {
        // Parse CSV - comment_id is the first column
        const match = line.match(/^"([^"]+)"/)
        return match ? match[1] : null
      })
      .filter(Boolean) as string[]

    console.log(`Found ${commentIds.length} spam comments to delete.`)

    if (commentIds.length === 0) {
      console.log('No comments to delete.')
      return
    }

    // Get contract info for revalidation before deleting
    const affectedContracts = await pg.manyOrNone<{
      slug: string
      creatorUsername: string
    }>(
      `select distinct c.slug, c.data->>'creatorUsername' as "creatorUsername"
       from contract_comments cc
       join contracts c on c.id = cc.contract_id
       where cc.comment_id = any($1)`,
      [commentIds]
    )

    console.log(
      `These comments span ${affectedContracts.length} unique contracts.`
    )

    // Delete comments in batches
    const batchSize = 100
    let deletedCount = 0
    const now = Date.now()

    for (let i = 0; i < commentIds.length; i += batchSize) {
      const batch = commentIds.slice(i, i + batchSize)

      await pg.none(
        `update contract_comments
         set data = data
           || jsonb_build_object('deleted', true)
           || jsonb_build_object('deletedTime', to_jsonb($2::bigint))
           || jsonb_build_object('deleterId', to_jsonb($3::text))
         where comment_id = any($1)`,
        [batch, now, DELETOR_ID]
      )

      deletedCount += batch.length
      console.log(`Deleted ${deletedCount}/${commentIds.length} comments...`)
    }

    console.log(`\nDeleted ${deletedCount} spam comments.`)

    // Revalidate affected contracts
    console.log(`\nRevalidating ${affectedContracts.length} contracts...`)
    let revalidatedCount = 0

    for (const contract of affectedContracts) {
      try {
        await revalidateContractStaticProps(contract)
        revalidatedCount++
        if (
          revalidatedCount % 10 === 0 ||
          revalidatedCount === affectedContracts.length
        ) {
          console.log(
            `Revalidated ${revalidatedCount}/${affectedContracts.length} contracts`
          )
        }
      } catch (e) {
        console.error(
          `Error revalidating ${contract.creatorUsername}/${contract.slug}: ${e}`
        )
      }
    }

    console.log(`\n=== Summary ===`)
    console.log(`Comments deleted: ${deletedCount}`)
    console.log(`Contracts revalidated: ${revalidatedCount}`)
  })
}
