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
  ensureMarketCommentPost,
  reconcileMarketDiscussion,
  subscribeToSocialThread,
} from 'shared/social-discussion'
import {
  passesNewAccountGate,
  newAccountGateMessage,
} from 'shared/new-account-gate'
import { ValidatedAPIParams } from 'common/api/schema'
import { ContractComment } from 'common/comment'
import { isAdminId, isModId } from 'common/envs/constants'
import { User } from 'common/user'
import { APIHandler, APIError, AuthedUser } from './helpers/endpoint'
import { onlyUsersWhoCanPerformAction } from './helpers/rate-limit'
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
import {
  getContract,
  log,
  revalidateContractStaticProps,
  sanitizeJsonContent,
} from 'shared/utils'
import {
  assertSocialInteraction,
  getSocialRow,
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
  writeSocialMarkets,
} from 'shared/social-posts'

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
        if (viewer.blocked.includes(contract.creatorId))
          throw new APIError(
            403,
            'You cannot comment on this market because of a block'
          )
      }
      // The Yap, its market comment and its repost rows commit together or not
      // at all, so an edit or a removal never finds one without the others.
      const { row, parent, marketComment, repost } = await pg.tx(async (tx) => {
        const sharedComment =
          commentSource?.commentId && !parentId
            ? await ensureMarketCommentPost(tx, commentSource.commentId)
            : null
        const parent = parentId
          ? await lockSocialThread(tx, parentId)
          : sharedComment
          ? await lockSocialThread(tx, sharedComment.id)
          : null
        if (parent) await assertSocialInteraction(tx, parent, viewer, true)
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
          viewer
        )
        await validateSocialSource(tx, source, content.marketIds, viewer)
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
          if (parent) await notifySocial(pg, parent, author, 'reply', id)
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
    throw new APIError(
      400,
      'Keep text or an image in this shared comment, or delete it from both places.'
    )
  const comment = await getComment(tx, row.market_comment_id).catch(() => null)
  if (!comment || comment.deleted) return
  const contract = await getContract(tx, comment.contractId)
  if (!contract) return
  const content = {
    text: row.text,
    richContent: row.rich_content,
    imageUrls: row.image_urls,
  }
  if (!socialCommentFits(content))
    throw new APIError(400, SOCIAL_COMMENT_TOO_LONG)
  await editCommentContentInternal(
    tx,
    contract,
    comment,
    editorId,
    sanitizeJsonContent(socialPostToCommentContent(content))
  )
  return contract
}

