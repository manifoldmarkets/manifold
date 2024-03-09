import { mergeGroups } from 'merge-groups'
import { runScript } from 'run-script'
import { SupabaseDirectClient } from 'shared/supabase/init'

const findDupeNames = async (pg: SupabaseDirectClient, firestore: any) => {
  const dupeNames = await pg.manyOrNone<{
    name: string
    slug: string
    id: string
    importance_score: number
    rank: number
  }>(
    `SELECT
        name, slug, id, importance_score,
        ROW_NUMBER() OVER(PARTITION BY name ORDER BY importance_score DESC, total_members DESC) AS rank
      FROM groups
      WHERE
        privacy_status = 'public'
        and name in (
          select name
            from groups
            where privacy_status = 'public'
            group by name
            having count(*) > 1
        )`
  )

  let top = dupeNames[0]
  for (const group of dupeNames) {
    if (group.rank == 1) {
      top = group
    } else if (group.name == top.name) {
      console.log('merge', group.slug, top.slug)
      await mergeGroups(pg, firestore, group.slug, top.slug)
    }
  }
}

if (require.main === module) {
  runScript(async ({ pg, firestore }) => {
    await findDupeNames(pg, firestore)
  })
}
