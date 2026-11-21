import { writeCommentReaction } from 'shared/supabase/comment-reactions'
import {
  SocialPostPage,
  socialTimestamp,
  socialTimestampMillis,
  hasSocialPostContent,
  isSocialPostEditable,
  canCommentFromSocialPost,
  isSocialMarketSource,
  SocialMarketSource,
  socialCommentFits,
  SOCIAL_COMMENT_TOO_LONG,
} from 'common/social-post'
import { JSONContent } from '@tiptap/core'
import {
  DiscussionEntry,
  commentOfPostId,
  ensureMarketCommentPost,
  findSocialPost,
  getSocialPostForRead,
  isCommentYapRepresentable,
  isMarketCommentPostId,
  listCardComments,
  listCommentReplies,
  materializeSocialPost,
  subscribeToSocialThread,
} from 'shared/social-discussion'
import {
  passesNewAccountGate,
  newAccountGateMessage,
} from 'shared/new-account-gate'
import { ValidatedAPIParams } from 'common/api/schema'
import { ContractComment } from 'common/comment'
import { contractPath } from 'common/contract'
import { isAdminId, isModId } from 'common/envs/constants'
import { User } from 'common/user'
import { APIHandler, APIError, AuthedUser } from './helpers/endpoint'
import {
  onlyUsersWhoCanPerformAction,
  throwIfBannedFromAction,
} from './helpers/rate-limit'
import {
  createCommentOnContractInternal,
  newCommentId,
  validateComment,
} from './create-comment'
import { editCommentContentInternal } from './edit-comment'
import { hasNaughtyEmbeds } from './post'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { nanoid } from 'common/util/random'
import { DisplayUser } from 'common/api/user-types'
import { convertEntitlement } from 'common/shop/types'
import {
  socialPostToCommentContent,
  socialRichContentToText,
} from 'common/social-rich-content'
import { trackPublicEvent } from 'shared/analytics'
import { notifySocialMentions } from 'shared/social-mentions'
import { getComment } from 'shared/supabase/contract-comments'
import { updateData } from 'shared/supabase/utils'
import { getContract, log, revalidateContractStaticProps } from 'shared/utils'
import {
  assertSocialInteraction,
  visibleMarketComment,
  getSocialEditContent,
  getSocialViewer,
  hydrateSocialPosts,
  limitSocialWrite,
  lockSocialThread,
  notifySocial,
  socialAuthor,
  SocialRow,
  SocialViewer,
  validateSocialMarkets,
  validateSocialRichContent,
  validateSocialSource,
  withCurrentBlocks,
  withoutRepeatedMarket,
  writeSocialMarkets,
} from 'shared/social-posts'

// A Yap that also comments on its market is refused when its author has a
// block with the market's creator.
const assertNoBlockWithCreator = (viewer: SocialViewer, creatorId: string) => {
  if (viewer.blocked.includes(creatorId))
    throw new APIError(
      403,
      'You cannot comment on this market because of a block'
    )
}

