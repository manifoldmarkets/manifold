import { JSONContent } from '@tiptap/core'
import { isEqual } from 'lodash'
import { APIError } from 'common/api/utils'
import { ContractComment } from 'common/comment'
import {
  SOCIAL_POST_MAX_LENGTH,
  SocialPostSource,
  socialTimestamp,
  isSocialImageUrl,
} from 'common/social-post'
import {
  commentToSocialRichContent,
  socialPostToCommentContent,
  socialRichContentToText,
} from 'common/social-rich-content'
import { richTextToString } from 'common/util/parse'
import {
  isSocialThreadOpen,
  assertSocialInteraction,
  visibleMarketComment,
  getSocialViewer,
  getSocialRow,
  lockSocialThread,
  type SocialRow,
  type SocialViewer,
} from './social-posts'
import { SupabaseDirectClient, SupabaseTransaction } from './supabase/init'
import { log, sanitizeJsonContent } from './utils'

type DB = SupabaseDirectClient | SupabaseTransaction

// How many market comments one read may add to a Yap discussion. Reads are
// public, so the work each one can cause stays small; later reads carry on.
export const SOCIAL_RECONCILE_BATCH = 100

// Yap's length limit, applied to the copy of a longer market comment.
const clampToYapLength = (text: string) => {
  const chars = [...text]
  return chars.length > SOCIAL_POST_MAX_LENGTH
    ? chars.slice(0, SOCIAL_POST_MAX_LENGTH - 1).join('') + '…'
    : text
}

// The Yap copy of a market comment: what Yap's format can hold of it. The
// market keeps the document as it was written.
export function commentToYapContent(content: JSONContent) {
  const richContent = commentToSocialRichContent(content)
  const imageUrls: string[] = []
  const visit = (node: JSONContent) => {
    if (
      node.type === 'image' &&
      typeof node.attrs?.src === 'string' &&
      isSocialImageUrl(node.attrs.src)
    )
      imageUrls.push(node.attrs.src)
    node.content?.forEach(visit)
  }
  visit(content)
  return {
    text: clampToYapLength(
      richContent
        ? socialRichContentToText(richContent)
        : imageUrls.length &&
          content.content?.every(
            (node) =>
              node.type === 'image' ||
              (node.type === 'paragraph' && !node.content?.length)
          )
        ? ''
        : richTextToString(content)
    ),
    richContent,
    imageUrls: [...new Set(imageUrls)].slice(0, 4),
    marketIds: [] as string[],
  }
}

// Reduces a comment document to what decides whether two documents read the
// same: node types, text, marks and nondefault attributes.
const comparableContent = (node: JSONContent): JSONContent => {
  const attrs = Object.fromEntries(
    Object.entries(node.attrs ?? {}).filter(([, value]) => value != null)
  )
  return {
    type: node.type,
    ...(node.text !== undefined ? { text: node.text } : {}),
    ...(Object.keys(attrs).length ? { attrs } : {}),
    ...(node.marks?.length
      ? {
          marks: node.marks.map((mark) =>
            mark.type === 'link'
              ? {
                  type: 'link',
                  attrs: Object.fromEntries(
                    Object.entries(mark.attrs ?? {}).filter(
                      ([key, value]) =>
                        value != null &&
                        !(key === 'target' && value === '_blank') &&
                        !(
                          key === 'rel' &&
                          value === 'noopener noreferrer nofollow'
                        )
                    )
                  ),
                }
              : mark
          ),
        }
      : {}),
    ...(node.content?.length
      ? { content: node.content.map(comparableContent) }
      : {}),
  }
}

// Whether Yap's editor can hold this comment without loss. A comment that
// cannot be held is edited on its market, and Yap shows a copy of it.
export function isCommentYapRepresentable(content: JSONContent) {
  const roundTrip = sanitizeJsonContent(
    socialPostToCommentContent(commentToYapContent(content))
  )
  return isEqual(comparableContent(content), comparableContent(roundTrip))
}

function marketDiscussionParent(pg: DB, contractId: string, betId?: string) {
  return pg.oneOrNone<SocialRow>(
    `select * from social_posts where source_contract_id=$1 and canonical_key in ($2,$3)
     order by (canonical_key=$2) desc limit 1`,
    [
      contractId,
      betId ? `bet:${betId}` : `market:${contractId}`,
      `market:${contractId}`,
    ]
  )
}

