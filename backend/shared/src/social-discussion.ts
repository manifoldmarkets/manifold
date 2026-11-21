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
  assertSocialInteraction,
  visibleMarketComment,
  pendingCommentSql,
  pendingAuthorSql,
  pendingBlocksJoin,
  postFitsCommentSql,
  hasChildSql,
  tradeCardJoin,
  getSocialViewer,
  getSocialRow,
  lockSocialThread,
  withCurrentBlocks,
  type SocialRow,
  type SocialViewer,
} from './social-posts'
import { SupabaseDirectClient, SupabaseTransaction } from './supabase/init'
import { log, sanitizeJsonContent } from './utils'

type DB = SupabaseDirectClient | SupabaseTransaction

// The id of a market comment's post on Yap. It is the same before the post
// exists: a comment with no post yet is shown under this id, and keeps its
// place in a thread when the post is made.
const COMMENT_POST_PREFIX = 'mc-'
export const marketCommentPostId = (commentId: string) =>
  COMMENT_POST_PREFIX + commentId
// Only an id of this form can name a comment that has no post yet, so only
// such an id needs looking up before an action. Any other is a post or nothing.
export const isMarketCommentPostId = (postId: string) =>
  postId.startsWith(COMMENT_POST_PREFIX)
export const commentOfPostId = (postId: string) =>
  isMarketCommentPostId(postId)
    ? postId.slice(COMMENT_POST_PREFIX.length)
    : null

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

// The refusal for a comment that has lost its place on Yap, or changed it,
// between the look that found it there and the locks that settle it: its card
// was removed, or its trade got a card of its own, in that moment. A person's
// action is refused with it, leaves nothing and can be sent again. A comment
// that was joining its discussion as it was written is not refused anything
// (linkCommentToOpenDiscussion).
//   gone: the comment has no place on Yap any more. Otherwise it has moved.
const placeChanged = (gone: boolean) =>
  Object.assign(
    new APIError(
      gone ? 404 : 409,
      gone
        ? 'Post not found'
        : 'This discussion changed while you were acting on it. Please try again.'
    ),
    { socialPlaceChanged: gone ? ('gone' as const) : ('moved' as const) }
  )

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
    // The comment gets its post because it is shown inside a discussion on
    // Yap: under the comment it replies to, or its trade's or market's card.
    // If it has lost that place since it was looked up (the card was removed
    // meanwhile), it gets no post. Without this it would become a post of
    // its own, which is what sharing a comment does and nothing else should.
    inDiscussion?: boolean
    // The comments already gone through on the way up from the one being
    // placed. Older data can hold two comments that reply to each other, or
    // one that replies to itself. Followed without this, the request would
    // go round them until the server stopped, holding its connection and the
    // comments' locks. Such a comment has no place on Yap and is refused.
    seen?: ReadonlySet<string>
  } = {}
): Promise<SocialRow> {
  if (options.seen?.has(commentId))
    throw new APIError(404, 'This comment is unavailable')
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
      // The sharer's blocks as they are now: a block made since the request
      // began counts for what the refusal says, as it does everywhere else.
      const sharer =
        options.asParent || !options.sharer
          ? undefined
          : await withCurrentBlocks(pg, options.sharer)
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
        {
          asParent: true,
          inDiscussion: options.inDiscussion,
          seen: new Set(options.seen).add(commentId),
        }
      )
    : await marketDiscussionParent(pg, row.contract_id, comment.betId)
  if (!parent && options.inDiscussion) throw placeChanged(true)
  if (parent) {
    const lockedParent = await lockSocialThread(pg, parent.id)
    // The card above was chosen before its thread's lock was held, so it is
    // chosen again with the lock. If the comment's trade got a card of its
    // own in between, or the card chosen was removed, the comment no longer
    // sits there: copied there, it would stay under a card its readers are
    // not shown it under. The action is refused and can be sent again. A
    // reply needs none of this: it sits under its comment's post, wherever
    // that post is.
    if (!comment.replyToCommentId) {
      const current = await marketDiscussionParent(
        pg,
        row.contract_id,
        comment.betId
      )
      if (current?.id !== parent.id)
        throw placeChanged(!current && !!options.inDiscussion)
    }
    await assertSocialInteraction(
      pg,
      lockedParent,
      await getSocialViewer(comment.userId, pg),
      true
    )
  }
  const id = marketCommentPostId(commentId)
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
  // The copy does not make its author follow the thread. A copy is made when
  // someone else acts on the comment on Yap, or shares it, or when the author
  // comments on the market, and none of those is a choice to get Yap's alerts.
  // People follow a thread by posting or replying on Yap, or by choosing
  // Follow.
  return result
}

