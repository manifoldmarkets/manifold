import { as } from 'pg-promise'
import { ENV_CONFIG, MOD_IDS } from 'common/envs/constants'
import { formatMoney } from 'common/util/format'
import { groupBy } from 'lodash'
import { getActiveSupporterEntitlements } from './supabase/entitlements'
import { createSupabaseDirectClient } from './supabase/init'
import { APIError } from 'common/api/utils'
import { contractPath } from 'common/contract'
import { Notification } from 'common/notification'
import {
  SocialPost,
  SocialPostSource,
  quoteSocialPost,
  isSocialImageUrl,
  socialPostPath,
  socialTimestamp,
  socialTimestampMillis,
} from 'common/social-post'
import { isSupporter } from 'common/supporter'
import { convertContract } from 'common/supabase/contracts'
import { Row } from 'common/supabase/utils'
import { DisplayUser } from 'common/api/user-types'
import { convertEntitlement } from 'common/shop/types'
import { User } from 'common/user'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { richTextToString } from 'common/util/parse'
import {
  SocialRichContent,
  getSocialMentionIds,
  getSocialMarketMentionIds,
  socialRichContentSchema,
  socialRichContentDisplaySchema,
  socialRichContentToText,
  socialUnavailableMentionText,
} from 'common/social-rich-content'
import { SupabaseDirectClient, SupabaseTransaction } from './supabase/init'
import { insertNotificationToSupabase } from './supabase/notifications'
import { getPrivateUser, getUser, log } from './utils'

type DB = SupabaseDirectClient | SupabaseTransaction
export type SocialRow = Omit<
  Row<'social_posts'>,
  'rich_content' | 'canonical_key' | 'feed_visible' | 'hidden_time'
> & {
  rich_content: SocialRichContent | null
  canonical_key?: string | null
  feed_visible?: boolean
  feed_time?: string
  hidden_time?: string | null
  // A market comment shown on Yap that has no post there yet. The row is built
  // from the comment on each read, as the post a copy of it would be, and is
  // not in social_posts. See findPendingCommentPost.
  pending?: boolean
}
// Use the same native moderation predicate for copying, quoting and hydration.
export const visibleMarketComment = (alias: 'cc' | 'parent' | 'original') => `
  not coalesce((${alias}.data->>'deleted')::boolean,false)
  and not coalesce((${alias}.data->>'isModComment')::boolean,false)
  and not coalesce((${alias}.data->>'hiddenOnYap')::boolean,
    coalesce((${alias}.data->>'hidden')::boolean,false)
    and (${alias}.data->>'hiderId' is null or ${alias}.data->>'hiderId'=any(${as.array(
  [...ENV_CONFIG.adminIds, ...MOD_IDS]
)}::text[])
      or ${alias}.data->>'hiderId' is distinct from (select creator_id from contracts where id=${alias}.contract_id)))`

// A market comment that may be shown on Yap and has no post there yet. These
// are the conditions under which ensureMarketCommentPost places a comment, so
// one that is listed or counted can be copied when someone acts on it, and one
// that can never be copied is neither listed nor counted. Not a mod comment,
// not hidden or deleted, on a public market, written by someone who has no
// block with the author of the post it would sit under, of that thread or of
// the market; and not behind one of the reader's own blocks, as a post there
// would not be. It needs cc (the comment), c (its market) and pu (its author's
// private row) in scope. A list also requires the author's account row, which
// a copy needs: see pendingAuthorSql.
//   parentAuthor, threadAuthor: SQL for who wrote the post the comment would
//     sit under, and the first post of that thread.
//   blocked: the placeholder that holds the reader's blocks.
//   uncopied: false when the caller has already found that it has no post.
export const pendingCommentSql = (
  parentAuthor: string,
  threadAuthor: string,
  blocked: string,
  uncopied = true
) => `${visibleMarketComment('cc')}
    and jsonb_typeof(cc.data->'content')='object'
    and c.visibility='public' and not coalesce((c.data->>'deleted')::boolean,false)
    and not (cc.user_id=any(${blocked}::text[]) or ${threadAuthor}=any(${blocked}::text[]))
    and not (coalesce(pu.data->'blockedUserIds','[]'::jsonb) ?| array[${parentAuthor},${threadAuthor},c.creator_id]
      or coalesce(pu.data->'blockedByUserIds','[]'::jsonb) ?| array[${parentAuthor},${threadAuthor},c.creator_id])${
  uncopied
    ? `
    and not exists (select 1 from social_posts copied where copied.market_comment_id=cc.comment_id)`
    : ''
}`

// A copy needs its author's account row, so a list keeps the comments whose
// author has one. One lookup by primary key for the comment asked about:
// written with exists(), or as a join, PostgreSQL can instead choose to read
// the whole users table once per statement.
export const pendingAuthorSql = `coalesce((select true from users author where author.id=cc.user_id limit 1),false)`

// pu for a list: the private row of a comment's author, which holds their
// blocks. The same one lookup by primary key for each comment, for the same
// reason: a list reads a page, and must not read a table to do it.
//   when: SQL for which comments need it.
export const pendingBlocksJoin = (when = '') =>
  `left join lateral (select blocks.data from private_users blocks
      where ${
        when ? `${when} and ` : ''
      }blocks.id=cc.user_id limit 1) pu on true`

// Whether a post that was taken off Yap still has a post under it, and so
// keeps its place in a list. One lookup by parent for the post asked about;
// written with exists(), PostgreSQL can instead read every post's parent once
// per statement.
export const hasChildSql = (alias: string) =>
  `coalesce((select true from social_posts child where child.parent_id=${alias}.id limit 1),false)`

// A post that a list shows under its parent: not hidden, in a thread that is
// not hidden, not taken off Yap unless something still sits under it, and not
// behind one of the reader's blocks. It needs p (the post) and root (the
// first post of its thread) in scope.
//   blocked: the placeholder that holds the reader's blocks.
const shownPostSql = (blocked: string) =>
  `p.hidden_time is null and root.hidden_time is null
    and (p.deleted_time is null or ${hasChildSql('p')})
    and not (p.user_id=any(${blocked}::text[]) or root.user_id=any(${blocked}::text[]))`

