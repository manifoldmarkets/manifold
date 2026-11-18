import { JSONContent } from '@tiptap/core'
import { APIError } from 'common/api/utils'
import { ContractComment } from 'common/comment'
import { SocialPostSource, isSocialImageUrl } from 'common/social-post'
import {
  commentToSocialRichContent,
  socialRichContentToText,
} from 'common/social-rich-content'
import { richTextToString } from 'common/util/parse'
import type { SocialRow } from './social-posts'
import { SupabaseDirectClient, SupabaseTransaction } from './supabase/init'

type DB = SupabaseDirectClient | SupabaseTransaction

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
    text: richContent
      ? socialRichContentToText(richContent)
      : richTextToString(content),
    richContent,
    imageUrls: [...new Set(imageUrls)].slice(0, 4),
    marketIds: [] as string[],
  }
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
  const parent = comment.replyToCommentId
    ? await ensureMarketCommentPost(pg, comment.replyToCommentId)
    : await pg.oneOrNone<SocialRow>(
        'select * from social_posts where canonical_key=$1',
        [comment.betId ? `bet:${comment.betId}` : `market:${row.contract_id}`]
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
// them as fresh posts or sending historical notifications.
export async function reconcileMarketDiscussion(pg: DB, post: SocialRow) {
  if (!post.market_comment_id && !post.canonical_key?.match(/^(market|bet):/))
    return
  const comment = post.market_comment_id
    ? await pg.oneOrNone<{ data: ContractComment }>(
        'select data from contract_comments where comment_id=$1',
        [post.market_comment_id]
      )
    : null
  const rows = await pg.manyOrNone<{ comment_id: string }>(
    `select cc.comment_id from contract_comments cc left join social_posts s on s.market_comment_id=cc.comment_id
     where s.id is null and not coalesce((cc.data->>'hidden')::boolean,false) and not coalesce((cc.data->>'deleted')::boolean,false)
     and not coalesce((cc.data->>'isModComment')::boolean,false)
     and ${
       comment
         ? "(cc.comment_id=$1 or cc.data->>'replyToCommentId'=$1)"
         : post.source_bet_id
         ? "cc.contract_id=$1 and cc.data->>'betId'=$2"
         : 'cc.contract_id=$1'
     }
     order by cc.created_time limit 500`,
    comment
      ? [comment.data.replyToCommentId ?? comment.data.id]
      : post.source_bet_id
      ? [post.source_contract_id, post.source_bet_id]
      : [post.source_contract_id]
  )
  for (const row of rows) await ensureMarketCommentPost(pg, row.comment_id)
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
