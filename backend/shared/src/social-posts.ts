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
  socialPostPath,
  socialTimestamp,
  socialTimestampMillis,
} from 'common/social-post'
import { isSupporter } from 'common/supporter'
import { convertContract } from 'common/supabase/contracts'
import { Row } from 'common/supabase/utils'
import { DisplayUser } from 'common/api/user-types'
import { User } from 'common/user'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { richTextToString } from 'common/util/parse'
import { SupabaseDirectClient, SupabaseTransaction } from './supabase/init'
import { insertNotificationToSupabase } from './supabase/notifications'
import { getPrivateUser, getUser } from './utils'

type DB = SupabaseDirectClient | SupabaseTransaction
export type SocialRow = Row<'social_posts'>
export type SocialViewer = { id?: string; blocked: string[] }
export async function getSocialViewer(id?: string): Promise<SocialViewer> {
  const user = id ? await getPrivateUser(id) : null
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
export async function assertSocialInteraction(
  pg: DB,
  post: SocialRow,
  viewer: SocialViewer,
  reply = false
) {
  const root = await getSocialRow(pg, post.root_id)
  if (post.deleted_time || (reply && root.deleted_time))
    throw new APIError(403, 'This discussion is closed')
  if (
    viewer.blocked.includes(post.user_id) ||
    viewer.blocked.includes(root.user_id)
  )
    throw new APIError(
      403,
      'You cannot interact with this discussion because of a block'
    )
}
export async function validateSocialMarkets(pg: DB, marketIds: string[]) {
  const rows = await pg.manyOrNone<{ id: string }>(
    `select id from contracts where id = any($1::text[]) and visibility = 'public' and coalesce((data->>'deleted')::boolean, false) = false`,
    [marketIds]
  )
  if (rows.length !== marketIds.length)
    throw new APIError(400, 'Only available public markets can be attached')
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
  if (!marketIds.includes(source.contractId))
    throw new APIError(400, 'Keep the source market attached')
  if (source.commentId) {
    const comment = await pg.oneOrNone(
      `select cc.user_id from contract_comments cc
      left join contract_comments parent on parent.comment_id = cc.data->>'replyToCommentId'
      where cc.comment_id = $1 and cc.contract_id = $2
      and coalesce((cc.data->>'hidden')::boolean, false) = false and coalesce((cc.data->>'deleted')::boolean, false) = false
      and coalesce((parent.data->>'hidden')::boolean, false) = false and coalesce((parent.data->>'deleted')::boolean, false) = false`,
      [source.commentId, source.contractId]
    )
    if (!comment || viewer.blocked.includes(comment.user_id))
      throw new APIError(400, 'Source comment is unavailable')
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
  data: { avatarUrl?: string }
}): DisplayUser => ({
  id: u.id,
  name: u.name,
  username: u.username,
  avatarUrl: u.data.avatarUrl ?? '',
})

export async function hydrateSocialPosts(
  pg: DB,
  rows: SocialRow[],
  viewer: SocialViewer,
  previews = true
): Promise<SocialPost[]> {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const [
    users,
    roots,
    attachments,
    reactions,
    replies,
    sourceMarkets,
    comments,
    bets,
  ] = await Promise.all([
    pg.manyOrNone(
      `select id, name, username, data from users where id = any($1::text[]) or id in (select user_id from social_posts where id=any($2::text[]))`,
      [rows.map((r) => r.user_id), rows.map((r) => r.parent_id).filter(Boolean)]
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
      `select content_id, count(*)::int as count, coalesce(bool_or(user_id = $2),false) as liked from user_reactions
      where content_type = 'social_post' and reaction_type = 'like' and content_id = any($1::text[]) group by content_id`,
      [ids, viewer.id ?? null]
    ),
    pg.manyOrNone<{ parent_id: string; count: number }>(
      `select p.parent_id, count(*)::int as count from social_posts p
      where p.parent_id = any($1::text[])
      and (p.deleted_time is null or exists (select 1 from social_posts child where child.parent_id=p.id))
      and not (p.user_id = any($2::text[])) group by p.parent_id`,
      [ids, viewer.blocked]
    ),
    pg.manyOrNone<Row<'contracts'>>(
      `select * from contracts where id = any($1::text[]) and visibility = 'public' and coalesce((data->>'deleted')::boolean,false) = false`,
      [rows.map((r) => r.source_contract_id).filter(Boolean)]
    ),
    pg.manyOrNone(
      `select cc.comment_id, cc.user_id, cc.data from contract_comments cc
      left join contract_comments parent on parent.comment_id = cc.data->>'replyToCommentId'
      where cc.comment_id = any($1::text[]) and coalesce((cc.data->>'hidden')::boolean,false) = false and coalesce((cc.data->>'deleted')::boolean,false) = false
      and coalesce((parent.data->>'hidden')::boolean,false) = false and coalesce((parent.data->>'deleted')::boolean,false) = false`,
      [rows.map((r) => r.source_comment_id).filter(Boolean)]
    ),
    pg.manyOrNone(
      `select b.bet_id, b.user_id, b.data, u.name from contract_bets b join users u on u.id=b.user_id where b.bet_id = any($1::text[])`,
      [rows.map((r) => r.source_bet_id).filter(Boolean)]
    ),
  ])
  const previewRows = previews
    ? await pg.manyOrNone<SocialRow>(
        `select preview.* from unnest($1::text[]) as requested(id)
    cross join lateral (select p.* from social_posts p where p.parent_id = requested.id and p.deleted_time is null
      and not (p.user_id = any($2::text[])) order by p.created_time desc, p.id desc limit 2) preview
        order by preview.parent_id, preview.created_time desc, preview.id desc`,
        [ids, viewer.blocked]
      )
    : []
  const previewPosts = await hydrateSocialPosts(pg, previewRows, viewer, false)
  const attachmentsByPost = groupBy(attachments, 'post_id')
  const previewsByParent = groupBy(previewPosts, 'parentId')
  return rows.map((row) => {
    const root = roots.find((r) => r.id === row.root_id)!
    const parent = roots.find((r) => r.id === row.parent_id)
    const blocked = viewer.blocked.includes(row.user_id)
    const removed = blocked
      ? 'blocked'
      : row.deleted_time
      ? row.removed_by_moderator
        ? 'moderator'
        : 'author'
      : null
    const attached = attachmentsByPost[row.id] ?? []
    const reaction = reactions.find((r) => r.content_id === row.id)
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
      }
    }
    return {
      id: row.id,
      author: displayUser(users.find((u) => u.id === row.user_id)),
      text: removed ? '' : row.text,
      imageUrls: removed ? [] : row.image_urls ?? [],
      createdTime: socialTimestamp(row.created_time),
      createdTimeMs: socialTimestampMillis(row.created_time),
      editedTimeMs: row.edited_time
        ? socialTimestampMillis(row.edited_time)
        : null,
      editedTime: row.edited_time ? socialTimestamp(row.edited_time) : null,
      parentAuthor: parent
        ? displayUser(users.find((u) => u.id === parent.user_id))
        : null,
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
      replyCount: replies.find((r) => r.parent_id === row.id)?.count ?? 0,
      canReply:
        !removed &&
        !root.deleted_time &&
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
  replyId?: string
) {
  if (post.user_id === actor.id || post.deleted_time) return
  const recipient = await getPrivateUser(post.user_id)
  if (
    !recipient ||
    recipient.blockedUserIds.includes(actor.id) ||
    recipient.blockedByUserIds.includes(actor.id)
  )
    return
  const reason = kind === 'reply' ? 'social_replies' : 'user_liked_your_content'
  if (!getNotificationDestinationsForUser(recipient, reason).sendToBrowser)
    return
  const reply = replyId ? await getSocialRow(pg, replyId) : null
  if (reply?.deleted_time) return
  const notification: Notification = {
    id:
      kind === 'like'
        ? `social-like-${post.id}-${actor.id}`
        : `social-reply-${replyId}`,
    userId: post.user_id,
    reason,
    createdTime: Date.now(),
    isSeen: false,
    sourceId: post.id,
    sourceType: kind === 'like' ? 'social_post_like' : 'social_reply',
    sourceUpdateType: 'created',
    sourceUserName: actor.name,
    sourceUserUsername: actor.username,
    sourceUserAvatarUrl: actor.avatarUrl ?? '',
    data: { sourceUserId: actor.id },
    sourceText: (reply?.text ?? post.text).slice(0, 200),
    sourceSlug: socialPostPath(replyId ?? post.id),
    sourceTitle: kind === 'like' ? 'on Yap' : 'Yap',
  }
  await insertNotificationToSupabase(notification, pg)
}