// Whether a post is the copy of the comment it is linked to, as
// ensureMarketCommentPost takes it: written by the comment's author, and
// naming no other market as its source. Replies written on the market join
// under a post only if it is. `post` and `comment` are their aliases.
export const postFitsCommentSql = (post: string, comment: string) =>
  `(${post}.user_id=${comment}.user_id
    and (${post}.source_contract_id is null or ${post}.source_contract_id=${comment}.contract_id))`

// A top-level comment that carries a trade sits under that trade's card when
// the trade has one, and under the market's card otherwise. This joins the
// trade's card, as marketDiscussionParent finds it, to a comment cc.
export const tradeCardJoin = (alias: string, when = '') =>
  `left join social_posts ${alias} on ${
    when ? `${when} and ` : ''
  }${alias}.canonical_key='bet:' || (cc.data->>'betId')
      and ${alias}.source_contract_id=cc.contract_id`

const visibleQuoteComment = (alias: 'cc' | 'parent') => `${visibleMarketComment(
  alias
)}
  and not exists (select 1 from social_posts mirror join social_posts root on root.id=mirror.root_id
    where mirror.market_comment_id=${alias}.comment_id and
    (mirror.hidden_time is not null or mirror.deleted_time is not null or root.hidden_time is not null or root.deleted_time is not null))`

export type SocialViewer = { id?: string; blocked: string[] }
export async function getSocialViewer(
  id?: string,
  pg?: DB
): Promise<SocialViewer> {
  const user = id ? await getPrivateUser(id, pg) : null
  return {
    id,
    blocked: [
      ...new Set([
        ...(user?.blockedUserIds ?? []),
        ...(user?.blockedByUserIds ?? []),
      ]),
    ],
  }
}
export async function socialAuthor(id: string, membership = false) {
  const user = await getUser(id)
  if (!user || user.userDeleted)
    throw new APIError(403, 'Your account is unavailable')
  if (
    membership &&
    !isSupporter(
      await getActiveSupporterEntitlements(createSupabaseDirectClient(), id)
    )
  )
    throw new APIError(403, 'A Manifold membership is required to post on Yap')
  return user
}
// A database counter makes limits effective across all API instances. Call in the
// same transaction as the write, so failed writes do not consume allowance.
export async function limitSocialWrite(
  pg: DB,
  userId: string,
  action: string,
  limit: number
) {
  const result = await pg.oneOrNone(
    `insert into social_write_limits (user_id, action) values ($1, $2)
    on conflict (user_id, action) do update set
      count = case when social_write_limits.window_start <= now() - interval '1 hour' then 1 else social_write_limits.count + 1 end,
      window_start = case when social_write_limits.window_start <= now() - interval '1 hour' then now() else social_write_limits.window_start end
    where social_write_limits.window_start <= now() - interval '1 hour' or social_write_limits.count < $3 returning count`,
    [userId, action, limit]
  )
  if (!result)
    throw new APIError(
      429,
      'You have reached the hourly limit. Please try again later.'
    )
}
export async function getSocialRow(pg: DB, id: string) {
  const row = await pg.oneOrNone<SocialRow>(
    'select * from social_posts where id = $1',
    [id]
  )
  if (!row) throw new APIError(404, 'Post not found')
  return row
}
// Serialize changes inside a discussion, including root deletion versus replies.
export async function lockSocialThread(pg: DB, id: string) {
  const initial = await getSocialRow(pg, id)
  await pg.one('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `social:${initial.root_id}`,
  ])
  return getSocialRow(pg, id)
}
// A person's blocks for the checks of a write: the ones read when the request
// began, with the ones in force now added. Call it with the write's locks
// held. A comment can be given its place on Yap by the very request that acts
// on it, under a card that was made a moment before. A block made before that
// card existed has to count, whoever it is with: the author of the thread, of
// a comment the write quotes, or someone it mentions. A list read before the
// request's transaction does not have it.
export async function withCurrentBlocks(
  pg: DB,
  viewer: SocialViewer
): Promise<SocialViewer> {
  if (!viewer.id) return viewer
  const current = await getSocialViewer(viewer.id, pg)
  return {
    ...viewer,
    blocked: [...new Set([...viewer.blocked, ...current.blocked])],
  }
}
export async function assertSocialInteraction(
  pg: DB,
  post: SocialRow,
  viewer: SocialViewer,
  reply = false
) {
  const root = await getSocialRow(pg, post.root_id)
  if (
    post.deleted_time ||
    post.hidden_time ||
    root.hidden_time ||
    (reply && root.deleted_time)
  )
    throw new APIError(403, 'This discussion is closed')
  const { blocked } = await withCurrentBlocks(pg, viewer)
  if (blocked.includes(post.user_id) || blocked.includes(root.user_id))
    throw new APIError(
      403,
      'You cannot interact with this discussion because of a block'
    )
  if (post.market_comment_id || post.canonical_key?.match(/^(market|bet):/)) {
    // A market creator's hide collapses the comment on that market only. A
    // moderator's hide also sets hidden_time on the post, checked above.
    const available = await pg.oneOrNone(
      `select c.id from contracts c left join contract_comments cc on cc.comment_id=$2
       where c.id=coalesce(cc.contract_id,$1) and c.visibility='public'
         and not coalesce((c.data->>'deleted')::boolean,false)
         and not(c.creator_id=any($3::text[]))
         and ($2::text is null or cc.comment_id is not null
           and ${visibleMarketComment('cc')})`,
      [post.source_contract_id, post.market_comment_id, blocked]
    )
    if (!available)
      throw new APIError(403, 'This shared discussion is unavailable')
  }
}
// Whether a discussion still takes new messages: neither the post nor the
// root of its thread has been removed from Yap or hidden there.
export async function isSocialThreadOpen(pg: DB, post: SocialRow) {
  if (post.deleted_time || post.hidden_time) return false
  const root =
    post.root_id === post.id ? post : await getSocialRow(pg, post.root_id)
  return !root.deleted_time && !root.hidden_time
}
export async function validateSocialMarkets(pg: DB, marketIds: string[]) {
  const rows = await pg.manyOrNone<{ id: string }>(
    `select id from contracts where id = any($1::text[]) and visibility = 'public' and coalesce((data->>'deleted')::boolean, false) = false`,
    [marketIds]
  )
  if (rows.length !== marketIds.length)
    throw new APIError(400, 'Only available public markets can be attached')
}
function mapSocialMentions(
  doc: SocialRichContent,
  user: (node: SocialRichContent) => SocialRichContent,
  market: (node: SocialRichContent) => SocialRichContent
): SocialRichContent {
  if (doc.type === 'mention') return user(doc)
  if (doc.type === 'contract-mention') return market(doc)
  return {
    ...doc,
    ...(doc.content
      ? {
          content: doc.content.map((child) =>
            mapSocialMentions(child, user, market)
          ),
        }
      : {}),
  }
}

