import {
  PERP_SUGGESTION_NAME_MAX,
  PERP_SUGGESTION_NAME_MIN,
  PERP_SUGGESTION_SOURCE_MAX,
  PERP_SUGGESTIONS_PER_DAY,
  PerpSuggestion,
} from 'common/perps/suggestion'
import { isAdminId, isModId } from 'common/envs/constants'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'
import { onlyUsersWhoCanPerformAction } from './helpers/rate-limit'

const isModOrAdmin = (userId: string) => isModId(userId) || isAdminId(userId)

// $1 is always the viewer's uid ('' when signed out) so has_voted resolves in
// the same query as the list.
const SELECT_SUGGESTION = `
  select s.id, s.user_id, s.name, s.data_source, s.created_time, s.hidden,
    (select count(*) from perp_suggestion_votes v
      where v.suggestion_id = s.id)::int as votes,
    exists (select 1 from perp_suggestion_votes v
      where v.suggestion_id = s.id and v.user_id = $1) as has_voted
  from perp_suggestions s`

type SuggestionRow = {
  id: string | number
  user_id: string
  name: string
  data_source: string | null
  created_time: string | Date
  votes: number
  has_voted: boolean
  hidden: boolean
}

const toSuggestion = (r: SuggestionRow): PerpSuggestion => ({
  id: Number(r.id),
  userId: r.user_id,
  name: r.name,
  dataSource: r.data_source ?? null,
  createdTime: new Date(r.created_time).getTime(),
  votes: r.votes,
  hasVoted: r.has_voted,
  hidden: r.hidden,
})

export const getPerpSuggestions: APIHandler<'get-perp-suggestions'> = async (
  props,
  auth
) => {
  const pg = createSupabaseDirectClient()
  // Only a mod or admin can ask past the filter. For anyone else the flag is
  // ignored rather than refused: no response should reveal that a moderated
  // row exists at all.
  const canSeeHidden = !!props.includeHidden && !!auth && isModOrAdmin(auth.uid)
  return pg.map(
    `${SELECT_SUGGESTION}
     ${canSeeHidden ? '' : 'where not s.hidden'}
     order by s.hidden, votes desc, s.created_time desc
     limit $2`,
    [auth?.uid ?? '', props.limit ?? 50],
    toSuggestion
  )
}

// Both writes are user-generated content: the standard posting gate (deleted
// account, active posting ban) applies before anything else runs.
export const createPerpSuggestion: APIHandler<'create-perp-suggestion'> =
  onlyUsersWhoCanPerformAction('post', async (props, auth) => {
    const name = props.name.trim().replace(/\s+/g, ' ')
    if (
      name.length < PERP_SUGGESTION_NAME_MIN ||
      name.length > PERP_SUGGESTION_NAME_MAX
    ) {
      throw new APIError(
        400,
        `Name must be ${PERP_SUGGESTION_NAME_MIN}–${PERP_SUGGESTION_NAME_MAX} characters`
      )
    }
    const dataSource = props.dataSource?.trim() || null
    if (dataSource && dataSource.length > PERP_SUGGESTION_SOURCE_MAX) {
      throw new APIError(
        400,
        `Data source must be at most ${PERP_SUGGESTION_SOURCE_MAX} characters`
      )
    }

    const pg = createSupabaseDirectClient()
    // A repeat of an existing name (case-insensitive) counts as an upvote on
    // it rather than a duplicate; the creator's own upvote is implied either
    // way. The unique index makes the insert race-safe. The daily quota is
    // counted INSIDE the transaction behind a per-user advisory lock, so N
    // concurrent distinct submissions serialize and the (N+1)th is refused
    // instead of all of them slipping past a stale count.
    const id = await pg.tx(async (tx) => {
      await tx.one(`select pg_advisory_xact_lock(hashtext($1))`, [
        `perp-suggestion:${auth.uid}`,
      ])
      const recent = await tx.one<number>(
        `select count(*)::int as n from perp_suggestions
       where user_id = $1 and created_time > now() - interval '1 day'`,
        [auth.uid],
        (r) => r.n
      )
      // Matches hidden rows too, deliberately: a name a mod moderated out
      // stays out, and re-suggesting it resolves to that row instead of
      // announcing to the submitter that their idea was moderated.
      const existing = await tx.oneOrNone<number | null>(
        `select id from perp_suggestions where lower(name) = lower($1)`,
        [name],
        (r) => (r ? Number(r.id) : null)
      )
      // Upvoting an existing name creates nothing, so it never counts.
      if (existing == null && recent >= PERP_SUGGESTIONS_PER_DAY) {
        throw new APIError(
          429,
          `You can suggest up to ${PERP_SUGGESTIONS_PER_DAY} markets a day — try again tomorrow`
        )
      }
      const id =
        existing ??
        (await tx.one<number>(
          `insert into perp_suggestions (user_id, name, data_source)
         values ($1, $2, $3)
         on conflict (lower(name)) do update set name = perp_suggestions.name
         returning id`,
          [auth.uid, name, dataSource],
          (r) => Number(r.id)
        ))
      await tx.none(
        `insert into perp_suggestion_votes (suggestion_id, user_id)
       values ($1, $2) on conflict do nothing`,
        [id, auth.uid]
      )
      return id
    })

    return pg.one(
      `${SELECT_SUGGESTION} where s.id = $2`,
      [auth.uid, id],
      toSuggestion
    )
  })

export const votePerpSuggestion: APIHandler<'vote-perp-suggestion'> =
  onlyUsersWhoCanPerformAction('post', async (props, auth) => {
    const { suggestionId, remove } = props
    const pg = createSupabaseDirectClient()
    const exists = await pg.oneOrNone(
      `select 1 from perp_suggestions where id = $1 and not hidden`,
      [suggestionId]
    )
    if (!exists) throw new APIError(404, 'Suggestion not found')

    if (remove) {
      await pg.none(
        `delete from perp_suggestion_votes
       where suggestion_id = $1 and user_id = $2`,
        [suggestionId, auth.uid]
      )
    } else {
      await pg.none(
        `insert into perp_suggestion_votes (suggestion_id, user_id)
       values ($1, $2) on conflict do nothing`,
        [suggestionId, auth.uid]
      )
    }
    const votes = await pg.one<number>(
      `select count(*)::int as n from perp_suggestion_votes
     where suggestion_id = $1`,
      [suggestionId],
      (r) => r.n
    )
    return { votes }
  })

// Moderation. Hiding flags the row rather than deleting it, so the votes
// survive and an accidental hide is one click to undo. Wrapped in the same
// action gate as the other moderation endpoints (a marketControl ban takes
// the ability away).
export const hidePerpSuggestion: APIHandler<'hide-perp-suggestion'> =
  onlyUsersWhoCanPerformAction('hidePerpSuggestion', async (props, auth) => {
    if (!isModOrAdmin(auth.uid)) {
      throw new APIError(403, 'Only mods and admins can hide suggestions')
    }
    const hide = props.hide ?? true
    const pg = createSupabaseDirectClient()
    const hidden = await pg.oneOrNone<boolean | null>(
      `update perp_suggestions set hidden = $2 where id = $1
       returning hidden`,
      [props.suggestionId, hide],
      (r) => (r ? (r.hidden as boolean) : null)
    )
    if (hidden === null) throw new APIError(404, 'Suggestion not found')
    return { hidden }
  })