// Market rows remain compatible with old clients; the stable association means
// both surfaces write to the same logical message and reaction collection.
export async function ensureMarketCommentPost(
  pg: DB,
  commentId: string,
  expectedContractId?: string,
  options: {
    // This is the comment that the one being placed replies to.
    asParent?: boolean
    // The person sharing the comment, when someone is.
    sharer?: SocialViewer
  } = {}
): Promise<SocialRow> {
  const row = await pg.oneOrNone<{
    data: ContractComment
    contract_id: string
    created_time: string
    visible: boolean
  }>(
    `select cc.data,cc.contract_id,cc.created_time::text as created_time,(${visibleMarketComment(
      'cc'
    )}) as visible from contract_comments cc join contracts c on c.id=cc.contract_id
     where cc.comment_id=$1 and c.visibility='public' and not coalesce((c.data->>'deleted')::boolean,false)
       for update of cc`,
    [commentId]
  )
  if (!row || (expectedContractId && row.contract_id !== expectedContractId))
    throw new APIError(404, 'This comment is unavailable')
  const comment = row.data
  if (comment.isModComment)
    throw new APIError(400, 'Mod comments cannot be shared to Yap')
  if (!row.visible) throw new APIError(404, 'This comment is unavailable')
  const existing = await pg.oneOrNone<SocialRow>(
    'select * from social_posts where market_comment_id=$1',
    [commentId]
  )
  if (existing) {
    if (
      existing.user_id !== comment.userId ||
      (existing.source_contract_id &&
        existing.source_contract_id !== row.contract_id)
    )
      throw new APIError(409, 'This comment is linked to a different source')
    if (!(await isSocialThreadOpen(pg, existing))) {
      // The comment is still on its market with a Yap button under it, so
      // tell the person sharing it why this one cannot be shared. Only them,
      // and only if Yap would show them the comment: no block with its author
      // or with the author of the thread it is in. Anything else that closes
      // a thread is said the general way.
      const sharer = options.asParent ? undefined : options.sharer
      const withdrawn =
        !!existing.deleted_time && !existing.removed_by_moderator
      const threadAuthor =
        sharer && withdrawn && existing.root_id !== existing.id
          ? (await getSocialRow(pg, existing.root_id)).user_id
          : existing.user_id
      throw new APIError(
        403,
        sharer &&
        withdrawn &&
        !sharer.blocked.includes(existing.user_id) &&
        !sharer.blocked.includes(threadAuthor)
          ? "This comment's author took it off Yap"
          : 'This discussion is closed'
      )
    }
    return existing
  }
  // A trade or market row is the parent only if it belongs to this market: a
  // comment can carry a trade from a sibling market.
  const parent = comment.replyToCommentId
    ? await ensureMarketCommentPost(
        pg,
        comment.replyToCommentId,
        row.contract_id,
        { asParent: true }
      )
    : await marketDiscussionParent(pg, row.contract_id, comment.betId)
  if (parent) {
    const lockedParent = await lockSocialThread(pg, parent.id)
    await assertSocialInteraction(
      pg,
      lockedParent,
      await getSocialViewer(comment.userId, pg),
      true
    )
  }
  const id = `mc-${commentId}`
  const content = commentToYapContent(comment.content)
  const result = await pg.one<SocialRow>(
    `insert into social_posts(id,user_id,text,rich_content,image_urls,parent_id,root_id,market_comment_id,source_contract_id,canonical_key,feed_visible,created_time)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11::timestamptz)
     on conflict (market_comment_id) where market_comment_id is not null do update set market_comment_id=excluded.market_comment_id returning *`,
    [
      id,
      comment.userId,
      content.text,
      content.richContent,
      content.imageUrls,
      parent?.id ?? null,
      parent?.root_id ?? id,
      commentId,
      row.contract_id,
      `comment:${commentId}`,
      row.created_time,
    ]
  )
  await pg.none(
    `update contract_comments set data=data || jsonb_build_object('socialPostId',$2::text) where comment_id=$1`,
    [commentId, result.id]
  )
  // The copy does not make its author follow the thread. A copy is made by a
  // read, by someone else's share, or by the author commenting on the market,
  // and none of those is a choice to get Yap's alerts. People follow a thread
  // by posting or replying on Yap, or by choosing Follow.
  return result
}

