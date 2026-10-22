import { runScript } from 'run-script'
import { GROUP_SCORE_PRIOR } from 'common/feed'

/**
 * Before/after for the niche-blend change to getForYouSQL.
 *
 * Ranks every open market twice for a sample of real users — once with the
 * old avg(score^4) aggregation, once with the 0.7·max + 0.3·avg blend the
 * feed already uses — and reports how much of the top 20 moves.
 *
 * Approximates the ranking rather than reproducing it: reads topic scores
 * straight from get_user_topic_interests_2 rather than the in-memory cache,
 * so followed-topic boosts, blocked topics and the followed-creator
 * multiplier are not applied. Good enough to see the shape of the change,
 * not a substitute for watching it in prod.
 *
 * Usage:
 *   ts-node compare-for-you-ranking.ts [username ...]
 * With no arguments, samples the most recently scored users.
 */

const TOP_N = 20
const DEFAULT_SAMPLE_SIZE = 5
// Cuts ~34k open markets to the few thousand that could plausibly rank, so
// the double ranking stays a single fast query per user.
const MIN_IMPORTANCE = 0.2

const rankingSql = `
  with uti as (
    select group_id, score from get_user_topic_interests_2($1)
  ),
  cand as (
    select c.id,
           c.question,
           count(gc.group_id) as n_tags,
           case when bool_or(uti.score is not null)
             then avg(power(coalesce(uti.score, $2), 4) * c.importance_score)
             else avg(c.importance_score * $2)
           end as old_rank,
           case when bool_or(uti.score is not null)
             then power(0.7 * max(coalesce(uti.score, $2))
                    + 0.3 * avg(coalesce(uti.score, $2)), 4)
                  * avg(c.importance_score)
             else avg(c.importance_score * $2)
           end as new_rank
    from contracts c
    join group_contracts gc on gc.contract_id = c.id
    left join uti on uti.group_id = gc.group_id
    where c.resolution_time is null
      and (c.close_time > now() or c.close_time is null)
      and c.visibility = 'public'
      and c.deleted = false
      and c.token = 'MANA'
      and c.outcome_type not in ('STONK', 'BOUNTIED_QUESTION')
      and c.importance_score > $3
    group by c.id
  )
  select id, question, n_tags,
         row_number() over (order by old_rank desc) as old_pos,
         row_number() over (order by new_rank desc) as new_pos
  from cand
`

type Row = {
  id: string
  question: string
  n_tags: number
  old_pos: number
  new_pos: number
}

if (require.main === module) {
  runScript(async ({ pg }) => {
    const requested = process.argv.slice(2)

    const users = requested.length
      ? await pg.map(
          `select id, username from users where username in ($1:list)`,
          [requested],
          (r) => ({ id: r.id as string, username: r.username as string })
        )
      : await pg.map(
          `select u.id, u.username
           from user_topic_interests uti
           join users u on u.id = uti.user_id
           where uti.created_time = (select max(created_time) from user_topic_interests)
           order by random()
           limit $1`,
          [DEFAULT_SAMPLE_SIZE],
          (r) => ({ id: r.id as string, username: r.username as string })
        )

    if (!users.length) {
      console.log('No users found.')
      return
    }

    for (const user of users) {
      const rows = await pg.map<Row>(
        rankingSql,
        [user.id, GROUP_SCORE_PRIOR, MIN_IMPORTANCE],
        (r) => ({
          id: r.id,
          question: r.question,
          n_tags: Number(r.n_tags),
          old_pos: Number(r.old_pos),
          new_pos: Number(r.new_pos),
        })
      )

      const oldTop = rows.filter((r) => r.old_pos <= TOP_N)
      const newTop = rows.filter((r) => r.new_pos <= TOP_N)
      const oldIds = new Set(oldTop.map((r) => r.id))
      const promoted = newTop
        .filter((r) => !oldIds.has(r.id))
        .sort((a, b) => a.new_pos - b.new_pos)

      const avgTags = (rs: Row[]) =>
        rs.length
          ? (rs.reduce((s, r) => s + r.n_tags, 0) / rs.length).toFixed(2)
          : 'n/a'

      console.log(`\n=== ${user.username} (${rows.length} candidates) ===`)
      console.log(
        `top ${TOP_N}: ${TOP_N - promoted.length} unchanged, ${
          promoted.length
        } new` + ` | avg tags ${avgTags(oldTop)} -> ${avgTags(newTop)}`
      )
      for (const r of promoted) {
        console.log(
          `  #${String(r.new_pos).padStart(2)} (was #${r.old_pos}, ${
            r.n_tags
          } tags) ${r.question.slice(0, 80)}`
        )
      }
    }
  })
}
