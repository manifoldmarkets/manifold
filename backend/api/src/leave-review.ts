import { APIError, type APIHandler } from 'api/helpers/endpoint'
import { onlyUsersWhoCanPerformAction } from 'api/helpers/rate-limit'
import { parseJsonContentToText } from 'common/util/parse'
import {
  createMarketReviewedNotification,
  createMarketReviewUpdatedNotification,
} from 'shared/create-notification'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getContract, getUser } from 'shared/utils'

export const leaveReview: APIHandler<'leave-review'> =
  onlyUsersWhoCanPerformAction('comment', async (props, auth) => {
    const { marketId, review, rating } = props
    const pg = createSupabaseDirectClient()

    const contract = await getContract(pg, marketId)

    if (!contract) {
      throw new APIError(404, `No market found with id ${marketId}`)
    }

    const { creatorId } = contract

    if (contract.creatorId === auth.uid) {
      throw new APIError(403, `You can't review your own market`)
    }

    const reviewer = await getUser(auth.uid, pg)
    if (!reviewer) {
      throw new APIError(404, `No user found with id ${auth.uid}`)
    }

    const existingReview = await pg.oneOrNone(
      `select * from reviews where market_id = $1 and reviewer_id = $2`,
      [marketId, auth.uid]
    )

    await pg.query(
      `insert into reviews (market_id, reviewer_id, vendor_id, rating, content)
       values ($1, $2, $3, $4, $5)
       on conflict (market_id, reviewer_id) do update
       set rating = $4, content = $5`,
      [marketId, auth.uid, creatorId, rating, review]
    )

    // Don't notify users of 1 or 2 star reviews
    if (rating >= 3) {
      if (existingReview) {
        await createMarketReviewUpdatedNotification(
          creatorId,
          reviewer,
          contract,
          rating,
          parseJsonContentToText(review ?? ''),
          pg
        )
      } else {
        await createMarketReviewedNotification(
          creatorId,
          reviewer,
          contract,
          rating,
          parseJsonContentToText(review ?? ''),
          pg
        )
      }
    }

    return { success: true }
  })