export async function ensureSocialSource(
  pg: DB,
  source: SocialPostSource,
  // The person sharing it, when someone is.
  sharer?: SocialViewer
): Promise<SocialRow> {
  // A comment shown on Yap that has no post yet gets one by being shared.
  if ('postId' in source)
    return materializeSocialPost(pg, source.postId, sharer)
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

// A market's comments are part of its discussion on Yap whether or not they
// have a post there. Reading never makes posts: a comment with none is read
// from its market and shown as the post it would be (a "pending" row). The
// post is made when someone first acts on the comment on Yap, by
// materializeSocialPost, or when someone replies to it on its market.

type PendingComment = {
  comment_id: string
  contract_id: string
  user_id: string
  created_time: string
  content: JSONContent
}

// The row ensureMarketCommentPost would write for this comment, under the post
// it would sit under. Null for a comment whose content cannot be read.
function pendingCommentRow(
  comment: PendingComment,
  parentId: string,
  rootId: string
): SocialRow | null {
  try {
    const content = commentToYapContent(comment.content)
    return {
      id: marketCommentPostId(comment.comment_id),
      user_id: comment.user_id,
      text: content.text,
      rich_content: content.richContent,
      image_urls: content.imageUrls,
      created_time: comment.created_time,
      edited_time: null,
      parent_id: parentId,
      root_id: rootId,
      source_post_id: null,
      source_contract_id: comment.contract_id,
      source_comment_id: null,
      source_bet_id: null,
      market_comment_id: comment.comment_id,
      canonical_key: `comment:${comment.comment_id}`,
      feed_visible: false,
      hidden_time: null,
      deleted_time: null,
      deleted_by: null,
      removed_by_moderator: false,
      pending: true,
    }
  } catch (e) {
    log.warn('Left out a market comment that cannot be shown on Yap', {
      commentId: comment.comment_id,
      error: e instanceof Error ? e.message : String(e),
    })
    return null
  }
}

// Whether a discussion still takes comments from its market, asked inside the
// statement that lists them and nowhere before it. A read is several
// statements: a post can be taken off Yap after the read has looked the post
// up, and a reply written on the market after that never had a place under
// it. `post` and `thread` are placeholders for the post the comments would
// sit under and the first post of its thread. A comment that has no post yet
// has no row to be closed.
const stillOpenSql = (post: string, thread: string) =>
  `not exists (select 1 from social_posts closed where closed.id in (${post},${thread})
      and (closed.deleted_time is not null or closed.hidden_time is not null))
    and exists (select 1 from social_posts first where first.id=${thread})`

// One entry of a thread's list: a post on Yap, or a comment shown as one.
// `time` and `id` are where it sorts, and the cursor of a page that ends
// with it. An entry with neither a post nor a row is a comment that could not
// be read: it is not shown, and the page still moves past it.
export type DiscussionEntry = {
  time: string
  id: string
  postId?: string
  pending?: SocialRow
}

// What a market's or a trade's card lists: each top-level comment of the
// market (of the trade), once, in the order they were written. An entry is the
// comment's post on Yap when it has one, wherever that post sits, and
// otherwise the comment itself. One pass over the market's comments in time
// order, stopped at a page: it writes nothing, and it reads no other market's
// posts however many there are.
export async function listCardComments(
  pg: DB,
  card: SocialRow,
  viewer: SocialViewer,
  cursor: string | undefined,
  limit: number
): Promise<DiscussionEntry[]> {
  // A removed card no longer names its market. The statement asks again
  // whether it still does, for a card that is removed after it was read: it
  // lists nothing then, as it will the next time it is read.
  if (!card.source_contract_id) return []
  const [time, id] = cursor?.split('|') ?? []
  // A comment on a trade that has its own card sits under that card, and is
  // listed only while that card is open.
  const homeAuthor = 'coalesce(trade.user_id,$8)'
  // The order is the time each comment was written, then its id. Every row
  // here is a top-level comment, so the first key, the id of the comment
  // replied to, is null for all of them and changes nothing. It is there so
  // that only the index on (comment replied to, market, time) gives this
  // order: PostgreSQL then cannot choose to walk every market's comments in
  // time order looking for this market's, as it did on a market that held a
  // fifth of a test table.
  const rows = await pg.manyOrNone<
    PendingComment & {
      post_id: string | null
      parent_id: string
      root_id: string
    }
  >(
    `select cc.comment_id,cc.contract_id,cc.user_id,cc.created_time::text as created_time,
       p.id as post_id,
       case when p.id is null then cc.data->'content' end as content,
       coalesce(trade.id,$7) as parent_id, coalesce(trade.root_id,$9) as root_id
     from contract_comments cc
     join contracts c on c.id=cc.contract_id
     left join social_posts p on p.market_comment_id=cc.comment_id
     left join social_posts root on root.id=p.root_id
     ${tradeCardJoin('trade', 'p.id is null')}
     ${pendingBlocksJoin('p.id is null')}
     where cc.contract_id=$1 and (cc.data->>'replyToCommentId') is null
       and ($6::text is null or cc.data->>'betId'=$6)
       and ($3::timestamptz is null or (cc.created_time,'${COMMENT_POST_PREFIX}' || cc.comment_id)>($3::timestamptz,$4::text))
       and c.visibility='public' and not coalesce((c.data->>'deleted')::boolean,false)
       and exists (select 1 from social_posts card where card.id=$7 and card.source_contract_id=$1)
       and case when p.id is not null then
           (p.deleted_time is null or ${hasChildSql('p')})
           and p.hidden_time is null and root.hidden_time is null
           and not(p.user_id=any($2::text[])) and not(root.user_id=any($2::text[]))
         else (case when trade.id is not null
                 then trade.deleted_time is null and trade.hidden_time is null
                 else ${stillOpenSql('$7', '$9')} end)
           and ${pendingCommentSql(homeAuthor, homeAuthor, '$2', false)}
           and ${pendingAuthorSql}
         end
     order by (cc.data->>'replyToCommentId') desc, cc.created_time,'${COMMENT_POST_PREFIX}' || cc.comment_id limit $5`,
    [
      card.source_contract_id,
      viewer.blocked,
      time ?? null,
      id ?? null,
      limit,
      card.canonical_key?.startsWith('bet:') ? card.source_bet_id : null,
      card.id,
      card.user_id,
      card.root_id,
    ]
  )
  return rows.map((row) => ({
    time: row.created_time,
    id: marketCommentPostId(row.comment_id),
    ...(row.post_id
      ? { postId: row.post_id }
      : {
          pending:
            pendingCommentRow(row, row.parent_id, row.root_id) ?? undefined,
        }),
  }))
}

// What a comment's post lists: the posts under it on Yap, and the replies
// written on its market that have no post yet, merged in the order they were
// written. `parent` is the comment's post, or the comment itself when it has
// none. One statement, so a reply that gets its post while a reader pages is
// neither listed twice nor missed: it keeps its time and its id.
export async function listCommentReplies(
  pg: DB,
  parent: SocialRow,
  viewer: SocialViewer,
  cursor: string | undefined,
  limit: number
): Promise<DiscussionEntry[]> {
  const [time, id] = cursor?.split('|') ?? []
  const root =
    parent.root_id === parent.id
      ? parent
      : await getSocialRow(pg, parent.root_id)
  // The market whose replies join under this post. For a post that is on
  // Yap, only if it is its comment's own copy: replies written on the market
  // join under no other (ensureMarketCommentPost refuses), so none is listed.
  // Only what cannot change is asked here. Whether the thread is open and the
  // comment can be seen on its market is asked in the list statement itself:
  // asked here, a hide that was undone a moment later would leave the
  // market's replies out of the page, and the page would say it was the last.
  const contractId = parent.market_comment_id
    ? parent.pending
      ? parent.source_contract_id
      : (
          await pg.oneOrNone<{ contract_id: string }>(
            `select cc.contract_id from contract_comments cc join social_posts s on s.id=$2
             where cc.comment_id=$1 and ${postFitsCommentSql('s', 'cc')}`,
            [parent.market_comment_id, parent.id]
          )
        )?.contract_id ?? null
    : null
  const rows = await pg.manyOrNone<
    Partial<PendingComment> & { id: string; created_time: string }
  >(
    `select id,created_time,comment_id,contract_id,user_id,content from (
       (select p.id,p.created_time as sort_time,p.created_time::text as created_time,
          null::text as comment_id,null::text as contract_id,null::text as user_id,null::jsonb as content
        from social_posts p join social_posts root on root.id=p.root_id
        left join contract_comments cc on cc.comment_id=p.market_comment_id
        left join contracts c on c.id=coalesce(cc.contract_id,p.source_contract_id)
        where p.parent_id=$1
          and ($3::timestamptz is null or (p.created_time,p.id)>($3::timestamptz,$4::text))
          and (p.deleted_time is null or ${hasChildSql('p')})
          and p.hidden_time is null and root.hidden_time is null
          and not(p.user_id=any($2::text[])) and not(root.user_id=any($2::text[]))
          and (p.market_comment_id is null or (cc.comment_id is not null and c.visibility='public'
            and not coalesce((c.data->>'deleted')::boolean,false)))
          and (p.canonical_key is null or p.canonical_key not like 'market:%' and p.canonical_key not like 'bet:%'
            or c.visibility='public' and not coalesce((c.data->>'deleted')::boolean,false))
        order by p.created_time,p.id limit $5)
       ${
         contractId
           ? `union all
       (select '${COMMENT_POST_PREFIX}' || cc.comment_id,cc.created_time,cc.created_time::text,
          cc.comment_id,cc.contract_id,cc.user_id,cc.data->'content'
        from contract_comments cc
        join contracts c on c.id=cc.contract_id ${pendingBlocksJoin()}
        where cc.contract_id=$6 and (cc.data->>'replyToCommentId')=$7::text
          and ($3::timestamptz is null or (cc.created_time,'${COMMENT_POST_PREFIX}' || cc.comment_id)>($3::timestamptz,$4::text))
          and ${pendingCommentSql('$8', '$9', '$2')}
          and ${pendingAuthorSql}
          and ${stillOpenSql('$1', '$10')}
          and exists (select 1 from contract_comments parent
            where parent.comment_id=$7 and parent.contract_id=$6 and ${visibleMarketComment(
              'parent'
            )})
        order by cc.created_time,'${COMMENT_POST_PREFIX}' || cc.comment_id limit $5)`
           : ''
       }
     ) entries order by sort_time,id limit $5`,
    [
      parent.id,
      viewer.blocked,
      time ?? null,
      id ?? null,
      limit,
      contractId,
      parent.market_comment_id,
      parent.user_id,
      root.user_id,
      parent.root_id,
    ]
  )
  return rows.map((row) => ({
    time: row.created_time,
    id: row.id,
    ...(row.comment_id
      ? {
          pending:
            pendingCommentRow(
              row as PendingComment,
              parent.id,
              parent.root_id
            ) ?? undefined,
        }
      : { postId: row.id }),
  }))
}

// A market comment that is on Yap without a post: the row it is shown as, or
// null when it has a post, or is not on Yap at all. It is on Yap when the
// comment it replies to is, or, for a top-level comment, when its trade or
// its market has a card; and when ensureMarketCommentPost would place it
// there. Reads only.
//   above: receives the comments above it that have no post either, the
//     highest first, when the comment is found, and is left as it was when
//     it is not. Everything above those is a post.
//   seen: the comments already looked at on the way up. A comment written
//     since May 2026 replies to a top-level comment or to none; older ones
//     could reply to a reply, to any depth, so the way up has no fixed
//     length. It ends at a post, at a top-level comment, or here, at a
//     comment met before.
export async function findPendingCommentPost(
  pg: DB,
  commentId: string,
  above: SocialRow[] = [],
  seen = new Set<string>()
): Promise<SocialRow | null> {
  if (seen.has(commentId)) return null
  seen.add(commentId)
  const found = await pg.manyOrNone<
    PendingComment & {
      reply_to: string | null
      bet_id: string | null
      creator_id: string
      blocks: string[]
    }
  >(
    `select cc.comment_id,cc.contract_id,cc.user_id,cc.created_time::text as created_time,
       cc.data->'content' as content, cc.data->>'replyToCommentId' as reply_to, cc.data->>'betId' as bet_id,
       c.creator_id,
       coalesce(pu.data->'blockedUserIds','[]'::jsonb) || coalesce(pu.data->'blockedByUserIds','[]'::jsonb) as blocks
     from contract_comments cc
     join contracts c on c.id=cc.contract_id left join private_users pu on pu.id=cc.user_id
     where cc.comment_id=$1 and ${visibleMarketComment('cc')}
       and jsonb_typeof(cc.data->'content')='object'
       and c.visibility='public' and not coalesce((c.data->>'deleted')::boolean,false)
       and exists (select 1 from users author where author.id=cc.user_id)
       and not exists (select 1 from social_posts copied where copied.market_comment_id=cc.comment_id)`,
    [commentId]
  )
  if (found.length !== 1) return null
  const [comment] = found
  // An empty id of a comment replied to is neither a reply nor a top-level
  // comment to the lists, so such a comment has no place on Yap.
  if (comment.reply_to === '') return null
  // The post of the comment it replies to, if that post is the comment's own
  // copy and the comment is still to be seen on its market: replies written
  // on the market join under no other (ensureMarketCommentPost refuses).
  const repliedToPost = () =>
    pg.oneOrNone<SocialRow>(
      `select s.* from social_posts s join contract_comments cc on cc.comment_id=s.market_comment_id
       where cc.comment_id=$1 and cc.contract_id=$2 and ${postFitsCommentSql(
         's',
         'cc'
       )} and ${visibleMarketComment('cc')}`,
      [comment.reply_to, comment.contract_id]
    )
  // Under the comment it replies to, which may itself have no post yet, or
  // under its trade's or its market's card. The comment replied to can be
  // given its post between the look for that post and the look for a comment
  // without one; neither look then finds it, and a last one does.
  // The comments above are added to `above` on the way back down, each once.
  // If this comment turns out not to be on Yap, what its way up added is
  // taken off again.
  const before = above.length
  const notOnYap = () => {
    above.length = before
    return null
  }
  const parent = comment.reply_to
    ? (await repliedToPost()) ??
      (await findPendingCommentPost(pg, comment.reply_to, above, seen)) ??
      (await repliedToPost())
    : await marketDiscussionParent(
        pg,
        comment.contract_id,
        comment.bet_id ?? undefined
      )
  if (
    !parent ||
    (parent.pending && parent.source_contract_id !== comment.contract_id) ||
    !(await isSocialThreadOpen(pg, parent))
  )
    return notOnYap()
  const root =
    parent.root_id === parent.id
      ? parent
      : await getSocialRow(pg, parent.root_id)
  if (
    [parent.user_id, root.user_id, comment.creator_id].some((id) =>
      comment.blocks.includes(id)
    )
  )
    return notOnYap()
  const row = pendingCommentRow(comment, parent.id, parent.root_id)
  if (!row) return notOnYap()
  if (parent.pending) above.push(parent)
  return row
}

const storedPost = (pg: DB, id: string) =>
  pg.oneOrNone<SocialRow>('select * from social_posts where id=$1', [id])

// For an id that named no post a moment ago: the comment shown under it, or
// the post that comment has been given since. A comment can be given its post
// between the look for a post and the look for a comment without one; neither
// look then finds it, and a last one does. `above` is findPendingCommentPost's.
export async function findPendingPost(
  pg: DB,
  id: string,
  above: SocialRow[] = []
) {
  const commentId = commentOfPostId(id)
  if (!commentId) return null
  return (
    (await findPendingCommentPost(pg, commentId, above)) ??
    (await storedPost(pg, id))
  )
}

// A post by its id, for reading: its row, or the comment shown under that id
// when it has no post yet. Null when the id names neither.
export async function findSocialPost(
  pg: DB,
  id: string,
  above: SocialRow[] = []
) {
  return (await storedPost(pg, id)) ?? (await findPendingPost(pg, id, above))
}
export async function getSocialPostForRead(
  pg: DB,
  id: string,
  above: SocialRow[] = []
) {
  // Any id that is not a comment's is a post or nothing.
  if (!isMarketCommentPostId(id)) return getSocialRow(pg, id)
  const row = await findSocialPost(pg, id, above)
  if (!row) throw new APIError(404, 'Post not found')
  return row
}

// A post by its id, for acting on it. A comment that is on Yap without a post
// gets its post here: this is where copies are made, when someone replies to
// the comment on Yap, likes it, shares or quotes it, edits or removes it, or
// reports it. Only a comment that is shown on Yap is given one, and only in
// the place it is shown, so an id cannot be used to put any market's comment
// there. Call it in the action's transaction: if the action is refused, the
// copy is undone with it.
export async function materializeSocialPost(
  pg: DB,
  id: string,
  // The person sharing it, when someone is.
  sharer?: SocialViewer
): Promise<SocialRow> {
  const row = await storedPost(pg, id)
  if (row) return row
  const commentId = commentOfPostId(id)
  const pending = commentId ? await findPendingCommentPost(pg, commentId) : null
  if (!commentId || !pending) {
    // Someone else may have given it its post between those two looks.
    const made = commentId ? await storedPost(pg, id) : null
    if (made) return made
    throw new APIError(404, 'Post not found')
  }
  return ensureMarketCommentPost(
    pg,
    commentId,
    pending.source_contract_id ?? undefined,
    { sharer, inDiscussion: true }
  )
}

// The comment that a new market comment names as the one it replies to, when
// it is written on Yap in answer to `commentId`: the top-level comment of that
// comment's thread. The market takes replies to top-level comments only, and
// its own pages put an answer to a reply under the top-level comment too.
//
// Usually that is the comment itself or the one it replies to. Older data has
// replies to replies, so the way up can take more steps. It is followed inside
// the comment's own market, and never through the same comment twice. A reply
// id that is empty counts as none, as it does where comments are written.
//
// If the way up does not end at a top-level comment (the comment replied to is
// missing, or the replies go round in a circle), the answer is the one given
// before this walk existed: the comment's own parent. The market then refuses
// the write itself, as it did.
//
// No thread on a market is anywhere near MARKET_REPLY_MAX_STEPS deep. The
// limit only keeps one request from walking an absurd chain.
const MARKET_REPLY_MAX_STEPS = 50
export async function marketReplyTarget(
  pg: DB,
  contractId: string,
  commentId: string
) {
  const found = await pg.oneOrNone<{ id: string | null }>(
    `with recursive up as (
       select cc.comment_id, nullif(cc.data->>'replyToCommentId','') as reply_to,
         array[cc.comment_id] as path
       from contract_comments cc where cc.contract_id=$1 and cc.comment_id=$2
       union all
       select parent.comment_id, nullif(parent.data->>'replyToCommentId',''),
         up.path || parent.comment_id
       from up join contract_comments parent
         on parent.contract_id=$1 and parent.comment_id=up.reply_to
       where parent.comment_id<>all(up.path) and cardinality(up.path)<$3
     )
     select coalesce(
       (select comment_id from up where reply_to is null),
       (select reply_to from up where cardinality(path)=1)
     ) as id`,
    [contractId, commentId, MARKET_REPLY_MAX_STEPS]
  )
  return found?.id ?? commentId
}

// A comment written on its market joins a discussion that is already on Yap:
// under the comment it replies to, the trade it replies to, or the market.
// Returns null when there is no such discussion or it no longer takes
// messages. The market comment stands on its own either way.
export async function linkCommentToOpenDiscussion(
  pg: SupabaseDirectClient,
  comment: ContractComment,
  replyToBetId?: string,
  // Whether to look once more if the comment's place moves while it joins.
  again = true
): Promise<{ parent: SocialRow; row: SocialRow } | null> {
  if (comment.isModComment) return null
  const repliedToPost = () =>
    pg.oneOrNone<SocialRow>(
      `select s.* from social_posts s join contract_comments cc on cc.comment_id=s.market_comment_id
       where cc.comment_id=$1 and cc.contract_id=$2`,
      [comment.replyToCommentId, comment.contractId]
    )
  // The comment replied to may be on Yap without a post of its own. A reply
  // to it is the first thing to need that post, so it is made with the
  // reply's, and the people following the thread hear of the reply. It can
  // also be given its post between the two looks, so a last one follows.
  const parent = comment.replyToCommentId
    ? (await repliedToPost()) ??
      (await findPendingCommentPost(pg, comment.replyToCommentId)) ??
      (await repliedToPost())
    : await marketDiscussionParent(
        pg,
        comment.contractId,
        replyToBetId ?? comment.betId
      )
  if (
    !parent ||
    (parent.pending && parent.source_contract_id !== comment.contractId) ||
    !(await isSocialThreadOpen(pg, parent))
  )
    return null
  try {
    return await pg.tx(async (tx) => {
      // In the discussion found above or not at all: if its card has been
      // removed since, the comment stays on its market only.
      const row = await ensureMarketCommentPost(
        tx,
        comment.id,
        comment.contractId,
        { inDiscussion: true }
      )
      if (!row.parent_id) return null
      return {
        parent:
          row.parent_id === parent.id && !parent.pending
            ? parent
            : await getSocialRow(tx, row.parent_id),
        row,
      }
    })
  } catch (e) {
    // The place found above went, or moved, before the copy was made: the
    // card was removed, or the trade got a card of its own. An ordinary
    // event, so it is not passed on as a failure.
    const change = (e as { socialPlaceChanged?: 'gone' | 'moved' } | null)
      ?.socialPlaceChanged
    // Moved: once more from the top, in a transaction of its own, so that
    // the comment joins the thread it now sits in and the people following
    // that thread hear of it. Nobody is there to send it again.
    if (change === 'moved' && again)
      return linkCommentToOpenDiscussion(pg, comment, replyToBetId, false)
    // Gone: the comment has no place on Yap now, and stays on its market.
    // Moved a second time: it stays on its market too, Yap lists it from
    // there, and it gets its post when someone first acts on it.
    if (change) return null
    throw e
  }
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
