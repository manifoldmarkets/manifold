import { APIError, type APIHandler } from './helpers/endpoint'
import { isAdminId, isModId } from 'common/envs/constants'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { getUser, log } from 'shared/utils'
import { updateContract } from 'shared/supabase/contracts'
import { convertContract } from 'common/supabase/contracts'
import { MarketContract } from 'common/contract'
import { convertPost } from 'common/top-level-post'
import { updateData } from 'shared/supabase/utils'
import { revalidatePost } from './create-post-comment'

export const unlistAndCancelUserContracts: APIHandler<
  'unlist-and-cancel-user-contracts'
> = async ({ userId }, auth) => {
  if (!isAdminId(auth.uid) && !isModId(auth.uid)) {
    throw new APIError(403, 'Only admins and mods can perform this action.')
  }

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

  if (contracts.length === 0 && posts.length === 0) {
    log('No contracts or posts found for this user.')
    return
  }

  if (contracts.length > 5) {
    throw new APIError(
      400,
      `This user has ${contracts.length} markets. You can only super ban users with 5 or less.`
    )
  }

  for (const contract of contracts) {
    await updateContract(pg, contract.id, {
      visibility: 'unlisted',
    })
  }

  try {
    for (const contract of contracts.filter(
      (c) => c.mechanism === 'cpmm-1' || c.mechanism === 'cpmm-multi-1'
    )) {
      await resolveMarketHelper(contract as MarketContract, resolver, creator, {
        outcome: 'CANCEL',
      })
    }
  } catch (error) {
    log.error('Error resolving contracts:', { error })
    throw new APIError(500, 'Failed to update one or more contracts.')
  }

  if (posts.length === 0) {
    log('No posts found for this user.')
    // No need to throw an error, just return if there are no posts and contracts were handled.
    // If contracts were also empty, the function would have returned earlier if uncommented.
    return
  }
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