export const createSocialPost: APIHandler<'create-social-post'> =
  onlyUsersWhoCanPerformAction(
    'post',
    async ({ content, parentId, source, alsoComment }, auth, req) => {
      if (
        !alsoComment &&
        source &&
        !parentId &&
        !content.text.trim() &&
        !content.imageUrls?.length
      ) {
        const { repostSocialPost } = await import('./social-sharing')
        return repostSocialPost({ source, remove: false }, auth, req)
      }
      const pg = createSupabaseDirectClient()
      const author = await socialAuthor(auth.uid, !parentId)
      const viewer = await getSocialViewer(auth.uid)
      const id = nanoid(16)
      let commentSource =
        alsoComment &&
        !parentId &&
        isSocialMarketSource(source) &&
        canCommentFromSocialPost(content, source)
          ? source
          : undefined
      if (alsoComment && !commentSource)
        throw new APIError(
          400,
          'Only top-level posts shared from a market, with text or an image, can also comment on it'
        )
      // Check the market comment is allowed before publishing, so an ineligible
      // comment fails the whole request rather than leaving a Yap without it.
      // The block with the market's creator is asked about again under the
      // locks, with the other checks of this write.
      let commentedCreatorId: string | undefined
      if (commentSource) {
        if (!socialCommentFits(content))
          throw new APIError(400, SOCIAL_COMMENT_TOO_LONG)
        const { contract } = await validateComment(
          commentSource.contractId,
          auth.uid,
          socialPostToCommentContent(content),
          undefined,
          undefined
        )
        commentedCreatorId = contract.creatorId
        assertNoBlockWithCreator(viewer, commentedCreatorId)
      }
      // A quoted post whose id is a comment's: the comment may be on Yap
      // without a post of its own, and quoting it gives it one.
      const quotedId =
        source && 'postId' in source && isMarketCommentPostId(source.postId)
          ? source.postId
          : undefined
      // A reply that also quotes such a comment (the app sends none) gives it
      // its post in a transaction of its own, first. Giving a comment its post
      // takes the comment's lock and then its thread's, and the reply below
      // does the same for the post it replies to. In one transaction the
      // second comment's lock would be asked for while a thread's is held,
      // the wrong way round, and two requests could wait on each other. The
      // price: this one copy stays if the reply is then refused. A reply that
      // quotes the very comment it replies to has one comment to lock, so it
      // needs none of this.
      if (quotedId && parentId && quotedId !== parentId)
        await pg.tx((tx) => materializeSocialPost(tx, quotedId, viewer))
      // The Yap, its market comment and its repost rows commit together or not
      // at all, so an edit or a removal never finds one without the others.
      const { row, parent, marketComment, repost } = await pg.tx(async (tx) => {
        // Quoting a comment that has no post yet gives it one, and so does
        // replying to one, in this transaction: a Yap that is refused leaves
        // nothing behind.
        if (quotedId && !parentId)
          await materializeSocialPost(tx, quotedId, viewer)
        if (parentId && isMarketCommentPostId(parentId))
          await materializeSocialPost(tx, parentId)
        const sharedComment =
          commentSource?.commentId && !parentId
            ? await ensureMarketCommentPost(
                tx,
                commentSource.commentId,
                commentSource.contractId,
                { sharer: viewer }
              )
            : null
        const parent = parentId
          ? await lockSocialThread(tx, parentId)
          : sharedComment
          ? await lockSocialThread(tx, sharedComment.id)
          : null
        // The blocks every check from here on goes by: the person's own, read
        // again now that the locks above are held (withCurrentBlocks). The
        // thread, a comment that is quoted, the people who are mentioned and
        // the creator of a market this Yap also comments on are all checked
        // against the same list.
        const writer = await withCurrentBlocks(tx, viewer)
        if (commentedCreatorId)
          assertNoBlockWithCreator(writer, commentedCreatorId)
        if (parent) await assertSocialInteraction(tx, parent, writer, true)
        if (parent?.market_comment_id) {
          const target = await getComment(tx, parent.market_comment_id)
          commentSource = {
            contractId: target.contractId,
            commentId: target.id,
          }
        } else if (
          parent?.canonical_key?.match(/^(market|bet):/) &&
          parent.source_contract_id
        ) {
          commentSource = {
            contractId: parent.source_contract_id,
            ...(parent.source_bet_id ? { betId: parent.source_bet_id } : {}),
          }
        }
        if (
          parentId &&
          !commentSource &&
          !(await passesNewAccountGate(tx, author))
        )
          throw new APIError(403, newAccountGateMessage('Replying'))
        const commentId = commentSource ? newCommentId() : null
        await limitSocialWrite(
          tx,
          auth.uid,
          parent ? 'reply' : 'post',
          parent ? 60 : 10
        )
        await validateSocialMarkets(tx, content.marketIds)
        const richContent = await validateSocialRichContent(
          tx,
          content.richContent,
          writer
        )
        await validateSocialSource(tx, source, content.marketIds, writer)
        const text = richContent
          ? socialRichContentToText(richContent)
          : content.text
        // Mentions now carry their current labels: size the comment as written.
        if (
          commentSource &&
          !socialCommentFits({
            text,
            richContent,
            imageUrls: content.imageUrls,
          })
        )
          throw new APIError(400, SOCIAL_COMMENT_TOO_LONG)
        const marketSource = isSocialMarketSource(source) ? source : undefined
        const row = await tx.one<SocialRow>(
          `insert into social_posts(id, user_id, text, parent_id, root_id, source_contract_id, source_comment_id, source_bet_id, image_urls, source_post_id, rich_content, market_comment_id, feed_visible)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
          [
            id,
            auth.uid,
            text,
            parent?.id ?? null,
            parent?.root_id ?? id,
            marketSource?.contractId ?? commentSource?.contractId ?? null,
            marketSource?.commentId ?? null,
            marketSource?.betId ?? null,
            content.imageUrls ?? [],
            source && 'postId' in source ? source.postId : null,
            richContent,
            commentId,
            !parentId,
          ]
        )
        await writeSocialMarkets(tx, id, content.marketIds)
        await subscribeToSocialThread(tx, row.root_id, auth.uid)
        const marketComment =
          commentSource && commentId
            ? await commentFromSocialPost(
                tx,
                row,
                commentSource,
                commentId,
                auth
              )
            : undefined
        const repost =
          !parentId && isSocialMarketSource(source)
            ? await recordSocialRepost(
                tx,
                id,
                source,
                author,
                marketComment?.comment
              )
            : undefined
        return { row, parent, marketComment, repost }
      })
      // Announce the comment as soon as it is committed, as an ordinary comment
      // is, before anything else can edit or remove it.
      marketComment?.announce()
      return {
        result: (await hydrateSocialPosts(pg, [row], viewer))[0],
        continue: async () => {
          // First, so a later failure (an API caller's comment fee, say) cannot
          // skip it. It logs its own errors rather than throwing.
          if (repost)
            await trackPublicEvent(author.id, 'repost', {
              ...repost,
              content: !!row.text,
              socialPostId: id,
            })
          if (parent && !marketComment)
            await notifySocial(pg, parent, author, 'reply', id)
          // The market comment notifies the same tagged users.
          if (marketComment) await marketComment.continue()
          if (!marketComment)
            await notifySocialMentions(pg, row, author, parent?.user_id)
        },
      }
    }
  )

// Posts a Yap's text on its source market: in the quoted comment's thread, as
// a reply to the quoted trade, or as a new top-level comment. The comment is
// written in the Yap's transaction and announced once that commits.
async function commentFromSocialPost(
  tx: SupabaseTransaction,
  row: SocialRow,
  source: SocialMarketSource,
  commentId: string,
  auth: AuthedUser
) {
  const replyToCommentId = source.commentId
    ? await tx.one<string>(
        `select coalesce(data->>'replyToCommentId', comment_id) as id
        from contract_comments where comment_id = $1`,
        [source.commentId],
        (r) => r.id
      )
    : undefined
  const {
    result,
    announce,
    continue: next,
  } = await createCommentOnContractInternal(
    source.contractId,
    auth,
    {
      content: socialPostToCommentContent({
        text: row.text,
        richContent: row.rich_content,
        imageUrls: row.image_urls,
      }),
      replyToCommentId,
      replyToBetId: replyToCommentId ? undefined : source.betId,
      isRepost: true,
      socialPostId: row.id,
      id: commentId,
    },
    tx
  )
  return { comment: result, announce, continue: next }
}

// Before Yap, reposts wrote a `posts` row (followers' Explore feed) and a
// 'page repost' interaction (topic interests, conversion score). Keep both.
// The `posts` row names its Yap, so deleting the Yap withdraws the repost.
async function recordSocialRepost(
  tx: SupabaseTransaction,
  postId: string,
  source: SocialMarketSource,
  author: User,
  marketComment: ContractComment | undefined
) {
  const commentId = marketComment?.id ?? source.commentId
  const betId = marketComment?.betId ?? source.betId
  const quoted =
    !marketComment && source.commentId
      ? await tx.oneOrNone<{ user_id: string; content: JSONContent }>(
          `select user_id, data->'content' as content from contract_comments where comment_id = $1`,
          [source.commentId]
        )
      : null
  // The feed renders reposts as full comment cards: only comments it may show.
  const feedCommentId =
    marketComment?.id ??
    (quoted && !hasNaughtyEmbeds(quoted.content) ? source.commentId : null)
  if (feedCommentId)
    await tx.none(
      `insert into posts (contract_id, contract_comment_id, bet_id, user_id, user_name, user_username, user_avatar_url, social_post_id)
      values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        source.contractId,
        feedCommentId,
        betId ?? null,
        author.id,
        author.name,
        author.username,
        author.avatarUrl ?? '',
        postId,
      ]
    )
  await tx.none(
    `insert into user_contract_interactions (user_id, contract_id, name, comment_id, bet_id)
    select $1, $2, 'page repost', $3, $4 from contracts c where c.id=$2 and c.creator_id<>$1`,
    [author.id, source.contractId, commentId ?? null, betId ?? null]
  )
  return {
    contractId: source.contractId,
    commentId,
    betId,
    isContentOwner: marketComment
      ? true
      : quoted
      ? quoted.user_id === author.id
      : undefined,
  }
}

// Keeps the market comment in step with a Yap edit. Runs inside the edit's
// thread lock, so concurrent edits cannot leave the two out of order. Removing
// the text and images leaves the last comment rather than blanking it.
async function syncSocialComment(
  tx: SupabaseTransaction,
  row: SocialRow,
  editorId: string
) {
  if (!row.market_comment_id) return
  if (!row.text && !row.image_urls.length)
    throw new APIError(400, 'Keep text or an image in this shared comment.')
  const comment = await getComment(tx, row.market_comment_id)
  if (
    comment.deleted ||
    comment.isModComment ||
    comment.userId !== row.user_id ||
    (!!row.source_contract_id && row.source_contract_id !== comment.contractId)
  )
    throw new APIError(409, 'The linked market comment is unavailable')
  if (editorId !== comment.userId && !isAdminId(editorId))
    throw new APIError(403, 'Only the comment author or an admin may edit')
  await throwIfBannedFromAction(tx, editorId, 'comment')
  // An edit made here replaces the market comment with what Yap's editor
  // holds. A comment with formatting Yap cannot hold is edited on its market.
  if (!isCommentYapRepresentable(comment.content))
    throw new APIError(
      400,
      'This comment has formatting Yap cannot keep. Edit it on its market.'
    )
  const content = {
    text: row.text,
    richContent: row.rich_content,
    imageUrls: row.image_urls,
  }
  if (!socialCommentFits(content))
    throw new APIError(400, SOCIAL_COMMENT_TOO_LONG)
  const { contract, contentJson } = await validateComment(
    comment.contractId,
    editorId,
    socialPostToCommentContent(content),
    undefined,
    undefined,
    tx
  )
  await editCommentContentInternal(tx, contract, comment, editorId, contentJson)
  return contract
}

// Linked mutations take the native comment lock before the Yap thread lock,
// matching market edits, moderation and first-time materialization. A comment
// that is on Yap without a post gets its post first, which takes the same two
// locks in the same order.
async function lockPostForCommentChange(tx: SupabaseTransaction, id: string) {
  if (isMarketCommentPostId(id)) await materializeSocialPost(tx, id)
  await tx.oneOrNone(
    `select cc.comment_id from contract_comments cc join social_posts p
    on p.market_comment_id=cc.comment_id where p.id=$1 for update of cc`,
    [id]
  )
  return lockSocialThread(tx, id)
}

export const editSocialPost: APIHandler<'edit-social-post'> =
  onlyUsersWhoCanPerformAction('editComment', async ({ id, content }, auth) => {
    const pg = createSupabaseDirectClient()
    await socialAuthor(auth.uid)
    const viewer = await getSocialViewer(auth.uid)
    const { row, commentContract } = await pg.tx(async (tx) => {
      const post = await lockPostForCommentChange(tx, id)
      if (
        post.user_id !== auth.uid &&
        !(post.market_comment_id && isAdminId(auth.uid))
      )
        throw new APIError(403, 'Only the author can edit this post')
      if (post.canonical_key?.match(/^(market|bet):/))
        throw new APIError(
          400,
          'Edit the original market instead of its shared card'
        )
      if (post.deleted_time)
        throw new APIError(403, 'This post has been removed')
      if (
        !post.market_comment_id &&
        !isSocialPostEditable(socialTimestampMillis(post.created_time))
      )
        throw new APIError(
          403,
          'Yap posts can only be edited within 30 minutes of posting.'
        )
      if (!hasSocialPostContent(content) && !post.source_post_id)
        throw new APIError(400, 'Add text, a market, or an image')
      await limitSocialWrite(tx, auth.uid, 'edit', 30)
      await validateSocialMarkets(tx, content.marketIds)
      const richContent =
        content.richContent === undefined && content.text === post.text
          ? post.rich_content
          : await validateSocialRichContent(
              tx,
              content.richContent,
              // The editor's blocks as they are with the post locked: an edit
              // can be the first action on a comment, and so place it.
              await withCurrentBlocks(tx, viewer),
              post.rich_content
            )
      await writeSocialMarkets(tx, id, content.marketIds)
      // Removing the original attachment also removes the repost context.
      const row = await tx.one<SocialRow>(
        `update social_posts set text=$2, image_urls=$4, rich_content=$5, edited_time=clock_timestamp(),
      source_contract_id=case when market_comment_id is not null or source_contract_id=any($3::text[]) then source_contract_id else null end,
      source_comment_id=case when source_contract_id=any($3::text[]) then source_comment_id else null end,
      source_bet_id=case when source_contract_id=any($3::text[]) then source_bet_id else null end
      where id=$1 returning *`,
        [
          id,
          richContent ? socialRichContentToText(richContent) : content.text,
          content.marketIds,
          content.imageUrls ?? post.image_urls,
          richContent ?? null,
        ]
      )
      return {
        row,
        commentContract: await syncSocialComment(tx, row, auth.uid),
      }
    })
    if (commentContract)
      await revalidateContractStaticProps(commentContract).catch((e) =>
        log.error('Failed to revalidate market after Yap edit', { e, id })
      )
    return (await hydrateSocialPosts(pg, [row], viewer))[0]
  })

export const deleteSocialPost: APIHandler<'delete-social-post'> = async (
  { id },
  auth
) => {
  const pg = createSupabaseDirectClient()
  await socialAuthor(auth.uid)
  const removed = await pg.tx(async (tx) => {
    const post = await lockPostForCommentChange(tx, id)
    return removeLockedPost(tx, post, auth.uid)
  })
  if (removed) {
    await revalidateContractStaticProps(removed.contract).catch((e) =>
      log.error('Failed to revalidate market after Yap removal', { e, id })
    )
    if (removed.deleted)
      await trackPublicEvent(auth.uid, 'delete_comment', {
        contractId: removed.contract.id,
        commentId: removed.commentId,
        deleted: true,
        userId: auth.uid,
        socialPostId: id,
      })
  }
  return { success: true }
}

async function removeLockedPost(
  tx: SupabaseTransaction,
  post: SocialRow,
  actorId: string
) {
  const moderator = isAdminId(actorId) || isModId(actorId)
  if (post.user_id !== actorId && !moderator)
    throw new APIError(
      403,
      'Only the author or a moderator can remove this post'
    )
  // A moderator removing someone else's shared comment also deletes it on
  // its market, under the market's rules for that: not a comment by an admin
  // or moderator, and not while banned from moderating comments. An author
  // removing their own post takes it off Yap only, because authors cannot
  // delete market comments.
  const removesComment = !!post.market_comment_id && post.user_id !== actorId
  if (removesComment && (isAdminId(post.user_id) || isModId(post.user_id)))
    throw new APIError(
      403,
      'You cannot remove a shared comment by an admin or moderator'
    )
  if (post.canonical_key?.match(/^(market|bet):/) && !moderator)
    throw new APIError(
      403,
      'Undo your re-Yap to remove your share of this item'
    )
  if (post.deleted_time) return undefined
  if (removesComment) await throwIfBannedFromAction(tx, actorId, 'hideComment')
  await withdrawLockedPost(tx, post, actorId)
  if (!post.market_comment_id) return null
  if (removesComment)
    return deleteSocialComment(tx, post.market_comment_id, actorId, post)
  // The author's comment stays on its market and no longer points at Yap.
  // This row keeps its link, so the comment is not copied to Yap again.
  await tx.none(
    `update contract_comments set data = data - 'socialPostId' - 'isRepost' where comment_id = $1 and data->>'socialPostId'=$2`,
    [post.market_comment_id, post.id]
  )
  const comment = await getComment(tx, post.market_comment_id).catch(() => null)
  const contract = comment ? await getContract(tx, comment.contractId) : null
  return contract
    ? { contract, commentId: post.market_comment_id, deleted: false }
    : null
}

// The native endpoint has already authorized the market action in this transaction.
export async function withdrawLockedPost(
  tx: SupabaseTransaction,
  post: SocialRow,
  actorId: string
) {
  const id = post.id
  await tx.none(
    `update social_posts set text='', rich_content=null, image_urls='{}', deleted_time=clock_timestamp(), deleted_by=$2, removed_by_moderator=$3,
      source_contract_id=null, source_comment_id=null, source_bet_id=null, source_post_id=null where id=$1`,
    [id, actorId, post.user_id !== actorId]
  )
  await tx.none('delete from social_post_markets where post_id=$1', [id])
  await tx.none(
    "delete from user_reactions where content_type='social_post' and content_id=$1",
    [id]
  )
  await tx.none(
    `delete from user_notifications
      where (data->>'sourceId'=$1 or data->>'sourceSlug'='/yap/' || $1)
      and data->>'sourceType' in ('social_reply','social_post_like','social_repost')`,
    [id]
  )
  await tx.none('delete from user_notifications where notification_id=$1', [
    `social-mention-${id}`,
  ])
  // Deleting a Yap withdraws its repost from followers' feeds.
  await tx.none('delete from posts where social_post_id=$1', [id])
  await tx.none('update social_reposts set active=false where post_id=$1', [id])
}

// Deletes a moderated Yap's market comment as hide-comment's delete action
// would, including its refusal to delete comments by admins and moderators.
async function deleteSocialComment(
  tx: SupabaseTransaction,
  commentId: string,
  moderatorId: string,
  post: SocialRow
) {
  const comment = await getComment(tx, commentId).catch(() => null)
  if (
    !comment ||
    comment.deleted ||
    comment.userId !== post.user_id ||
    (!!post.source_contract_id &&
      post.source_contract_id !== comment.contractId) ||
    isAdminId(comment.userId) ||
    isModId(comment.userId)
  )
    return null
  await updateData(tx, 'contract_comments', 'comment_id', {
    comment_id: commentId,
    deleted: true,
    deletedTime: Date.now(),
    deleterId: moderatorId,
  })
  const contract = await getContract(tx, comment.contractId)
  return contract ? { contract, commentId, deleted: true } : null
}

export const getSocialPosts: APIHandler<'get-social-posts'> = async (
  props,
  auth
) => {
  if (
    props.forModeration &&
    (!auth || (!isAdminId(auth.uid) && !isModId(auth.uid)))
  )
    throw new APIError(403, 'Only moderators can request moderation content')
  const pg = createSupabaseDirectClient()
  const viewer = props.forModeration
    ? { id: auth?.uid, blocked: [] }
    : await getSocialViewer(auth?.uid)
  if (props.ids) {
    const rows = await pg.manyOrNone<SocialRow>(
      'select * from social_posts where id=any($1::text[])',
      [props.ids]
    )
    // Posts only. A comment that is on Yap without a post of its own is read
    // through its thread or its own page (get-social-post), one at a time:
    // finding its place takes several lookups, and this read takes fifty ids.
    return {
      posts: await hydrateSocialPosts(pg, rows, viewer, false),
      nextCursor: null,
    }
  }
  return readSocialPosts(pg, viewer, props)
}

// The rows of posts already chosen for a page, each with the time it was last
// shared by someone the reader sees, as the timeline works it out.
const postsWithFeedTime = (
  pg: SupabaseDirectClient,
  viewer: SocialViewer,
  ids: string[]
) =>
  ids.length
    ? pg.manyOrNone<SocialRow>(
        `select p.*, greatest(p.created_time,coalesce(shares.bumped_time,p.created_time)) as feed_time
        from social_posts p
        left join contract_comments cc on cc.comment_id=p.market_comment_id
        left join contracts c on c.id=coalesce(cc.contract_id,p.source_contract_id)
        left join lateral (
          select max(r.bumped_time) as bumped_time from social_reposts r
          where r.post_id=p.id and r.active and not(r.user_id=any($2::text[]))
            and r.user_id<>p.user_id and r.user_id is distinct from c.creator_id
        ) shares on true
        where p.id=any($1::text[])`,
        [ids, viewer.blocked]
      )
    : Promise.resolve([])

// Reading never writes. A market's card lists the market's comments and a
// comment lists its replies whether or not each has a post on Yap: one that
// has none is read from its market and shown as the post it would be. The
// post is made when someone acts on it (materializeSocialPost).
export async function readSocialPosts(
  pg: SupabaseDirectClient,
  viewer: SocialViewer,
  { parentId, cursor, limit }: ValidatedAPIParams<'get-social-posts'>
): Promise<SocialPostPage> {
  const parent = parentId ? await getSocialPostForRead(pg, parentId) : null
  const marketThread = parent?.canonical_key?.startsWith('market:')
  const betThread = parent?.canonical_key?.startsWith('bet:')
  const card = marketThread || betThread
  if (parent && (card || parent.market_comment_id)) {
    const entries: DiscussionEntry[] = card
      ? await listCardComments(pg, parent, viewer, cursor, limit + 1)
      : await listCommentReplies(pg, parent, viewer, cursor, limit + 1)
    const page = entries.slice(0, limit)
    const last = page[page.length - 1]
    const stored = new Map(
      (
        await postsWithFeedTime(
          pg,
          viewer,
          page.flatMap((entry) => (entry.postId ? [entry.postId] : []))
        )
      ).map((row) => [row.id, row])
    )
    const rows = page.flatMap((entry) => {
      const row = entry.postId ? stored.get(entry.postId) : entry.pending
      return row ? [row] : []
    })
    const posts = await hydrateSocialPosts(pg, rows, viewer, true, true, [
      parent,
    ])
    return {
      posts: card ? withoutRepeatedMarket(posts) : posts,
      // Every entry has one place in the order, with or without a post, so
      // the next page starts after the last one shown.
      nextCursor:
        entries.length > limit
          ? `${socialTimestamp(last.time)}|${last.id}`
          : null,
    }
  }
  const [time, id] = cursor?.split('|') ?? []
  const rows = await pg.manyOrNone<SocialRow>(
    `with candidates as (
      select p.*, greatest(p.created_time,coalesce(shares.bumped_time,p.created_time)) as feed_time
      from social_posts p join social_posts root on root.id=p.root_id
      left join contract_comments cc on cc.comment_id=p.market_comment_id
      left join contracts c on c.id=coalesce(cc.contract_id,p.source_contract_id)
      left join lateral (
        select max(r.bumped_time) as bumped_time from social_reposts r
        where r.post_id=p.id and r.active and not(r.user_id=any($2::text[]))
          and r.user_id<>p.user_id and r.user_id is distinct from c.creator_id
      ) shares on true
      where ${
        parentId
          ? 'p.parent_id=$1'
          : '(p.feed_visible or exists(select 1 from social_reposts r where r.post_id=p.id and r.active and not(r.user_id=any($2::text[]))))'
      }
      and (p.deleted_time is null or exists(select 1 from social_posts child where child.parent_id=p.id))
      and p.hidden_time is null and root.hidden_time is null
      and not(p.user_id=any($2::text[])) and not(root.user_id=any($2::text[]))
      and (p.market_comment_id is null or (cc.comment_id is not null and c.visibility='public'
        and not coalesce((c.data->>'deleted')::boolean,false)))
      and (p.canonical_key is null or p.canonical_key not like 'market:%' and p.canonical_key not like 'bet:%'
        or c.visibility='public' and not coalesce((c.data->>'deleted')::boolean,false))
    ) select * from candidates
    where ($3::timestamptz is null or (${
      parentId ? 'created_time' : 'feed_time'
    },id) ${parentId ? '>' : '<'} ($3::timestamptz,$4::text))
    order by ${
      parentId ? 'created_time asc,id asc' : 'feed_time desc,id desc'
    } limit $5`,
    [parentId ?? null, viewer.blocked, time ?? null, id ?? null, limit + 1]
  )
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return {
    posts: await hydrateSocialPosts(pg, page, viewer),
    nextCursor:
      rows.length > limit
        ? `${socialTimestamp(
            parentId ? last.created_time : last.feed_time ?? last.created_time
          )}|${last.id}`
        : null,
  }
}

export const getSocialPost: APIHandler<'get-social-post'> = async (
  { id },
  auth
) => {
  const pg = createSupabaseDirectClient()
  // The post may be a comment that is on Yap without a post of its own, and
  // so may the comments it replies to, one above another (older comments
  // could reply to a reply). Everything above those is a post.
  const pendingAbove: SocialRow[] = []
  const row = await getSocialPostForRead(pg, id, pendingAbove)
  const ancestors = [
    ...(await pg.manyOrNone<SocialRow & { depth: number }>(
      `with recursive ancestors as (
    select p.*, 1 as depth from social_posts p where p.id=$1
    union all select p.*, a.depth+1 from social_posts p join ancestors a on p.id=a.parent_id
  ) select * from ancestors order by depth desc`,
      [pendingAbove.length ? pendingAbove[0].parent_id : row.parent_id]
    )),
    ...pendingAbove,
  ]
  const viewer = await getSocialViewer(auth?.uid)
  const posts = await hydrateSocialPosts(pg, [...ancestors, row], viewer, false)
  const post = posts[posts.length - 1]
  const detail = { post, ancestors: posts.slice(0, -1) }
  if (
    !auth ||
    post.removed ||
    row.deleted_time ||
    (auth.uid !== row.user_id &&
      !(row.market_comment_id && isAdminId(auth.uid)))
  )
    return detail
  if (row.market_comment_id) {
    const source = await pg.oneOrNone<{
      content: ContractComment['content']
      creatorUsername: string
      slug: string
    }>(
      `select cc.data->'content' as content, c.data->>'creatorUsername' as "creatorUsername", c.slug
       from contract_comments cc join contracts c on c.id=cc.contract_id where cc.comment_id=$1 and cc.user_id=$2
       and ($3::text is null or cc.contract_id=$3) and c.visibility='public'
       and not coalesce((c.data->>'deleted')::boolean,false) and ${visibleMarketComment(
         'cc'
       )}`,
      [row.market_comment_id, row.user_id, row.source_contract_id ?? null]
    )
    if (!source) return detail
    if (!isCommentYapRepresentable(source.content))
      return {
        ...detail,
        editOnMarket: `${contractPath(source)}#${row.market_comment_id}`,
      }
  } else if (!isSocialPostEditable(socialTimestampMillis(row.created_time)))
    return detail
  return {
    ...detail,
    editContent: getSocialEditContent(row.rich_content, post.richContent),
  }
}

export const getSocialLikers: APIHandler<'get-social-likers'> = async (
  { id, cursor, limit },
  auth
) => {
  const pg = createSupabaseDirectClient()
  // A comment with no post yet has likes too: the ones made on its market.
  // The comments above it that have none either go along, as they do for its
  // own page, so the comment is read the same way here.
  const above: SocialRow[] = []
  const post = await getSocialPostForRead(pg, id, above)
  const viewer = await getSocialViewer(auth?.uid)
  if (
    (await hydrateSocialPosts(pg, [post], viewer, false, true, above))[0]
      .removed
  )
    return { users: [], nextCursor: null }
  const [time, userId] = cursor?.split('|') ?? []
  const rows = await pg.manyOrNone<
    Omit<DisplayUser, 'entitlements'> & {
      entitlements: Parameters<typeof convertEntitlement>[0][]
      created_time: string
    }
  >(
    `select u.id,u.name,u.username,coalesce(u.data->>'avatarUrl','') as "avatarUrl", r.created_time,
    (select coalesce(json_agg(e), '[]'::json) from user_entitlements e where e.user_id=u.id) as entitlements
    from (select user_id,max(created_time) as created_time from user_reactions
      where content_id=$1 and content_type=$6 and reaction_type='like' group by user_id) r
    join users u on u.id=r.user_id where ($2::timestamptz is null or (r.created_time,r.user_id)>($2::timestamptz,$3::text))
    and not (r.user_id=any($5::text[]))
    order by r.created_time,r.user_id limit $4`,
    [
      post.market_comment_id ?? id,
      time ?? null,
      userId ?? null,
      limit + 1,
      viewer.blocked,
      post.market_comment_id ? 'comment' : 'social_post',
    ]
  )
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return {
    users: page.map(
      ({ created_time: _createdTime, entitlements, ...user }) => ({
        ...user,
        entitlements: (entitlements ?? []).map(convertEntitlement),
      })
    ),
    nextCursor:
      rows.length > limit
        ? `${socialTimestamp(last.created_time)}|${last.id}`
        : null,
  }
}

// Likes made on Yap. A post that mirrors a market comment keeps its likes in
// the comment's own reaction rows, so both surfaces count the same people.
// Likes made on the market stay on the market's reaction path.
export const reactToSocialPost: APIHandler<'react'> = async (
  { contentId, remove, reactionType },
  auth
) => {
  if (reactionType && reactionType !== 'like')
    throw new APIError(400, 'Yap supports likes only')
  const pg = createSupabaseDirectClient()
  const author = await socialAuthor(auth.uid)
  const viewer = await getSocialViewer(auth.uid)
  const result = await pg.tx(async (tx) => {
    // Taking a like back from a comment that has no post yet: the like was
    // made on its market and is the comment's own, so removing it needs no
    // post. Liking it does, and lockPostForCommentChange makes one. The
    // comment's lock is taken first here too, before the like allowance's:
    // the same order as a like, so the two cannot wait on each other. It
    // also settles whether the comment has a post, since nothing gives it
    // one without that lock.
    const likedCommentId = remove ? commentOfPostId(contentId) : null
    if (likedCommentId) {
      const locked = await tx.manyOrNone(
        'select comment_id from contract_comments where comment_id=$1 for update',
        [likedCommentId]
      )
      // No such comment when its lock was asked for: only a post that is
      // there can have a like taken back. A comment written in the moment
      // since is not looked for, because it was not locked first, and the
      // like allowance below must not be asked for before the comment's lock.
      const target = locked.length
        ? await findSocialPost(tx, contentId)
        : await tx.oneOrNone<SocialRow>(
            'select * from social_posts where id=$1',
            [contentId]
          )
      // Neither a post nor a comment shown on Yap: there is nothing to take
      // a like back from here. Stopping matters. The comment's market can get
      // its card a moment later, and the path below would then give the
      // comment a post, which taking back a like never does.
      if (!target) throw new APIError(404, 'Post not found')
      if (target.pending && target.market_comment_id) {
        await limitSocialWrite(tx, auth.uid, 'like', 300)
        await writeCommentReaction(
          tx,
          target.market_comment_id,
          auth.uid,
          'like',
          true
        )
        return null
      }
    }
    const post = await lockPostForCommentChange(tx, contentId)
    await limitSocialWrite(tx, auth.uid, 'like', 300)
    if (post.market_comment_id) {
      if (remove && post.deleted_time) return null
      if (!remove) await assertSocialInteraction(tx, post, viewer)
      const inserted = await writeCommentReaction(
        tx,
        post.market_comment_id,
        auth.uid,
        'like',
        !!remove
      )
      return inserted ? post : null
    }
    if (remove) {
      await tx.none(
        "delete from user_reactions where user_id=$1 and content_id=$2 and content_type=$3 and reaction_type='like'",
        [auth.uid, post.id, 'social_post']
      )
      return null
    }
    await assertSocialInteraction(tx, post, viewer)
    await tx.none(
      "delete from user_reactions where user_id=$1 and content_id=$2 and content_type=$3 and reaction_type<>'like'",
      [auth.uid, post.id, 'social_post']
    )
    const inserted = await tx.oneOrNone(
      `insert into user_reactions(content_id,content_type,content_owner_id,user_id,reaction_type)
      select $1,$4,$2,$3,'like' where not exists(select 1 from user_reactions where content_id=$1 and user_id=$3 and content_type=$4 and reaction_type='like')
      on conflict (user_id,content_id) where content_type='social_post' do nothing returning reaction_id`,
      [post.id, post.user_id, auth.uid, 'social_post']
    )
    return inserted ? post : null
  })
  return {
    result: { success: true },
    continue: async () => {
      if (result) await notifySocial(pg, result, author, 'like')
    },
  }
}
