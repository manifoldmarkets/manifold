import { MarketContract } from 'common/contract'
import { convertContract } from 'common/supabase/contracts'
import { convertPost, TopLevelPost } from 'common/top-level-post'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { updateContract } from 'shared/supabase/contracts'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateData } from 'shared/supabase/utils'
import { getUser, log } from 'shared/utils'
import { revalidatePost } from './create-post-comment'
import { APIError, type APIHandler } from './helpers/endpoint'

export const superBanUser: APIHandler<'super-ban-user'> = async (
  { userId },
  auth
) => {
  throwErrorIfNotMod(auth.uid)

  const resolver = await getUser(auth.uid)
  if (!resolver) {
    throw new APIError(500, 'Resolver not found')
  }
  const creator = await getUser(userId)
  if (!creator) {
    throw new APIError(500, 'Creator not found')
  }

  const pg = createSupabaseDirectClient()

  const contracts = await pg.map(
    `SELECT * FROM contracts WHERE creator_id = $1`,
    [userId],
    convertContract
  )

  const posts = await pg.map(
    `SELECT * FROM old_posts WHERE creator_id = $1`,
    [userId],
    (r) => convertPost(r)
  )

  if (contracts.length > 5) {
    throw new APIError(
      400,
      `This user has ${contracts.length} markets. You can only super ban users with 5 or less.`
    )
  }

  for (const contract of contracts) {
    if (contract.visibility === 'unlisted') continue
    await updateContract(pg, contract.id, {
      visibility: 'unlisted',
    })
  }

  try {
    for (const contract of contracts.filter(
      (c) =>
        (c.mechanism === 'cpmm-1' || c.mechanism === 'cpmm-multi-1') &&
        !c.isResolved
    )) {
      await resolveMarketHelper(contract as MarketContract, resolver, creator, {
        outcome: 'CANCEL',
      })
    }
  } catch (error) {
    log.error('Error resolving contracts:', { error })
    throw new APIError(500, 'Failed to update one or more contracts.')
  }

  // Bulk-delete user's contract comments (including hidden) if there are not too many
  try {
    const { count } = await pg.one<{ count: number }>(
      `select count(*)::int as count
       from contract_comments
       where user_id = $1`,
      [userId]
    )

    if (count > 30) {
      log('Not deleting comments (>30).')
    } else if (count > 0) {
      await pg.none(
        `update contract_comments
         set data = data
           || jsonb_build_object('deleted', true)
           || jsonb_build_object('deletedTime', to_jsonb($2::bigint))
           || jsonb_build_object('deleterId', to_jsonb($3::text))
         where user_id = $1`,
        [userId, Date.now(), auth.uid]
      )
      log(`Deleted ${count} comments for user ${userId}.`)
    } else {
      log('No comments found for this user.')
    }
  } catch (error) {
    log.error('Error bulk deleting comments:', { error })
  }

  // Bulk-hide user's post comments if there are not too many, and revalidate affected posts
  try {
    const { count } = await pg.one<{ count: number }>(
      `select count(*)::int as count
       from old_post_comments
       where user_id = $1`,
      [userId]
    )

    if (count > 30) {
      log('Not hiding post comments (>30).')
    } else if (count > 0) {
      // Collect distinct post slugs for revalidation
      const postSlugs: { slug: string }[] = await pg.manyOrNone(
        `select distinct op.data->>'slug' as slug
         from old_post_comments opc
         join old_posts op on op.id = opc.post_id
         where opc.user_id = $1`,
        [userId]
      )

      await pg.none(
        `update old_post_comments
         set data = data || jsonb_build_object('hidden', true)
         where user_id = $1`,
        [userId]
      )
      log(`Hid ${count} post comments for user ${userId}.`)

      // Revalidate all affected posts
      for (const { slug } of postSlugs) {
        if (slug) await revalidatePost({ slug } as TopLevelPost)
      }
    } else {
      log('No post comments found for this user.')
    }
  } catch (error) {
    log.error('Error bulk hiding post comments:', { error })
  }

  if (posts.length > 0) {
    log(`Found ${posts.length} posts to unlist.`)
    for (const post of posts) {
      await updateData(pg, 'old_posts', 'id', {
        id: post.id,
        visibility: 'unlisted',
      })
      revalidatePost(post)
      log(`Unlisted post ${post.id}`)
    }
    log('Successfully unlisted all posts for the user.')
  }
}
