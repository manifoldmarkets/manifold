// One-shot repair for contracts whose data->groupSlugs contains json nulls.
// admin-sports-create-markets selected only `id` from groups before passing
// the row to addGroupToContract, so each group add appended `undefined`
// (serialized as json null) instead of the slug. That broke blocked-topic
// filtering: the client hides feed markets via contract.groupSlugs, and
// these markets matched no blocked slug despite being in blocked groups
// (e.g. ManifoldSports soccer markets shown to users who blocked Soccer).
//
// Rebuilds groupSlugs from the group_contracts table (the source of truth).
// The contracts_populate trigger re-derives the native group_slugs column
// from the updated data, so a single data update fixes both.

import { runScript } from 'run-script'

const DRY_RUN = process.env.DRY_RUN !== 'false'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const affected = await pg.manyOrNone<{
      id: string
      question: string
      group_slugs: string[] | null
      correct_slugs: string[]
    }>(
      `select c.id,
              c.data->>'question' as question,
              c.group_slugs,
              coalesce(
                (select array_agg(distinct g.slug)
                 from group_contracts gc
                 join groups g on g.id = gc.group_id
                 where gc.contract_id = c.id),
                '{}'
              ) as correct_slugs
       from contracts c
       where c.data->'groupSlugs' @> '[null]'::jsonb`
    )
    console.log(`Found ${affected.length} contracts with null groupSlugs`)
    for (const c of affected) {
      console.log(
        `${c.id} | ${c.question} | ${JSON.stringify(
          c.group_slugs
        )} -> ${JSON.stringify(c.correct_slugs)}`
      )
    }

    if (DRY_RUN) {
      console.log('DRY_RUN=true — no updates written. Set DRY_RUN=false to apply.')
      return
    }

    const updated = await pg.result(
      `update contracts c
       set data = jsonb_set(
         c.data,
         '{groupSlugs}',
         coalesce(
           (select jsonb_agg(distinct g.slug)
            from group_contracts gc
            join groups g on g.id = gc.group_id
            where gc.contract_id = c.id),
           '[]'::jsonb
         )
       )
       where c.data->'groupSlugs' @> '[null]'::jsonb`
    )
    console.log(`Updated ${updated.rowCount} contracts`)
  })
}
