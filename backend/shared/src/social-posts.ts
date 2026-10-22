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
import { getPrivateUser, getUser } from './utils'

type DB = SupabaseDirectClient | SupabaseTransaction
export type SocialRow = Omit<Row<'social_posts'>, 'rich_content'> & {
  rich_content: SocialRichContent | null
}
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
    await assertSocialInteraction(pg, post, viewer)
    return
  }
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

export async function hydrateSocialPosts(
  pg: DB,
  rows: SocialRow[],
  viewer: SocialViewer,
  previews = true,
  quotes = true
): Promise<SocialPost[]> {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const richDocs = new Map(
    rows.map((row) => {
      const parsed = socialRichContentDisplaySchema.safeParse(row.rich_content)
      return [row.id, parsed.success ? parsed.data : null] as const
    })
  )
  const mentionedMarketIds = [
    ...new Set([...richDocs.values()].flatMap(getSocialMarketMentionIds)),
  ]
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
    inlineMarkets,
  ] = await Promise.all([
    pg.manyOrNone(
      `select id, name, username, data,
      (select coalesce(json_agg(e), '[]'::json) from user_entitlements e where e.user_id=users.id) as entitlements
      from users where id = any($1::text[]) or id in (select user_id from social_posts where id=any($2::text[]))`,
      [
        rows.flatMap((r) => [
          r.user_id,
          ...getSocialMentionIds(richDocs.get(r.id)),
        ]),
        rows.map((r) => r.parent_id).filter(Boolean),
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
      `select cc.comment_id, cc.user_id, cc.data,
      json_build_object('id', u.id, 'name', u.name, 'username', u.username, 'avatarUrl', coalesce(u.data->>'avatarUrl',''),
        'entitlements', (select coalesce(json_agg(e), '[]'::json) from user_entitlements e where e.user_id=u.id)) as author
      from contract_comments cc join users u on u.id=cc.user_id
      left join contract_comments parent on parent.comment_id = cc.data->>'replyToCommentId'
      where cc.comment_id = any($1::text[]) and coalesce((cc.data->>'hidden')::boolean,false) = false and coalesce((cc.data->>'deleted')::boolean,false) = false
      and coalesce((parent.data->>'hidden')::boolean,false) = false and coalesce((parent.data->>'deleted')::boolean,false) = false`,
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
    mentionedMarketIds.length
      ? pg.manyOrNone<Row<'contracts'>>(
          `select * from contracts where id=any($1::text[]) and visibility='public'
          and coalesce((data->>'deleted')::boolean,false)=false`,
          [mentionedMarketIds]
        )
      : Promise.resolve([]),
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
    const richDoc = richDocs.get(row.id)
    const richContent =
      !removed && richDoc
        ? mapSocialMentions(
            richDoc,
            (node) => {
              const user = users.find((user) => user.id === node.attrs!.id)
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
        author: comment
          ? displayUser(comment.author)
          : bet
          ? displayUser(bet.author)
          : undefined,
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
      }
    }
    if (row.source_post_id) {
      source = quotesById.get(row.source_post_id) ?? {
        kind: 'post',
        url: socialPostPath(row.source_post_id),
        text: '',
        unavailable: true,
      }
    }
    return {
      id: row.id,
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
