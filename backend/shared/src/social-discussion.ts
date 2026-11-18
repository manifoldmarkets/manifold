import { JSONContent } from '@tiptap/core'
import { isEqual } from 'lodash'
import { APIError } from 'common/api/utils'
import { ContractComment } from 'common/comment'
import {
  SOCIAL_POST_MAX_LENGTH,
  SocialPostSource,
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
  lockSocialThread,
  type SocialRow,
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
        : richTextToString(content)
    ),
    richContent,
    imageUrls: [...new Set(imageUrls)].slice(0, 4),
    marketIds: [] as string[],
  }
}

// Reduces a comment document to what decides whether two documents read the
// same: node types, text, marks (a link by its address only) and set attributes.
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
              ? { type: 'link', attrs: { href: mark.attrs?.href } }
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

// Market rows remain compatible with old clients; the stable association means
// both surfaces write to the same logical message and reaction collection.
export async function ensureMarketCommentPost(
  pg: DB,
  commentId: string
): Promise<SocialRow> {
  const existing = await pg.oneOrNone<SocialRow>(
    'select * from social_posts where market_comment_id=$1',
    [commentId]
  )
  if (existing) return existing
  const row = await pg.oneOrNone<{
    data: ContractComment
    contract_id: string
  }>(
    `select cc.data,cc.contract_id from contract_comments cc join contracts c on c.id=cc.contract_id
     where cc.comment_id=$1 and c.visibility='public' and not coalesce((c.data->>'deleted')::boolean,false)
       and not coalesce((cc.data->>'hidden')::boolean,false) and not coalesce((cc.data->>'deleted')::boolean,false)`,
    [commentId]
  )
  if (!row) throw new APIError(404, 'This comment is unavailable')
  const comment = row.data
  if (comment.isModComment)
    throw new APIError(400, 'Mod comments cannot be shared to Yap')
  // A trade or market row is the parent only if it belongs to this market: a
  // comment can carry a trade from a sibling market.
  const parent = comment.replyToCommentId
    ? await ensureMarketCommentPost(pg, comment.replyToCommentId)
    : await pg.oneOrNone<SocialRow>(
        'select * from social_posts where canonical_key=$1 and source_contract_id=$2',
        [
          comment.betId ? `bet:${comment.betId}` : `market:${row.contract_id}`,
          row.contract_id,
        ]
      )
  const id = `mc-${commentId}`
  const content = commentToYapContent(comment.content)
  const result = await pg.one<SocialRow>(
    `insert into social_posts(id,user_id,text,rich_content,image_urls,parent_id,root_id,market_comment_id,source_contract_id,canonical_key,feed_visible,created_time)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,millis_to_ts($11))
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
      comment.createdTime,
    ]
  )
  await pg.none(
    `update contract_comments set data=data || jsonb_build_object('socialPostId',$2::text) where comment_id=$1`,
    [commentId, result.id]
  )
  await pg.none(
    `insert into social_thread_subscriptions(root_id,user_id) values ($1,$2) on conflict do nothing`,
    [result.root_id, comment.userId]
  )
  return result
}

export async function ensureSocialSource(
  pg: DB,
  source: SocialPostSource
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
    return ensureMarketCommentPost(pg, source.commentId)
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
export async function reconcileMarketDiscussion(pg: DB, post: SocialRow) {
  if (!post.market_comment_id && !post.canonical_key?.match(/^(market|bet):/))
    return
  const comment = post.market_comment_id
    ? await pg.oneOrNone<{ data: ContractComment }>(
        'select data from contract_comments where comment_id=$1',
        [post.market_comment_id]
      )
    : null
  const unavailable = (alias: string) =>
    `(coalesce((${alias}.data->>'hidden')::boolean,false) or coalesce((${alias}.data->>'deleted')::boolean,false)
      or coalesce((${alias}.data->>'isModComment')::boolean,false))`
  const closed = (alias: string) =>
    `(${alias}.deleted_time is not null or ${alias}.hidden_time is not null)`
  // A reply is taken only if it has a place in the tree: its parent is on Yap
  // in a thread that still takes messages, or its parent can be added. A reply
  // under a hidden, deleted or mod comment, or under a post that was removed
  // from Yap, stays on the market only.
  const rows = await pg.manyOrNone<{ comment_id: string }>(
    `select cc.comment_id from contract_comments cc
     left join social_posts s on s.market_comment_id=cc.comment_id
     left join contract_comments parent on parent.comment_id=cc.data->>'replyToCommentId'
       and parent.contract_id=cc.contract_id
     left join social_posts parent_post on parent_post.market_comment_id=parent.comment_id
     left join social_posts parent_root on parent_root.id=parent_post.root_id
     where s.id is null and not ${unavailable('cc')}
     and (cc.data->>'replyToCommentId' is null
       or (parent_post.id is not null and not ${closed(
         'parent_post'
       )} and not ${closed('parent_root')})
       or (parent_post.id is null and parent.comment_id is not null and not ${unavailable(
         'parent'
       )}))
     and ${
       comment
         ? "(cc.comment_id=$1 or cc.data->>'replyToCommentId'=$1)"
         : post.source_bet_id
         ? "cc.contract_id=$1 and cc.data->>'betId'=$2"
         : 'cc.contract_id=$1'
     }
     order by cc.created_time limit ${SOCIAL_RECONCILE_BATCH}`,
    comment
      ? [comment.data.replyToCommentId ?? comment.data.id]
      : post.source_bet_id
      ? [post.source_contract_id, post.source_bet_id]
      : [post.source_contract_id]
  )
  for (const row of rows) {
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
    : // The trade or market row must belong to the market the comment is on.
      await pg.oneOrNone<SocialRow>(
        'select * from social_posts where canonical_key=$1 and source_contract_id=$2',
        [
          replyToBetId ? `bet:${replyToBetId}` : `market:${comment.contractId}`,
          comment.contractId,
        ]
      )
  if (!parent || !(await isSocialThreadOpen(pg, parent))) return null
  return pg.tx(async (tx) => {
    const locked = await lockSocialThread(tx, parent.id)
    if (!(await isSocialThreadOpen(tx, locked))) return null
    return {
      parent: locked,
      row: await ensureMarketCommentPost(tx, comment.id),
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
