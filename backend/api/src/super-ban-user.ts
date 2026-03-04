import { WEEK_MS } from 'common/util/time'
import { MarketContract } from 'common/contract'
import { convertContract } from 'common/supabase/contracts'
import { convertPost, TopLevelPost } from 'common/top-level-post'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { updateContract } from 'shared/supabase/contracts'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateData } from 'shared/supabase/utils'
import { getUser, log, revalidateContractStaticProps } from 'shared/utils'
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

  const isNewUser = creator.createdTime > Date.now() - WEEK_MS

  // Bulk-delete user's contract comments (including hidden) if there are not too many, and revalidate affected contracts
  try {
    const { count } = await pg.one<{ count: number }>(
      `select count(*)::int as count
       from contract_comments
       where user_id = $1`,
      [userId]
    )

    const commentLimit = isNewUser ? 200 : 30
    if (count > commentLimit) {
      log(`Not deleting comments (>${commentLimit}).`)
    } else if (count > 0) {
      // Collect distinct contracts for revalidation
      const affectedContracts = await pg.manyOrNone<{
        slug: string
        creatorUsername: string
      }>(
        `select distinct c.slug, c.data->>'creatorUsername' as "creatorUsername"
         from contract_comments cc
         join contracts c on c.id = cc.contract_id
         where cc.user_id = $1`,
        [userId]
      )

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

      // Revalidate all affected contracts
      for (const contract of affectedContracts) {
        await revalidateContractStaticProps(contract)
      }
      log(`Revalidated ${affectedContracts.length} contracts.`)
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

    const postCommentLimit = isNewUser ? 200 : 30
    if (count > postCommentLimit) {
      log(`Not hiding post comments (>${postCommentLimit}).`)
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

  // Delete recent notifications generated by this user's comments, scoped to affected users only
  try {
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000
    const { count: deletedNotifs } = await pg.one<{ count: number }>(
      `with affected_users as (
        select distinct follow_id as uid
        from contract_follows
        where contract_id in (
          select distinct contract_id from contract_comments where user_id = $1
        )
        union
        select distinct creator_id as uid
        from contracts
        where id in (
          select distinct contract_id from contract_comments where user_id = $1
        )
      ),
      deleted as (
        delete from user_notifications
        where user_id in (select uid from affected_users)
          and (data->>'createdTime')::bigint > $3
          and data->>'sourceUserUsername' = $2
        returning 1
      )
      select count(*)::int as count from deleted`,
      [userId, creator.username, threeDaysAgo]
    )
    log(`Deleted ${deletedNotifs} notifications from user ${userId}.`)
  } catch (error) {
    log.error('Error deleting notifications:', { error })
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