export async function validateSocialRichContent(
  pg: DB,
  content: SocialRichContent | null | undefined,
  viewer: SocialViewer,
  previous?: SocialRichContent | null
): Promise<SocialRichContent | null> {
  if (!content) return null
  const userIds = getSocialMentionIds(content)
  const marketIds = getSocialMarketMentionIds(content)
  const [users, markets] = await Promise.all([
    userIds.length
      ? pg.manyOrNone<{ id: string; username: string }>(
          `select id, username from users where id=any($1::text[])
          and coalesce((data->>'userDeleted')::boolean,false)=false`,
          [userIds]
        )
      : Promise.resolve([]),
    marketIds.length
      ? pg.manyOrNone<Row<'contracts'>>(
          `select * from contracts where id=any($1::text[]) and visibility='public'
          and coalesce((data->>'deleted')::boolean,false)=false`,
          [marketIds]
        )
      : Promise.resolve([]),
  ])
  const usernames = new Map(
    users
      .filter((user) => !viewer.blocked.includes(user.id))
      .map((user) => [user.id, user.username])
  )
  const paths = new Map(
    markets.map((market) => [market.id, contractPath(convertContract(market))])
  )
  // Only the locked stored document can authorize retaining an unavailable
  // reference. Consume each occurrence so an edit cannot create extra copies.
  const retained = new Map<string, SocialRichContent[]>()
  const parsedPrevious = socialRichContentDisplaySchema.safeParse(previous)
  if (parsedPrevious.success)
    mapSocialMentions(
      parsedPrevious.data,
      (node) => {
        const key = `user:${node.attrs!.id}`
        retained.set(key, [...(retained.get(key) ?? []), node])
        return node
      },
      (node) => {
        const key = `market:${node.attrs!.id}`
        retained.set(key, [...(retained.get(key) ?? []), node])
        return node
      }
    )
  const canonicalMention = (
    node: SocialRichContent,
    kind: 'user' | 'market',
    label: string | undefined
  ): SocialRichContent => {
    if (label !== undefined)
      return { type: node.type, attrs: { id: node.attrs!.id, label } }
    const original = retained.get(`${kind}:${node.attrs!.id}`)?.shift()
    if (!original)
      throw new APIError(
        400,
        kind === 'user'
          ? 'Mentioned user is unavailable'
          : 'Only available public markets can be referenced'
      )
    return {
      type: node.type,
      attrs: { id: original.attrs!.id, label: original.attrs!.label },
    }
  }
  const canonical = mapSocialMentions(
    content,
    (node) => canonicalMention(node, 'user', usernames.get(node.attrs!.id)),
    (node) => canonicalMention(node, 'market', paths.get(node.attrs!.id))
  )
  const parsed = socialRichContentSchema.safeParse(canonical)
  if (!parsed.success) throw new APIError(400, parsed.error.issues[0].message)
  return parsed.data
}

// The owner-only edit response retains reference identities behind generic
// placeholders. Match document positions, never placeholder text, so ordinary
// text that happens to contain the same words remains ordinary text.
export function getSocialEditContent(
  stored: SocialRichContent | null | undefined,
  displayed: SocialRichContent | null | undefined
): SocialRichContent | null {
  const original = socialRichContentDisplaySchema.safeParse(stored)
  const visible = socialRichContentDisplaySchema.safeParse(displayed)
  if (!original.success || !visible.success) return null
  const visit = (
    node: SocialRichContent,
    display: SocialRichContent
  ): SocialRichContent => {
    if (node.type === 'mention' || node.type === 'contract-mention') {
      if (display.type === node.type && display.attrs?.id === node.attrs!.id)
        return display
      // A market reply's mention, shown as the author of the comment it names
      // (see socialReplyMentionAuthors). The editor gets that name with the
      // stored id, so saving puts the stored mention back and mentions no one
      // anew.
      if (display.type === node.type && node.type === 'mention')
        return {
          type: node.type,
          attrs: { id: node.attrs!.id, label: display.attrs!.label },
        }
      return {
        type: node.type,
        attrs: {
          id: node.attrs!.id,
          label: socialUnavailableMentionText(node.type),
          unavailable: true,
        },
      }
    }
    return {
      ...display,
      ...(node.content
        ? {
            content: node.content.map((child, index) =>
              visit(child, display.content![index])
            ),
          }
        : {}),
    }
  }
  return visit(original.data, visible.data)
}
export async function writeSocialMarkets(
  pg: DB,
  id: string,
  marketIds: string[]
) {
  await pg.none('delete from social_post_markets where post_id = $1', [id])
  if (marketIds.length)
    await pg.none(
      `insert into social_post_markets (post_id, contract_id, position)
    select $1, id, ordinality - 1 from unnest($2::text[]) with ordinality as m(id, ordinality)`,
      [id, marketIds]
    )
}
export async function validateSocialSource(
  pg: DB,
  source: SocialPostSource | undefined,
  marketIds: string[],
  viewer: SocialViewer
) {
  if (!source) return
  if ('postId' in source) {
    const post = await getSocialRow(pg, source.postId)
    await assertSocialInteraction(pg, post, viewer, true)
    return
  }
  if (!marketIds.includes(source.contractId))
    throw new APIError(400, 'Keep the source market attached')
  if (source.commentId) {
    const comment = await pg.oneOrNone<{
      user_id: string
      is_mod_comment: boolean
    }>(
      `select cc.user_id, coalesce((cc.data->>'isModComment')::boolean, false) as is_mod_comment
      from contract_comments cc
      left join contract_comments parent on parent.comment_id = cc.data->>'replyToCommentId' and parent.contract_id=cc.contract_id
      where cc.comment_id = $1 and cc.contract_id = $2
      and ${visibleQuoteComment('cc')} and ${visibleQuoteComment('parent')}`,
      [source.commentId, source.contractId]
    )
    if (!comment || viewer.blocked.includes(comment.user_id))
      throw new APIError(400, 'Source comment is unavailable')
    // Quoting is sharing too: mod comments stay on their market.
    if (comment.is_mod_comment)
      throw new APIError(400, 'Mod comments cannot be shared to Yap')
  }
  if (source.betId) {
    const bet = await pg.oneOrNone(
      'select user_id from contract_bets where bet_id = $1 and contract_id = $2',
      [source.betId, source.contractId]
    )
    if (!bet || viewer.blocked.includes(bet.user_id))
      throw new APIError(400, 'Source bet is unavailable')
  }
}
const displayUser = (u: {
  id: string
  name: string
  username: string
  data?: { avatarUrl?: string }
  avatarUrl?: string
  entitlements?: Parameters<typeof convertEntitlement>[0][]
}): DisplayUser => ({
  id: u.id,
  name: u.name,
  username: u.username,
  avatarUrl: u.avatarUrl ?? u.data?.avatarUrl ?? '',
  entitlements: (u.entitlements ?? []).map(convertEntitlement),
})

