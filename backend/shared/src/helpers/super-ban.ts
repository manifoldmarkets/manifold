import { APIError } from 'common/api/utils'
import { MarketContract } from 'common/contract'
import { isAdminId } from 'common/envs/constants'
import { convertContract } from 'common/supabase/contracts'
import { convertPost, TopLevelPost } from 'common/top-level-post'
import { BanType, MANIFOLD_USER_USERNAME } from 'common/user'
import { WEEK_MS } from 'common/util/time'
import { trackPublicEvent } from 'shared/analytics'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { updateContract } from 'shared/supabase/contracts'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import { updateData } from 'shared/supabase/utils'
import {
  getUser,
  getUserByUsername,
  log,
  revalidateContractStaticProps,
  revalidateStaticProps,
} from 'shared/utils'

const SUPER_BAN_TYPES: BanType[] = [
  'posting',
  'marketControl',
  'trading',
  'purchase',
]

async function endBansByType(
  pg: SupabaseDirectClient,
  userId: string,
  banType: BanType,
  endedBy: string
) {
  await pg.none(
    `update user_bans
     set ended_by = $1, ended_at = now()
     where user_id = $2
       and ban_type = $3
       and ended_at is null`,
    [endedBy, userId, banType]
  )
}

async function createPermanentBan(
  pg: SupabaseDirectClient,
  userId: string,
  banType: BanType,
  reason: string,
  createdBy: string
) {
  await pg.none(
    `insert into user_bans (user_id, ban_type, reason, created_by, end_time)
     values ($1, $2, $3, $4, null)`,
    [userId, banType, reason, createdBy]
  )
}

async function applyPermanentSuperBans(
  pg: SupabaseDirectClient,
  userId: string,
  bannedByUserId: string,
  reason: string
) {
  for (const banType of SUPER_BAN_TYPES) {
    await endBansByType(pg, userId, banType, bannedByUserId)
    await createPermanentBan(pg, userId, banType, reason, bannedByUserId)
  }
}

async function getResolverUser(bannedByUserId: string) {
  const bannedByUser = await getUser(bannedByUserId)
  if (bannedByUser) return bannedByUser

  const manifoldUser = await getUserByUsername(MANIFOLD_USER_USERNAME)
  if (manifoldUser) return manifoldUser

  throw new APIError(500, 'Resolver not found')
}

function revalidatePost(post: TopLevelPost) {
  return revalidateStaticProps(`/post/${post.slug}`)
}

export async function superBanUserCore(
  userId: string,
  bannedByUserId: string,
  reason: string
) {
  if (isAdminId(userId)) {
    throw new APIError(403, 'Cannot ban admin')
  }

  const resolver = await getResolverUser(bannedByUserId)
  const creator = await getUser(userId)
  if (!creator) {
    throw new APIError(500, 'Creator not found')
  }

  const pg = createSupabaseDirectClient()

  await updateUser(pg, userId, {
    bonusEligibility: 'ineligible',
  })
  log(`Set bonusEligibility to 'ineligible' for user ${userId}`)

  const contracts = await pg.map(
    `select * from contracts where creator_id = $1`,
    [userId],
    convertContract
  )

  const posts = await pg.map(
    `select * from old_posts where creator_id = $1`,
    [userId],
    (r) => convertPost(r)
  )

  const activeBanCount = await pg.one<{ count: number }>(
    `select count(distinct ban_type)::int as count from user_bans
     where user_id = $1
       and ban_type in ('posting', 'trading', 'marketControl')
       and ended_at is null
       and (end_time is null or end_time > now())`,
    [userId]
  )
  const alreadyBanned = activeBanCount.count >= 3
  const skippedMarketCleanup = contracts.length > 5

  if (skippedMarketCleanup) {
    log(
      `User ${userId} has ${contracts.length} markets; skipping market cleanup but applying permanent bans.`
    )
  } else if (!alreadyBanned) {
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
        await resolveMarketHelper(
          contract as MarketContract,
          resolver,
          creator,
          {
            outcome: 'CANCEL',
          }
        )
      }
    } catch (error) {
      log.error('Error resolving contracts:', { error })
      throw new APIError(500, 'Failed to update one or more contracts.')
    }
  } else {
    log(
      `User ${userId} already has all bans active, skipping market operations.`
    )
  }

  const isNewUser = creator.createdTime > Date.now() - WEEK_MS

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
        [userId, Date.now(), bannedByUserId]
      )
      log(`Deleted ${count} comments for user ${userId}.`)

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

      for (const { slug } of postSlugs) {
        if (slug) await revalidatePost({ slug } as TopLevelPost)
      }
    } else {
      log('No post comments found for this user.')
    }
  } catch (error) {
    log.error('Error bulk hiding post comments:', { error })
  }

  if (!alreadyBanned && !skippedMarketCleanup) {
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000
    pg.result(
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
      )
      delete from user_notifications
      where user_id in (select uid from affected_users)
        and (data->>'createdTime')::bigint > $3
        and data->>'sourceUserUsername' = $2`,
      [userId, creator.username, threeDaysAgo]
    )
      .then(({ rowCount }) => {
        log(`Deleted ${rowCount} spam notifications for user ${userId}.`)
      })
      .catch((error) => {
        log.error('Error cleaning up spam notifications:', { error })
      })

    if (posts.length > 0) {
      log(`Found ${posts.length} posts to unlist.`)
      for (const post of posts) {
        await updateData(pg, 'old_posts', 'id', {
          id: post.id,
          visibility: 'unlisted',
        })
        await revalidatePost(post)
        log(`Unlisted post ${post.id}`)
      }
      log('Successfully unlisted all posts for the user.')
    }
  }

  await applyPermanentSuperBans(pg, userId, bannedByUserId, reason)
  await updateUser(pg, userId, {
    bonusEligibility: 'ineligible',
    canChangeUsername: false,
    isBannedFromPosting: true,
  })

  await trackPublicEvent(bannedByUserId, 'ban user', {
    userId,
    bans: SUPER_BAN_TYPES,
    reason,
  })
  log('superbanned user', userId, { reason, added: SUPER_BAN_TYPES })

  return { skippedMarketCleanup }
}
