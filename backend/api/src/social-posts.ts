import {
  SocialPost,
  SocialPostPage,
  socialTimestamp,
  hasSocialPostContent,
} from 'common/social-post'
import { ValidatedAPIParams } from 'common/api/schema'
import { isAdminId, isModId } from 'common/envs/constants'
import { APIHandler, APIError } from './helpers/endpoint'
import { onlyUsersWhoCanPerformAction } from './helpers/rate-limit'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { nanoid } from 'common/util/random'
import { DisplayUser } from 'common/api/user-types'
import {
  assertSocialInteraction,
  getSocialRow,
  getSocialViewer,
  hydrateSocialPosts,
  limitSocialWrite,
  lockSocialThread,
  notifySocial,
  socialAuthor,
  SocialRow,
  SocialViewer,
  validateSocialMarkets,
  validateSocialSource,
  writeSocialMarkets,
} from 'shared/social-posts'

export const createSocialPost: APIHandler<'create-social-post'> =
  onlyUsersWhoCanPerformAction(
    'post',
    async ({ content, parentId, source }, auth) => {
      const pg = createSupabaseDirectClient()
      const author = await socialAuthor(auth.uid, true)
      const viewer = await getSocialViewer(auth.uid)
      const id = nanoid(16)
      const { row, parent } = await pg.tx(async (tx) => {
        const parent = parentId ? await lockSocialThread(tx, parentId) : null
        if (parent) await assertSocialInteraction(tx, parent, viewer, true)
        await limitSocialWrite(
          tx,
          auth.uid,
          parent ? 'reply' : 'post',
          parent ? 60 : 10
        )
        await validateSocialMarkets(tx, content.marketIds)
        await validateSocialSource(tx, source, content.marketIds, viewer)
        const marketSource =
          source && 'contractId' in source ? source : undefined
        const row = await tx.one<SocialRow>(
          `insert into social_posts(id, user_id, text, parent_id, root_id, source_contract_id, source_comment_id, source_bet_id, image_urls, source_post_id)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
          [
            id,
            auth.uid,
            content.text,
            parent?.id ?? null,
            parent?.root_id ?? id,
            marketSource?.contractId ?? null,
            marketSource?.commentId ?? null,
            marketSource?.betId ?? null,
            content.imageUrls ?? [],
            source && 'postId' in source ? source.postId : null,
          ]
        )
        await writeSocialMarkets(tx, id, content.marketIds)
        return { row, parent }
      })
      return {
        result: (await hydrateSocialPosts(pg, [row], viewer))[0],
        continue: async () => {
          if (parent) await notifySocial(pg, parent, author, 'reply', id)
        },
      }
    }
  )

export const editSocialPost: APIHandler<'edit-social-post'> =
  onlyUsersWhoCanPerformAction('editComment', async ({ id, content }, auth) => {
    const pg = createSupabaseDirectClient()
    await socialAuthor(auth.uid)
    const row = await pg.tx(async (tx) => {
      const post = await lockSocialThread(tx, id)
      if (post.user_id !== auth.uid)
        throw new APIError(403, 'Only the author can edit this post')
      if (post.deleted_time)
        throw new APIError(403, 'This post has been removed')
      if (!hasSocialPostContent(content) && !post.source_post_id)
        throw new APIError(400, 'Add text, a market, or an image')
      await limitSocialWrite(tx, auth.uid, 'edit', 30)
      await validateSocialMarkets(tx, content.marketIds)
      await writeSocialMarkets(tx, id, content.marketIds)
      // Removing the original attachment also removes the repost context.
      return tx.one<SocialRow>(
        `update social_posts set text=$2, image_urls=$4, edited_time=clock_timestamp(),
      source_contract_id=case when source_contract_id=any($3::text[]) then source_contract_id else null end,
      source_comment_id=case when source_contract_id=any($3::text[]) then source_comment_id else null end,
      source_bet_id=case when source_contract_id=any($3::text[]) then source_bet_id else null end
      where id=$1 returning *`,
        [
          id,
          content.text,
          content.marketIds,
          content.imageUrls ?? post.image_urls,
        ]
      )
    })
    return (
      await hydrateSocialPosts(pg, [row], await getSocialViewer(auth.uid))
    )[0]
  })

export const deleteSocialPost: APIHandler<'delete-social-post'> = async (
  { id },
  auth
) => {
  const pg = createSupabaseDirectClient()
  await socialAuthor(auth.uid)
  await pg.tx(async (tx) => {
    const post = await lockSocialThread(tx, id)
    const moderator = isAdminId(auth.uid) || isModId(auth.uid)
    if (post.user_id !== auth.uid && !moderator)
      throw new APIError(
        403,
        'Only the author or a moderator can remove this post'
      )
    if (post.deleted_time) return
    await tx.none(
      `update social_posts set text='', image_urls='{}', deleted_time=clock_timestamp(), deleted_by=$2, removed_by_moderator=$3,
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
      where user_id in ($2, (select user_id from social_posts where id=$3))
      and (data->>'sourceId'=$1 or data->>'sourceSlug'='/yap/' || $1)
      and data->>'sourceType' in ('social_reply','social_post_like')`,
      [id, post.user_id, post.parent_id]
    )
  })
  return { success: true }
}

// Share only viewer-neutral data, behind API authentication. Coalesce concurrent
// cache misses; failed loads are retried on the next request.
let initialFeed: { expires: number; page: Promise<SocialPostPage> } | undefined

export const getSocialPosts: APIHandler<'get-social-posts'> = async (
  props,
  auth
) => {
  if (props.forModeration && !isAdminId(auth.uid) && !isModId(auth.uid))
    throw new APIError(403, 'Only moderators can request moderation content')
  const pg = createSupabaseDirectClient()
  // Personal blocks must not hide evidence in the moderation queue. This mode
  // is limited to explicit ID lookups and never enters the shared feed cache.
  const viewer = props.forModeration
    ? { id: auth.uid, blocked: [] }
    : await getSocialViewer(auth.uid)
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
  if (
    props.useCache &&
    !props.parentId &&
    !props.cursor &&
    props.limit === 30 &&
    !viewer.blocked.length
  ) {
    if (!initialFeed || initialFeed.expires <= Date.now()) {
      const entry = {
        expires: Infinity,
        page: readSocialPosts(pg, { blocked: [] }, props),
      }
      initialFeed = entry
      void entry.page.then(
        () => {
          entry.expires = Date.now() + 30_000
        },
        () => {
          if (initialFeed === entry) initialFeed = undefined
        }
      )
    }
    const page = await initialFeed.page
    const ids = page.posts.flatMap((post) => [
      post.id,
      ...post.replyPreviews.map((reply) => reply.id),
    ])
    const likedIds = new Set(await getSocialLikedPostIds(pg, auth.uid, ids))
    const personalize = (post: SocialPost): SocialPost => {
      const liked = !post.removed && likedIds.has(post.id)
      return {
        ...post,
        liked,
        likeCount: post.removed ? 0 : Math.max(post.likeCount, liked ? 1 : 0),
        replyPreviews: post.replyPreviews.map(personalize),
      }
    }
    return { ...page, posts: page.posts.map(personalize) }
  }
  return readSocialPosts(pg, viewer, props)
}

async function readSocialPosts(
  pg: SupabaseDirectClient,
  viewer: SocialViewer,
  { parentId, cursor, limit }: ValidatedAPIParams<'get-social-posts'>
): Promise<SocialPostPage> {
  if (parentId) await getSocialRow(pg, parentId)
  const [time, id] = cursor?.split('|') ?? []
  const direction = parentId ? 'asc' : 'desc'
  const rows = await pg.manyOrNone<SocialRow>(
    `select p.* from social_posts p join social_posts root on root.id=p.root_id
    where ${parentId ? 'p.parent_id=$1' : 'p.parent_id is null'}
    and (p.deleted_time is null or exists (select 1 from social_posts child where child.parent_id=p.id))
    and not (p.user_id=any($2::text[])) and not (root.user_id=any($2::text[]))
    and ($3::timestamptz is null or (p.created_time,p.id) ${
      parentId ? '>' : '<'
    } ($3::timestamptz,$4::text))
    order by p.created_time ${direction}, p.id ${direction} limit $5`,
    [parentId ?? null, viewer.blocked, time ?? null, id ?? null, limit + 1]
  )
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return {
    posts: await hydrateSocialPosts(pg, page, viewer),
    nextCursor:
      rows.length > limit
        ? `${socialTimestamp(last.created_time)}|${last.id}`
        : null,
  }
}

export const getSocialPost: APIHandler<'get-social-post'> = async (
  { id },
  auth
) => {
  const pg = createSupabaseDirectClient()
  const row = await getSocialRow(pg, id)
  const ancestors = await pg.manyOrNone<SocialRow & { depth: number }>(
    `with recursive ancestors as (
    select p.*, 1 as depth from social_posts p where p.id=$1
    union all select p.*, a.depth+1 from social_posts p join ancestors a on p.id=a.parent_id
  ) select * from ancestors order by depth desc`,
    [row.parent_id]
  )
  const viewer = await getSocialViewer(auth.uid)
  const posts = await hydrateSocialPosts(pg, [...ancestors, row], viewer, false)
  return { post: posts[posts.length - 1], ancestors: posts.slice(0, -1) }
}

async function getSocialLikedPostIds(
  pg: SupabaseDirectClient,
  userId: string,
  postIds: string[]
) {
  if (!postIds.length) return []
  const rows = await pg.manyOrNone<{ content_id: string }>(
    `select content_id from user_reactions
    where user_id=$1 and content_id=any($2::text[])
    and content_type='social_post' and reaction_type='like'`,
    [userId, postIds]
  )
  return rows.map((row) => row.content_id)
}

export const getSocialLikers: APIHandler<'get-social-likers'> = async (
  { id, cursor, limit },
  auth
) => {
  const pg = createSupabaseDirectClient()
  const post = await getSocialRow(pg, id)
  const viewer = await getSocialViewer(auth.uid)
  if (post.deleted_time || viewer.blocked.includes(post.user_id))
    return { users: [], nextCursor: null }
  const [time, userId] = cursor?.split('|') ?? []
  const rows = await pg.manyOrNone<DisplayUser & { created_time: string }>(
    `select u.id,u.name,u.username,coalesce(u.data->>'avatarUrl','') as "avatarUrl", r.created_time
    from user_reactions r join users u on u.id=r.user_id where r.content_id=$1 and r.content_type='social_post' and r.reaction_type='like'
    and ($2::timestamptz is null or (r.created_time,r.user_id)>($2::timestamptz,$3::text))
    and not (r.user_id=any($5::text[]))
    order by r.created_time,r.user_id limit $4`,
    [id, time ?? null, userId ?? null, limit + 1, viewer.blocked]
  )
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return {
    users: page.map(({ created_time: _createdTime, ...user }) => user),
    nextCursor:
      rows.length > limit
        ? `${socialTimestamp(last.created_time)}|${last.id}`
        : null,
  }
}

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
    const post = await lockSocialThread(tx, contentId)
    await limitSocialWrite(tx, auth.uid, 'like', 300)
    if (remove) {
      await tx.none(
        "delete from user_reactions where user_id=$1 and content_id=$2 and content_type='social_post'",
        [auth.uid, contentId]
      )
      return null
    }
    await assertSocialInteraction(tx, post, viewer)
    const inserted = await tx.oneOrNone(
      `insert into user_reactions(content_id,content_type,content_owner_id,user_id,reaction_type)
      values ($1,'social_post',$2,$3,'like') on conflict (user_id,content_id) where content_type='social_post' do nothing returning reaction_id`,
      [contentId, post.user_id, auth.uid]
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