// How many replies each requested post shows. Counted in three parts, so that
// each can use an index: posts under it on Yap; for a market or trade card,
// the top-level comments it lists from wherever they sit on Yap; and the
// market's comments shown under it that have no post yet. Joining the first
// two with OR, or matching the third on a value that may be null, reads the
// whole posts table (or all of a market's comments) once for every post on
// the page. The third part uses the condition the lists use, so the number is
// the number of entries the reader is shown. Under a comment's post it counts
// only if the post is that comment's own copy (postFitsCommentSql) and the
// comment is still to be seen on its market: replies written on the market
// join under no other post, so no other lists them. A card
// that a moderator removed no longer names its market, and a card whose
// market is no longer public lists nothing: both count nothing.
export const socialReplyCounts = (pg: DB, ids: string[], blocked: string[]) => {
  const shown = shownPostSql('$2')
  // The market's comments shown under the post without a post of their own.
  // `author` is who wrote the post each would sit under, which starts its
  // thread or sits in the requested post's.
  const pending = (
    which: string,
    author: string,
    threadAuthor: string,
    join = ''
  ) => `(select count(*) from contract_comments cc
    join contracts c on c.id=cc.contract_id left join private_users pu on pu.id=cc.user_id
    ${join}
    where ${which}
    and ${pendingCommentSql(author, threadAuthor, '$2')})`
  // Nothing to count for no posts: a page of comments that have no post yet.
  if (!ids.length)
    return Promise.resolve<{ parent_id: string; count: number }[]>([])
  // A card's market is looked up by primary key, inside the case that only a
  // card reaches. Joined to every requested post, PostgreSQL read the whole
  // markets table for a page that held no card.
  return pg.manyOrNone<{ parent_id: string; count: number }>(
    `select requested.id as parent_id, (case
      when requested.canonical_key ~ '^(market|bet):' and not coalesce((select market.visibility='public'
        and not coalesce((market.data->>'deleted')::boolean,false)
        from contracts market where market.id=requested.source_contract_id),false) then 0
      else
      (select count(*) from social_posts p join social_posts root on root.id=p.root_id
       where p.parent_id=requested.id and ${shown})
      + (case when requested.canonical_key ~ '^(market|bet):' then
          (select count(*) from contract_comments cc
           join social_posts p on p.market_comment_id=cc.comment_id
           join social_posts root on root.id=p.root_id
           where cc.contract_id=requested.source_contract_id and cc.data->>'replyToCommentId' is null
           and (requested.source_bet_id is null or cc.data->>'betId'=requested.source_bet_id)
           and p.parent_id is distinct from requested.id and ${shown})
        else 0 end)
      + (case
          when requested.deleted_time is not null or requested.hidden_time is not null
            or thread.deleted_time is not null or thread.hidden_time is not null then 0
          when requested.market_comment_id is not null and (original.comment_id is null
            or not ${postFitsCommentSql('requested', 'original')}
            or not (${visibleMarketComment('original')})) then 0
          when requested.market_comment_id is not null then ${pending(
            `cc.contract_id=original.contract_id
             and cc.data->>'replyToCommentId'=requested.market_comment_id`,
            'requested.user_id',
            'thread.user_id'
          )}
          when requested.canonical_key ~ '^(market|bet):' then ${pending(
            // Nor under a trade's card that is closed: the list shows none
            // there, and it is not the market card's to take instead.
            `cc.contract_id=requested.source_contract_id and cc.data->>'replyToCommentId' is null
             and (requested.source_bet_id is null or cc.data->>'betId'=requested.source_bet_id)
             and (trade.id is null or trade.deleted_time is null and trade.hidden_time is null)`,
            // A comment on a trade that has its own card sits under that card,
            // so it is that card's author it must have no block with.
            'coalesce(trade.user_id,requested.user_id)',
            'coalesce(trade.user_id,requested.user_id)',
            tradeCardJoin('trade')
          )}
          else 0 end)
      end)::int as count from social_posts requested join social_posts thread on thread.id=requested.root_id
      left join contract_comments original on original.comment_id=requested.market_comment_id
      where requested.id=any($1::text[])`,
    [ids, blocked]
  )
}

// The same number for comments that had no post when the page was chosen.
// Replies written on its market count, by the condition the lists use; its
// thread is the one it would join. Posts under the id it would get count too:
// there are none while it has no post, but someone may give it one, and its
// replies theirs, between the choosing of a page and this count. Counted both
// ways in one statement, a reply is counted once whichever it is by then. And
// if in that time it was given a post and taken off Yap, or deleted on its
// market, it takes no more replies from its market: none is counted that was
// written after.
export const pendingReplyCounts = (
  pg: DB,
  rows: SocialRow[],
  blocked: string[]
) =>
  rows.length
    ? pg.manyOrNone<{ parent_id: string; count: number }>(
        `select requested.id as parent_id, (
            (select count(*) from social_posts p join social_posts root on root.id=p.root_id
             where p.parent_id=requested.id and ${shownPostSql('$6')})
            + (case
              when thread.deleted_time is not null or thread.hidden_time is not null
                or self.deleted_time is not null or self.hidden_time is not null then 0
              when not exists (select 1 from contract_comments parent
                where parent.comment_id=requested.comment_id and parent.contract_id=requested.contract_id
                and ${visibleMarketComment('parent')}) then 0
              else (select count(*) from contract_comments cc
                join contracts c on c.id=cc.contract_id left join private_users pu on pu.id=cc.user_id
                where cc.contract_id=requested.contract_id and cc.data->>'replyToCommentId'=requested.comment_id
                and ${pendingCommentSql(
                  'requested.user_id',
                  'thread.user_id',
                  '$6'
                )}) end))::int as count
          from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[])
            as requested(id,comment_id,contract_id,user_id,root_id)
          join lateral (select first.user_id,first.deleted_time,first.hidden_time
            from social_posts first where first.id=requested.root_id limit 1) thread on true
          left join lateral (select made.deleted_time,made.hidden_time
            from social_posts made where made.id=requested.id limit 1) self on true`,
        [
          rows.map((r) => r.id),
          rows.map((r) => r.market_comment_id),
          rows.map((r) => r.source_contract_id),
          rows.map((r) => r.user_id),
          rows.map((r) => r.root_id),
          blocked,
        ]
      )
    : Promise.resolve([])