export const editSocialPost: APIHandler<'edit-social-post'> =
  onlyUsersWhoCanPerformAction('editComment', async ({ id, content }, auth) => {
    const pg = createSupabaseDirectClient()
    await socialAuthor(auth.uid)
    const viewer = await getSocialViewer(auth.uid)
    const { row, commentContract } = await pg.tx(async (tx) => {
      const post = await lockSocialThread(tx, id)
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
              viewer,
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
    const post = await lockSocialThread(tx, id)
    const moderator = isAdminId(auth.uid) || isModId(auth.uid)
    if (post.user_id !== auth.uid && !moderator)
      throw new APIError(
        403,
        'Only the author or a moderator can remove this post'
      )
    if (
      post.user_id !== auth.uid &&
      post.market_comment_id &&
      (isAdminId(post.user_id) || isModId(post.user_id))
    )
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
    await tx.none(
      `update social_posts set text='', rich_content=null, image_urls='{}', deleted_time=clock_timestamp(), deleted_by=$2, removed_by_moderator=$3,
      source_contract_id=null, source_comment_id=null, source_bet_id=null, source_post_id=null where id=$1`,
      [id, auth.uid, post.user_id !== auth.uid]
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
    await tx.none('update social_reposts set active=false where post_id=$1', [
      id,
    ])
    // Shared messages have one removal state on both surfaces.
    return post.market_comment_id
      ? deleteSocialComment(tx, post.market_comment_id, auth.uid)
      : null
  })
  if (removed) {
    await revalidateContractStaticProps(removed.contract).catch((e) =>
      log.error('Failed to revalidate market after Yap removal', { e, id })
    )
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

// Deletes a moderated Yap's market comment as hide-comment's delete action
// would, including its refusal to delete comments by admins and moderators.
async function deleteSocialComment(
  tx: SupabaseTransaction,
  commentId: string,
  moderatorId: string
) {
  const comment = await getComment(tx, commentId).catch(() => null)
  if (
    !comment ||
    comment.deleted ||
    (comment.userId !== moderatorId &&
      (isAdminId(comment.userId) || isModId(comment.userId)))
  )
    return null
  await updateData(tx, 'contract_comments', 'comment_id', {
    comment_id: commentId,
    deleted: true,
    deletedTime: Date.now(),
    deleterId: moderatorId,
  })
  const contract = await getContract(tx, comment.contractId)
  return contract ? { contract, commentId } : null
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
    return {
      posts: await hydrateSocialPosts(pg, rows, viewer, false),
      nextCursor: null,
    }
  }
  return readSocialPosts(pg, viewer, props)
}

export async function readSocialPosts(
  pg: SupabaseDirectClient,
  viewer: SocialViewer,
  { parentId, cursor, limit }: ValidatedAPIParams<'get-social-posts'>
): Promise<SocialPostPage> {
  const parent = parentId ? await getSocialRow(pg, parentId) : null
  if (parent) await pg.tx((tx) => reconcileMarketDiscussion(tx, parent))
  const [time, id] = cursor?.split('|') ?? []
  const marketThread = parent?.canonical_key?.startsWith('market:')
  const betThread = parent?.canonical_key?.startsWith('bet:')
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
          ? marketThread
            ? "cc.contract_id=$1 and cc.data->>'replyToCommentId' is null"
            : betThread
            ? "cc.data->>'betId'=$1 and cc.data->>'replyToCommentId' is null"
            : 'p.parent_id=$1'
          : '(p.feed_visible or exists(select 1 from social_reposts r where r.post_id=p.id and r.active and not(r.user_id=any($2::text[]))))'
      }
      and (p.deleted_time is null or exists(select 1 from social_posts child where child.parent_id=p.id))
      and p.hidden_time is null and root.hidden_time is null
      and not(p.user_id=any($2::text[])) and not(root.user_id=any($2::text[]))
      and (p.market_comment_id is null or (cc.comment_id is not null and c.visibility='public'
        and not coalesce((c.data->>'deleted')::boolean,false) and not coalesce((cc.data->>'hidden')::boolean,false)))
      and (p.canonical_key is null or p.canonical_key not like 'market:%' and p.canonical_key not like 'bet:%'
        or c.visibility='public' and not coalesce((c.data->>'deleted')::boolean,false))
    ) select * from candidates
    where ($3::timestamptz is null or (${
      parentId ? 'created_time' : 'feed_time'
    },id) ${parentId ? '>' : '<'} ($3::timestamptz,$4::text))
    order by ${
      parentId ? 'created_time asc,id asc' : 'feed_time desc,id desc'
    } limit $5`,
    [
      marketThread
        ? parent!.source_contract_id
        : betThread
        ? parent!.source_bet_id
        : parentId ?? null,
      viewer.blocked,
      time ?? null,
      id ?? null,
      limit + 1,
    ]
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
  const row = await getSocialRow(pg, id)
  await pg.tx((tx) => reconcileMarketDiscussion(tx, row))
  const ancestors = await pg.manyOrNone<SocialRow & { depth: number }>(
    `with recursive ancestors as (
    select p.*, 1 as depth from social_posts p where p.id=$1
    union all select p.*, a.depth+1 from social_posts p join ancestors a on p.id=a.parent_id
  ) select * from ancestors order by depth desc`,
    [row.parent_id]
  )
  const viewer = await getSocialViewer(auth?.uid)
  const posts = await hydrateSocialPosts(pg, [...ancestors, row], viewer, false)
  const post = posts[posts.length - 1]
  return {
    post,
    ancestors: posts.slice(0, -1),
    ...(auth?.uid === row.user_id &&
    !row.deleted_time &&
    (row.market_comment_id ||
      isSocialPostEditable(socialTimestampMillis(row.created_time)))
      ? {
          editContent: getSocialEditContent(row.rich_content, post.richContent),
        }
      : {}),
  }
}

export const getSocialLikers: APIHandler<'get-social-likers'> = async (
  { id, cursor, limit },
  auth
) => {
  const pg = createSupabaseDirectClient()
  const post = await getSocialRow(pg, id)
  const viewer = await getSocialViewer(auth?.uid)
  if ((await hydrateSocialPosts(pg, [post], viewer, false))[0].removed)
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
    from user_reactions r join users u on u.id=r.user_id where r.content_id=$1 and r.content_type=$6 and r.reaction_type='like'
    and ($2::timestamptz is null or (r.created_time,r.user_id)>($2::timestamptz,$3::text))
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

export const reactToSocialPost: APIHandler<'react'> = async (
  { contentId, contentType, remove, reactionType },
  auth
) => {
  if (reactionType && reactionType !== 'like')
    throw new APIError(400, 'Yap supports likes only')
  const pg = createSupabaseDirectClient()
  const author = await socialAuthor(auth.uid)
  const viewer = await getSocialViewer(auth.uid)
  const result = await pg.tx(async (tx) => {
    const linked =
      contentType === 'comment'
        ? await tx.oneOrNone<{ id: string }>(
            'select id from social_posts where market_comment_id=$1',
            [contentId]
          )
        : null
    const post = await lockSocialThread(tx, linked?.id ?? contentId)
    const targetId = post.market_comment_id ?? post.id
    const targetType = post.market_comment_id ? 'comment' : 'social_post'
    await limitSocialWrite(tx, auth.uid, 'like', 300)
    if (remove) {
      await tx.none(
        "delete from user_reactions where user_id=$1 and content_id=$2 and content_type=$3 and reaction_type='like'",
        [auth.uid, targetId, targetType]
      )
      if (post.market_comment_id)
        await tx.none(
          "update contract_comments set likes=(select count(distinct user_id) from user_reactions where content_id=$1 and content_type='comment' and reaction_type='like') where comment_id=$1",
          [targetId]
        )
      return null
    }
    await assertSocialInteraction(tx, post, viewer)
    await tx.none(
      "delete from user_reactions where user_id=$1 and content_id=$2 and content_type=$3 and reaction_type<>'like'",
      [auth.uid, targetId, targetType]
    )
    const inserted = await tx.oneOrNone(
      `insert into user_reactions(content_id,content_type,content_owner_id,user_id,reaction_type)
      select $1,$4,$2,$3,'like' where not exists(select 1 from user_reactions where content_id=$1 and user_id=$3 and content_type=$4 and reaction_type='like')
      on conflict (user_id,content_id) where content_type='social_post' do nothing returning reaction_id`,
      [targetId, post.user_id, auth.uid, targetType]
    )
    if (post.market_comment_id)
      await tx.none(
        "update contract_comments set likes=(select count(distinct user_id) from user_reactions where content_id=$1 and content_type='comment' and reaction_type='like'), dislikes=(select count(*) from user_reactions where content_id=$1 and content_type='comment' and reaction_type='dislike') where comment_id=$1",
        [targetId]
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
