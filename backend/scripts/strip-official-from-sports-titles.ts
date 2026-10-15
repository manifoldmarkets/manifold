import { runScript } from 'run-script'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { LEGACY_OFFICIAL_SUFFIX } from 'common/sports-league-label'
import { updateContract } from 'shared/supabase/contracts'
import { revalidateContractStaticProps } from 'shared/utils'

// The Odds API pipeline used to end every game market's title with
// " [official]". A league label in front of the title says that now, so this
// takes the suffix off the titles it already wrote. Only @ManifoldSports's
// Odds API game markets whose title still ends with it are touched.
//
// Dry-runs by default (prints each title change). Pass --commit to write.
// Safe to re-run: a title without the suffix no longer matches.

const commit = process.argv.includes('--commit')

runScript(async ({ pg }) => {
  const rows = await pg.manyOrNone<{
    id: string
    slug: string
    creator_username: string
    question: string
  }>(
    `select id, slug, data->>'creatorUsername' as creator_username, question
     from contracts
     where creator_id = any($1)
       and data->>'sportsEventId' like 'odds:%'
       and right(question, $2) = $3
     order by created_time`,
    [
      MANIFOLD_SPORTS_USER_IDS,
      LEGACY_OFFICIAL_SUFFIX.length,
      LEGACY_OFFICIAL_SUFFIX,
    ]
  )

  for (const row of rows) {
    const question = row.question.slice(0, -LEGACY_OFFICIAL_SUFFIX.length)
    console.log(
      `${commit ? 'retitle' : 'would retitle'} ${row.id}: ${question}`
    )
    if (!commit) continue
    await updateContract(pg, row.id, { question })
    try {
      await revalidateContractStaticProps({
        creatorUsername: row.creator_username,
        slug: row.slug,
      })
    } catch (e) {
      console.log(
        `revalidate ${row.slug} failed: ${
          e instanceof Error ? e.message : String(e)
        }`
      )
    }
  }

  console.log(
    commit
      ? `\nRetitled ${rows.length} markets.`
      : `\n${rows.length} markets to retitle. Re-run with --commit to write.`
  )
})