// The market's Reply button starts a reply with a mention of the person replied
// to, and stores the id of the COMMENT replied to in it, not the person's id.
// For pairs of (a comment, an id one of its mentions carries), this finds whose
// comment the id names, when that comment is on the same market. The mention's
// label is never used: a username can change hands, and a label can be forged.
//
// In two steps on purpose: the comment's market first, kept apart, then the
// comment it names. Written as two plain joins, one of the two comments is
// reached through its market alone, and every comment on that market is read
// for each pair.
const replyMentionAuthorsSql = (comments: number, mentions: number) =>
  `with own as materialized (
     select pair.comment_id, pair.mention_id, c.contract_id
     from unnest($${comments}::text[], $${mentions}::text[]) as pair(comment_id, mention_id)
     join contract_comments c on c.comment_id = pair.comment_id
   )
   select own.comment_id, target.comment_id as mention_id, target.user_id
   from own
   join contract_comments target on target.comment_id = own.mention_id and target.contract_id = own.contract_id`
export const socialReplyMentionAuthors = (
  pg: DB,
  pairs: (readonly [comment: string, mention: string])[]
) =>
  pairs.length
    ? pg.manyOrNone<{
        comment_id: string
        mention_id: string
        user_id: string
      }>(replyMentionAuthorsSql(1, 2), [
        pairs.map(([comment]) => comment),
        pairs.map(([, mention]) => mention),
      ])
    : Promise.resolve([])

// A market comment that starts its own thread carries its market (see
// hydrateSocialPosts). Listed under the market's or the trade's own card, which
// names the market already, it does not repeat it.
export const withoutRepeatedMarket = (posts: SocialPost[]) =>
  posts.map((post) =>
    post.source?.markets
      ? { ...post, source: { ...post.source, markets: undefined } }
      : post
  )

