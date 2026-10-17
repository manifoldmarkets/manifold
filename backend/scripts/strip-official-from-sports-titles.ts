import { runScript } from 'run-script'
import { MANIFOLD_SPORTS_USER_IDS, WORLD_CUP_2026 } from 'common/sports'
import { LEGACY_OFFICIAL_SUFFIX } from 'common/sports-league-label'
import { updateContract } from 'shared/supabase/contracts'
import { revalidateContractStaticProps } from 'shared/utils'

// A league label in front of an official game market's title now says what
// two old title tags said, so this takes them off the titles already written:
// - " [official]", which the Odds API pipeline ended every game title with;
// - " [World Cup '26]", which the football-data pipeline ended World Cup
//   titles with (the label reads WC26).
// Only @ManifoldSports's markets that get the label are touched, and only
// while the title still ends with the tag.
//
// Dry-runs by default (prints each title change). Pass --commit to write.
// Safe to re-run: a title without the tag no longer matches.

const commit = process.argv.includes('--commit')

// `where` may use $4 onwards, filled from `values`.
const TAGS: { suffix: string; where: string; values: string[] }[] = [
  {
    suffix: LEGACY_OFFICIAL_SUFFIX,
    where: `data->>'sportsEventId' like 'odds:%'`,
    values: [],
  },
  {
    suffix: ` [${WORLD_CUP_2026.shortLabel}]`,
    where: `data->>'sportsEventId' not like 'odds:%'
       and data->>'sportsLeague' = $4`,
    values: [WORLD_CUP_2026.sportsLeague],
  },
]

runScript(async ({ pg }) => {
  let total = 0
  for (const tag of TAGS) {
    const rows = await pg.manyOrNone<{
      id: string
      slug: string
      creator_username: string
      question: string
    }>(
      `select id, slug, data->>'creatorUsername' as creator_username, question
       from contracts
       where creator_id = any($1)
         and ${tag.where}
         and right(question, $2) = $3
       order by created_time`,
      [MANIFOLD_SPORTS_USER_IDS, tag.suffix.length, tag.suffix, ...tag.values]
    )
    console.log(`\n"${tag.suffix.trim()}": ${rows.length} markets`)
    total += rows.length

    for (const row of rows) {
      const question = row.question.slice(0, -tag.suffix.length)
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
  }

  console.log(
    commit
      ? `\nRetitled ${total} markets.`
      : `\n${total} markets to retitle. Re-run with --commit to write.`
  )
})