export async function ensureSocialSource(
  pg: DB,
  source: SocialPostSource,
  // The person sharing it, when someone is.
  sharer?: SocialViewer
): Promise<SocialRow> {
  if ('postId' in source) {
    const row = await pg.oneOrNone<SocialRow>(
      'select * from social_posts where id=$1',
      [source.postId]
    )
    if (!row) throw new APIError(404, 'Post not found')
    return row
  }
  // Sharing a specific comment always keeps its existing author and thread.
  if (source.commentId) {
    const comment = await pg.oneOrNone(
      'select comment_id from contract_comments where comment_id=$1 and contract_id=$2',
      [source.commentId, source.contractId]
    )
    if (!comment) throw new APIError(404, 'Comment not found on this market')
    return ensureMarketCommentPost(pg, source.commentId, source.contractId, {
      sharer,
    })
  }
  const market = await pg.oneOrNone<{
    creator_id: string
    created_time: string
  }>(
    `select creator_id,created_time from contracts where id=$1 and visibility='public' and not coalesce((data->>'deleted')::boolean,false)`,
    [source.contractId]
  )
  if (!market) throw new APIError(404, 'This market is unavailable')
  const bet = source.betId
    ? await pg.oneOrNone<{ user_id: string; created_time: string }>(
        'select user_id,created_time from contract_bets where bet_id=$1 and contract_id=$2',
        [source.betId, source.contractId]
      )
    : null
  if (source.betId && !bet) throw new APIError(404, 'This trade is unavailable')
  const key = source.betId
    ? `bet:${source.betId}`
    : `market:${source.contractId}`
  const id = source.betId
    ? `bet-${source.betId}`
    : `market-${source.contractId}`
  const row = await pg.one<SocialRow>(
    `insert into social_posts(id,user_id,text,root_id,source_contract_id,source_bet_id,canonical_key,feed_visible,created_time)
     values ($1,$2,'',$1,$3,$4,$5,false,$6) on conflict (canonical_key) where canonical_key is not null
     do update set canonical_key=excluded.canonical_key returning *`,
    [
      id,
      bet?.user_id ?? market.creator_id,
      source.contractId,
      source.betId ?? null,
      key,
      bet?.created_time ?? market.created_time,
    ]
  )
  await pg.none(
    'insert into social_post_markets(post_id,contract_id,position) values ($1,$2,0) on conflict do nothing',
    [row.id, source.contractId]
  )
  return row
}

// Bring older native replies into the same tree on demand, without publishing
// them as fresh posts or sending historical notifications. Runs on public
// reads, so it does a bounded amount of work, takes only comments it can
// place, and never lets one comment stop the rest or the read.
export async function reconcileMarketDiscussion(
  pg: DB,
  post: SocialRow,
  cursor?: string
) {
  if (
    (!post.market_comment_id && !post.canonical_key?.match(/^(market|bet):/)) ||
    !(await isSocialThreadOpen(pg, post))
  )
    return null
  const [time, id] = cursor?.split('|') ?? []
  const root =
    post.root_id === post.id ? post : await getSocialRow(pg, post.root_id)
  // Scan exactly the native siblings this page can show, in its cursor order.
  // Its parent is already materialized, so no recursive backfill is needed.
  // A comment that can never join is left out here, as the reply count leaves
  // it out: one on a market that is no longer public, or whose author has a
  // block with this post's author, the thread's or the market's creator.
  // Picking those up would spend every read's batch on refusals.
  //
  // A card takes top-level comments and a comment takes its replies. The two
  // are written out, not as `is not distinct from $2`: with a null PostgreSQL
  // expects that form to match nothing, plans every join for one comment, and
  // can then read the whole posts table once for each comment it does find.
  // A read of a market with 20,000 top-level comments took 100 s that way.
  const siblings = post.market_comment_id
    ? "(cc.data->>'replyToCommentId')=$2::text"
    : "(cc.data->>'replyToCommentId') is null"
  const rows = await pg.manyOrNone<{
    comment_id: string
    created_time: string
  }>(
    `select cc.comment_id,cc.created_time::text as created_time from contract_comments cc
     join contracts c on c.id=cc.contract_id left join private_users pu on pu.id=cc.user_id
     where not exists(select 1 from social_posts p where p.market_comment_id=cc.comment_id)
       and ${visibleMarketComment('cc')}
       and cc.contract_id=$1 and ${siblings}
       and ($3::text is null or cc.data->>'betId'=$3)
       and ($4::timestamptz is null or (cc.created_time,'mc-' || cc.comment_id)>($4::timestamptz,$5::text))
       and c.visibility='public' and not coalesce((c.data->>'deleted')::boolean,false)
       and not (coalesce(pu.data->'blockedUserIds','[]'::jsonb) ?| array[$7,$8,c.creator_id]
         or coalesce(pu.data->'blockedByUserIds','[]'::jsonb) ?| array[$7,$8,c.creator_id])
     order by cc.created_time,'mc-' || cc.comment_id limit $6`,
    [
      post.market_comment_id
        ? (
            await pg.oneOrNone<{ contract_id: string }>(
              'select contract_id from contract_comments where comment_id=$1',
              [post.market_comment_id]
            )
          )?.contract_id ?? null
        : post.source_contract_id,
      post.market_comment_id,
      post.market_comment_id ? null : post.source_bet_id,
      time ?? null,
      id ?? null,
      SOCIAL_RECONCILE_BATCH + 1,
      post.user_id,
      root.user_id,
    ]
  )
  for (const row of rows.slice(0, SOCIAL_RECONCILE_BATCH)) {
    // Each comment in its own savepoint: a failure undoes that comment only.
    await pg
      .tx((tx) => ensureMarketCommentPost(tx, row.comment_id))
      .catch((e) =>
        log.warn(
          'Skipped a market comment that could not join its Yap discussion',
          {
            commentId: row.comment_id,
            error: e instanceof Error ? e.message : String(e),
          }
        )
      )
  }
  const last = rows[SOCIAL_RECONCILE_BATCH - 1]
  return rows.length > SOCIAL_RECONCILE_BATCH
    ? { time: socialTimestamp(last.created_time), id: `mc-${last.comment_id}` }
    : null
}