// `rows` may hold comments that have no post yet (see SocialRow.pending).
// Those are read from their market: likes are the comment's own, and the
// replies counted under one are the market's. `related` holds such a comment
// when it is not in `rows` and a row sits under it, so that row can name whom
// it replies to.
export async function hydrateSocialPosts(
  pg: DB,
  rows: SocialRow[],
  viewer: SocialViewer,
  previews = true,
  quotes = true,
  related: SocialRow[] = []
): Promise<SocialPost[]> {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const pending = rows.filter((r) => r.pending)
  // Comments with no post that a row may sit under: not in social_posts.
  const pendingById = new Map(
    [...related, ...rows].filter((r) => r.pending).map((r) => [r.id, r])
  )
  const pendingParent = (row: SocialRow) =>
    row.parent_id ? pendingById.get(row.parent_id) : undefined
  const richDocs = new Map(
    rows.map((row) => {
      const parsed = socialRichContentDisplaySchema.safeParse(row.rich_content)
      return [row.id, parsed.success ? parsed.data : null] as const
    })
  )
  const mentionedMarketIds = [
    ...new Set([...richDocs.values()].flatMap(getSocialMarketMentionIds)),
  ]
  // In a market comment a mention's id may be the comment it replies to.
  const replyMentions = rows.flatMap((r) =>
    r.market_comment_id
      ? getSocialMentionIds(richDocs.get(r.id)).map(
          (id) => [r.market_comment_id!, id] as const
        )
      : []
  )
  const [
    users,
    roots,
    attachments,
    reactions,
    replies,
    sourceMarkets,
    comments,
    bets,
    quotedRows,
    reposts,
    subscriptions,
    linkedComments,
    inlineMarkets,
    repliedTo,
    pendingReactions,
    pendingReplies,
  ] = await Promise.all([
    // One list of ids for the primary key. Written as "id = any(...) or id in
    // (select ...)", the sub-select cannot use an index and every call reads
    // the whole users table.
    pg.manyOrNone(
      `select id, name, username, data,
      (select coalesce(json_agg(e), '[]'::json) from user_entitlements e where e.user_id=users.id) as entitlements
      from users where id = any($1::text[]
        || array(select user_id from social_posts where id=any($2::text[]))
        || array(select user_id from (${replyMentionAuthorsSql(
          3,
          4
        )}) replied))`,
      [
        rows.flatMap((r) => [
          r.user_id,
          ...(pendingParent(r) ? [pendingParent(r)!.user_id] : []),
          ...getSocialMentionIds(richDocs.get(r.id)),
        ]),
        rows.map((r) => r.parent_id).filter(Boolean),
        replyMentions.map(([comment]) => comment),
        replyMentions.map(([, mention]) => mention),
      ]
    ),
    pg.manyOrNone<SocialRow>(
      `select * from social_posts where id = any($1::text[])`,
      [rows.flatMap((r) => [r.root_id, ...(r.parent_id ? [r.parent_id] : [])])]
    ),
    pg.manyOrNone<{ post_id: string; market: Row<'contracts'> | null }>(
      `select m.post_id, row_to_json(c) as market from social_post_markets m
      left join contracts c on c.id = m.contract_id and c.visibility = 'public' and coalesce((c.data->>'deleted')::boolean, false) = false
      where m.post_id = any($1::text[]) order by m.position`,
      [ids]
    ),
    pg.manyOrNone<{ content_id: string; count: number; liked: boolean }>(
      `select p.id as content_id, count(distinct r.user_id)::int as count, coalesce(bool_or(r.user_id = $2),false) as liked
      from social_posts p join user_reactions r on r.content_id=coalesce(p.market_comment_id,p.id)
        and r.content_type=case when p.market_comment_id is null then 'social_post' else 'comment' end
      where r.reaction_type='like' and p.id=any($1::text[]) group by p.id`,
      [ids, viewer.id ?? null]
    ),
    // Only for posts: a comment that had no post when it was chosen is
    // counted by pendingReplyCounts below, whether or not it has one by now.
    socialReplyCounts(
      pg,
      rows.filter((r) => !r.pending).map((r) => r.id),
      viewer.blocked
    ),
    pg.manyOrNone<Row<'contracts'>>(
      `select * from contracts where id = any($1::text[]) and visibility = 'public' and coalesce((data->>'deleted')::boolean,false) = false`,
      [rows.map((r) => r.source_contract_id).filter(Boolean)]
    ),
    pg.manyOrNone(
      `select cc.comment_id, cc.user_id, cc.data,
      json_build_object('id', u.id, 'name', u.name, 'username', u.username, 'avatarUrl', coalesce(u.data->>'avatarUrl',''),
        'entitlements', (select coalesce(json_agg(e), '[]'::json) from user_entitlements e where e.user_id=u.id)) as author
      from contract_comments cc join users u on u.id=cc.user_id
      left join contract_comments parent on parent.comment_id = cc.data->>'replyToCommentId' and parent.contract_id=cc.contract_id
      where cc.comment_id = any($1::text[]) and ${visibleQuoteComment(
        'cc'
      )} and ${visibleQuoteComment('parent')}`,
      [rows.map((r) => r.source_comment_id).filter(Boolean)]
    ),
    pg.manyOrNone(
      `select b.bet_id, b.user_id, b.data, u.name,
      json_build_object('id', u.id, 'name', u.name, 'username', u.username, 'avatarUrl', coalesce(u.data->>'avatarUrl',''),
        'entitlements', (select coalesce(json_agg(e), '[]'::json) from user_entitlements e where e.user_id=u.id)) as author
      from contract_bets b join users u on u.id=b.user_id where b.bet_id = any($1::text[])`,
      [rows.map((r) => r.source_bet_id).filter(Boolean)]
    ),
    quotes && rows.some((r) => r.source_post_id)
      ? pg.manyOrNone<SocialRow>(
          `select p.* from social_posts p join social_posts root on root.id=p.root_id
          where p.id=any($1::text[]) and p.deleted_time is null
          and not (p.user_id=any($2::text[])) and not (root.user_id=any($2::text[]))`,
          [rows.map((r) => r.source_post_id).filter(Boolean), viewer.blocked]
        )
      : Promise.resolve([]),
    pg.manyOrNone<{
      post_id: string
      count: number
      reposted: boolean
      user: Parameters<typeof displayUser>[0]
    }>(
      `select * from (select r.post_id,
        count(*) over(partition by r.post_id)::int as count,
        bool_or(r.user_id=$2) over(partition by r.post_id) as reposted,
        row_number() over(partition by r.post_id order by r.bumped_time desc,r.user_id) as rank,
        json_build_object('id',u.id,'name',u.name,'username',u.username,'data',u.data) as "user"
        from social_reposts r join users u on u.id=r.user_id
        where r.post_id=any($1::text[]) and r.active and not(r.user_id=any($3::text[]))) shares where rank<=3`,
      [ids, viewer.id ?? null, viewer.blocked]
    ),
    viewer.id
      ? pg.manyOrNone<{ root_id: string; muted: boolean }>(
          'select root_id,muted from social_thread_subscriptions where root_id=any($1::text[]) and user_id=$2',
          [rows.map((r) => r.root_id), viewer.id]
        )
      : Promise.resolve([]),
    // Hidden on its market does not make a comment unavailable here: only a
    // moderator's hide reaches Yap, through hidden_time on the post.
    pg.manyOrNone<{ comment_id: string; available: boolean; is_ai: boolean }>(
      `select cc.comment_id,(c.visibility='public' and not coalesce((c.data->>'deleted')::boolean,false)
       and ${visibleMarketComment('cc')}) as available,
       coalesce((cc.data->>'isAiComment')::boolean,false) as is_ai
       from contract_comments cc join contracts c on c.id=cc.contract_id where cc.comment_id=any($1::text[])`,
      [rows.map((r) => r.market_comment_id).filter(Boolean)]
    ),
    mentionedMarketIds.length
      ? pg.manyOrNone<Row<'contracts'>>(
          `select * from contracts where id=any($1::text[]) and visibility='public'
          and coalesce((data->>'deleted')::boolean,false)=false`,
          [mentionedMarketIds]
        )
      : Promise.resolve([]),
    socialReplyMentionAuthors(pg, replyMentions),
    // A comment with no post has no row for the reaction query above to start
    // from. Its likes are its market's, under its own id.
    pending.length
      ? pg.manyOrNone<{ content_id: string; count: number; liked: boolean }>(
          `select r.content_id, count(distinct r.user_id)::int as count, coalesce(bool_or(r.user_id = $2),false) as liked
          from user_reactions r where r.content_type='comment' and r.reaction_type='like'
            and r.content_id=any($1::text[]) group by r.content_id`,
          [pending.map((r) => r.market_comment_id), viewer.id ?? null]
        )
      : Promise.resolve([]),
    pendingReplyCounts(pg, pending, viewer.blocked),
  ])
  const quotedPosts = await hydrateSocialPosts(
    pg,
    quotedRows,
    viewer,
    false,
    false
  )
  const quotesById = new Map(
    quotedPosts.map((post) => [post.id, quoteSocialPost(post)])
  )
  const previewRows = previews
    ? await pg.manyOrNone<SocialRow>(
        `select preview.* from social_posts requested
    cross join lateral (select p.* from social_posts p where p.parent_id = requested.id and p.deleted_time is null and p.hidden_time is null
      and not (p.user_id = any($2::text[])) order by p.created_time desc, p.id desc limit 2) preview
        where requested.id=any($1::text[])
        order by preview.parent_id, preview.created_time desc, preview.id desc`,
        [ids, viewer.blocked]
      )
    : []
  const previewPosts = await hydrateSocialPosts(pg, previewRows, viewer, false)
  const attachmentsByPost = groupBy(attachments, 'post_id')
  const previewsByParent = groupBy(previewPosts, 'parentId')
  return rows.map((row) => {
    const root = roots.find((r) => r.id === row.root_id)!
    const parent =
      roots.find((r) => r.id === row.parent_id) ?? pendingParent(row)
    // Looked up by another statement than the one that found the parent. If
    // the parent got its post between the two, its author is not among them,
    // and the post goes out without the name rather than not at all.
    const parentUser = parent && users.find((u) => u.id === parent.user_id)
    const blocked =
      viewer.blocked.includes(row.user_id) ||
      viewer.blocked.includes(root.user_id)
    const removed = blocked
      ? 'blocked'
      : row.deleted_time
      ? row.removed_by_moderator
        ? 'moderator'
        : 'author'
      : row.hidden_time ||
        root.hidden_time ||
        (row.canonical_key?.match(/^(market|bet):/) &&
          !sourceMarkets.some(
            (m) =>
              m.id === row.source_contract_id &&
              !viewer.blocked.includes(m.creator_id ?? '')
          )) ||
        (row.market_comment_id &&
          !linkedComments.find((c) => c.comment_id === row.market_comment_id)
            ?.available)
      ? 'moderator'
      : null
    const richDoc = richDocs.get(row.id)
    const richContent =
      !removed && richDoc
        ? mapSocialMentions(
            richDoc,
            (node) => {
              // By id. In a market comment, an id that is no user's may be
              // the comment replied to: then the mention is of its author.
              const repliedToAuthor = repliedTo.find(
                (r) =>
                  r.comment_id === row.market_comment_id &&
                  r.mention_id === node.attrs!.id
              )?.user_id
              const user =
                users.find((user) => user.id === node.attrs!.id) ??
                (repliedToAuthor
                  ? users.find((user) => user.id === repliedToAuthor)
                  : undefined)
              return user &&
                !user.data.userDeleted &&
                !viewer.blocked.includes(user.id)
                ? { ...node, attrs: { id: user.id, label: user.username } }
                : { type: 'text', text: '[User unavailable]' }
            },
            (node) => {
              const market = inlineMarkets.find(
                (market) => market.id === node.attrs!.id
              )
              return market
                ? {
                    ...node,
                    attrs: {
                      id: market.id,
                      label: contractPath(convertContract(market)),
                    },
                  }
                : { type: 'text', text: '[Market unavailable]' }
            }
          )
        : null
    const attached = attachmentsByPost[row.id] ?? []
    const reaction = row.pending
      ? pendingReactions.find((r) => r.content_id === row.market_comment_id)
      : reactions.find((r) => r.content_id === row.id)
    const sourceMarket = sourceMarkets.find(
      (m) => m.id === row.source_contract_id
    )
    const comment = comments.find(
      (c) =>
        c.comment_id === row.source_comment_id &&
        !viewer.blocked.includes(c.user_id)
    )
    const bet = bets.find(
      (b) =>
        b.bet_id === row.source_bet_id && !viewer.blocked.includes(b.user_id)
    )
    let source: SocialPost['source'] = null
    if (
      sourceMarket &&
      (!row.source_comment_id || comment) &&
      (!row.source_bet_id || bet)
    ) {
      const contract = convertContract(sourceMarket)
      source = {
        kind: comment ? 'comment' : bet ? 'bet' : 'market',
        author: comment
          ? displayUser(comment.author)
          : bet
          ? displayUser(bet.author)
          : undefined,
        ...(comment?.data?.isAiComment === true ? { isAiComment: true } : {}),
        contractId: contract.id,
        url:
          contractPath(contract) + (comment ? `#${row.source_comment_id}` : ''),
        text: comment
          ? richTextToString(comment.data.content).slice(0, 300)
          : bet
          ? `${bet.name} traded ${formatMoney(
              Math.abs(bet.data.amount),
              contract.token
            )} on ${bet.data.outcome}. View market`
          : 'View original market',
        // A market comment that starts its own thread on Yap has no market
        // attached and nothing above it that names one, so its market comes
        // with it. Under a market's or a comment's thread the root says it.
        // Not for a reader who has a block with the market's creator: that
        // reader is not shown the creator's market card either.
        ...(row.market_comment_id &&
        !row.parent_id &&
        !comment &&
        !bet &&
        !attached.length &&
        !viewer.blocked.includes(sourceMarket.creator_id ?? '')
          ? { markets: [contract] }
          : {}),
      }
    } else if (
      (row.source_comment_id || row.source_bet_id) &&
      !row.canonical_key
    ) {
      // The quoted comment or trade can no longer be shown here: taken off
      // Yap, removed, hidden, or behind a block. Say only that, as a quoted
      // post does, with nothing that tells who wrote it or where it was. A
      // trade's own card names its trade the same way and quotes nothing.
      source = {
        kind: row.source_comment_id ? 'comment' : 'bet',
        url: '',
        text: '',
        unavailable: true,
      }
    }
    if (row.source_post_id) {
      source = quotesById.get(row.source_post_id) ?? {
        kind: 'post',
        url: '',
        text: '',
        unavailable: true,
      }
    }
    // A copy of a market comment carries that comment's "AI comment" label.
    const isAiComment =
      !removed &&
      !!row.market_comment_id &&
      !!linkedComments.find((c) => c.comment_id === row.market_comment_id)
        ?.is_ai
    return {
      id: row.id,
      marketCommentId: row.market_comment_id,
      ...(isAiComment ? { isAiComment } : {}),
      discussionCreatorId: sourceMarket?.creator_id,
      canonicalKey: row.canonical_key,
      feedTimeMs: socialTimestampMillis(row.feed_time ?? row.created_time),
      repostCount: removed
        ? 0
        : reposts.find((r) => r.post_id === row.id)?.count ?? 0,
      reposted:
        !removed &&
        (reposts.find((r) => r.post_id === row.id)?.reposted ?? false),
      repostedBy: removed
        ? []
        : reposts
            .filter((r) => r.post_id === row.id)
            .map((r) => displayUser(r.user)),
      threadMuted:
        subscriptions.find((s) => s.root_id === row.root_id)?.muted ?? false,
      threadFollowing: subscriptions.some(
        (s) => s.root_id === row.root_id && !s.muted
      ),
      author: displayUser(users.find((u) => u.id === row.user_id)),
      text: removed
        ? ''
        : richContent
        ? socialRichContentToText(richContent)
        : row.text,
      richContent,
      imageUrls: removed ? [] : (row.image_urls ?? []).filter(isSocialImageUrl),
      createdTime: socialTimestamp(row.created_time),
      createdTimeMs: socialTimestampMillis(row.created_time),
      editedTimeMs: row.edited_time
        ? socialTimestampMillis(row.edited_time)
        : null,
      editedTime: row.edited_time ? socialTimestamp(row.edited_time) : null,
      parentAuthor: parentUser ? displayUser(parentUser) : null,
      parentId: row.parent_id,
      rootId: row.root_id,
      removed,
      markets: removed
        ? []
        : attached.flatMap((m) =>
            m.market ? [convertContract(m.market)] : []
          ),
      unavailableMarketCount: removed
        ? 0
        : attached.filter((m) => !m.market).length,
      source: removed ? null : source,
      likeCount: removed ? 0 : reaction?.count ?? 0,
      liked: !removed && (reaction?.liked ?? false),
      replyCount:
        (row.pending ? pendingReplies : replies).find(
          (r) => r.parent_id === row.id
        )?.count ?? 0,
      canReply:
        !removed &&
        !root.deleted_time &&
        !root.hidden_time &&
        !viewer.blocked.includes(root.user_id),
      replyPreviews: removed
        ? []
        : [...(previewsByParent[row.id] ?? [])].reverse(),
    }
  })
}
export async function notifySocial(
  pg: SupabaseDirectClient,
  post: SocialRow,
  actor: User,
  kind: 'reply' | 'like',
  replyId?: string,
  skip = new Set<string>(),
  delivered = new Set<string>()
) {
  if (
    actor.isBot ||
    post.deleted_time ||
    post.hidden_time ||
    (kind === 'like' && post.user_id === actor.id)
  )
    return
  const reply = replyId ? await getSocialRow(pg, replyId) : null
  if (reply?.deleted_time || reply?.hidden_time) return
  const root = await getSocialRow(pg, post.root_id)
  if (root.hidden_time || root.deleted_time) return
  const subscribers =
    kind === 'reply'
      ? await pg.manyOrNone<{ user_id: string }>(
          'select user_id from social_thread_subscriptions where root_id=$1 and not muted',
          [post.root_id]
        )
      : [{ user_id: post.user_id }]
  for (const { user_id: userId } of subscribers) {
    if (userId === actor.id || skip.has(userId)) continue
    try {
      const recipient = await getPrivateUser(userId, pg)
      const reason =
        kind === 'reply' ? 'social_replies' : 'user_liked_your_content'
      if (
        !recipient ||
        recipient.blockedUserIds.includes(actor.id) ||
        recipient.blockedByUserIds.includes(actor.id) ||
        !getNotificationDestinationsForUser(recipient, reason).sendToBrowser
      )
        continue
      if (
        recipient.blockedUserIds.includes(root.user_id) ||
        recipient.blockedByUserIds.includes(root.user_id)
      )
        continue
      const notification: Notification = {
        id:
          kind === 'like'
            ? `social-like-${post.id}-${actor.id}`
            : `social-thread-${post.root_id}`,
        userId,
        reason,
        createdTime: Date.now(),
        isSeen: false,
        sourceId: kind === 'reply' ? post.root_id : post.id,
        sourceType: kind === 'like' ? 'social_post_like' : 'social_reply',
        sourceUpdateType: 'created',
        sourceUserName: actor.name,
        sourceUserUsername: actor.username,
        sourceUserAvatarUrl: actor.avatarUrl ?? '',
        data: { sourceUserId: actor.id },
        sourceText: (reply?.text ?? post.text).slice(0, 200),
        sourceSlug: socialPostPath(replyId ?? post.id),
        sourceTitle: kind === 'like' ? 'on Yap' : 'a Yap discussion you follow',
      }
      if (kind === 'like') await insertNotificationToSupabase(notification, pg)
      else {
        await pg.none(
          `insert into user_notifications(user_id,notification_id,data) values ($1,$2,$3)
        on conflict (user_id,notification_id) do update set data=excluded.data`,
          [userId, notification.id, notification]
        )
        delivered.add(userId)
        const { broadcast } = await import('./websockets/server')
        broadcast(`user-notifications/${userId}`, { notification })
      }
    } catch (error) {
      log.error('Failed to deliver a Yap notification', {
        error,
        userId,
        postId: post.id,
      })
    }
  }
}