// A comment written on its market joins a discussion that is already on Yap:
// under the comment it replies to, the trade it replies to, or the market.
// Returns null when there is no such discussion or it no longer takes
// messages. The market comment stands on its own either way.
export async function linkCommentToOpenDiscussion(
  pg: SupabaseDirectClient,
  comment: ContractComment,
  replyToBetId?: string
) {
  if (comment.isModComment) return null
  const parent = comment.replyToCommentId
    ? await pg.oneOrNone<SocialRow>(
        `select s.* from social_posts s join contract_comments cc on cc.comment_id=s.market_comment_id
         where cc.comment_id=$1 and cc.contract_id=$2`,
        [comment.replyToCommentId, comment.contractId]
      )
    : await marketDiscussionParent(
        pg,
        comment.contractId,
        replyToBetId ?? comment.betId
      )
  if (!parent || !(await isSocialThreadOpen(pg, parent))) return null
  return pg.tx(async (tx) => {
    const row = await ensureMarketCommentPost(
      tx,
      comment.id,
      comment.contractId
    )
    if (!row.parent_id) return null
    return {
      parent:
        row.parent_id === parent.id
          ? parent
          : await getSocialRow(tx, row.parent_id),
      row,
    }
  })
}

// Keeps the Yap copy of a market comment in step with an edit made on the
// market. Call in the edit's transaction, under the thread lock.
export async function syncSocialPostFromComment(
  pg: DB,
  postId: string,
  content: JSONContent
) {
  const copy = commentToYapContent(content)
  await pg.none(
    `update social_posts set text=$2, rich_content=$3, image_urls=$4, edited_time=clock_timestamp() where id=$1`,
    [postId, copy.text, copy.richContent, copy.imageUrls]
  )
}

// The row a share points at, if it exists. Never creates one: undoing a share
// must not put the item on Yap.
export async function findSocialSource(
  pg: DB,
  source: SocialPostSource
): Promise<SocialRow | null> {
  if ('postId' in source)
    return pg.oneOrNone<SocialRow>('select * from social_posts where id=$1', [
      source.postId,
    ])
  if (source.commentId)
    return pg.oneOrNone<SocialRow>(
      `select s.* from social_posts s join contract_comments cc on cc.comment_id=s.market_comment_id
       where cc.comment_id=$1 and cc.contract_id=$2`,
      [source.commentId, source.contractId]
    )
  return pg.oneOrNone<SocialRow>(
    'select * from social_posts where canonical_key=$1',
    [source.betId ? `bet:${source.betId}` : `market:${source.contractId}`]
  )
}

export async function subscribeToSocialThread(
  pg: DB,
  rootId: string,
  userId: string
) {
  // Participating must never undo a user's explicit mute.
  await pg.none(
    'insert into social_thread_subscriptions(root_id,user_id) values ($1,$2) on conflict do nothing',
    [rootId, userId]
  )
}