// Takes back the Yap alerts that point at a post being taken off Yap. Each is
// found by the person it went to or by its id, so no statement reads the
// whole notifications table: the first reads the alerts of one person, the
// post's author (a nightly job keeps each person's newest 1,000), and the
// others look alerts up by id. Matched on their content alone, they were
// looked for in the whole table, which on production took longer than a
// statement may run, and every removal failed (21 Nov 2026).
//
// Who gets which alert about a post (notifySocial, repostSocialPost):
//   - a like or a re-Yap of it, and, as Yap wrote them before 21 Nov 2026, a
//     reply to it: its author;
//   - it as a reply, as Yap wrote it before then: the author of the post it
//     replies to, under the id `social-reply-<post>`;
//   - a reply in its thread, since then: everyone following the thread, under
//     one alert per thread, `social-thread-<thread>`, which names the thread
//     and the latest reply.
export async function deleteSocialPostAlerts(
  pg: DB,
  post: Pick<SocialRow, 'id' | 'user_id' | 'root_id'>
) {
  const aboutPost = `(data->>'sourceId'=$1 or data->>'sourceSlug'='/yap/' || $1)`
  await pg.none(
    `delete from user_notifications where user_id=$2 and ${aboutPost}
       and data->>'sourceType' in ('social_reply','social_post_like','social_repost')`,
    [post.id, post.user_id]
  )
  await pg.none(
    `delete from user_notifications where notification_id=any($2::text[]) and ${aboutPost}
       and data->>'sourceType'='social_reply'`,
    [post.id, [`social-thread-${post.root_id}`, `social-reply-${post.id}`]]
  )
  await pg.none('delete from user_notifications where notification_id=$1', [
    `social-mention-${post.id}`,
  ])
}
