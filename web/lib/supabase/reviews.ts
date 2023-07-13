import { db } from './db'
import { Row, run, tsToMillis } from 'common/supabase/utils'

export const getUserRating = async (userId: string) => {
  const stuff = await db.rpc('get_rating', { user_id: userId }).single()
  const { data } = stuff

  return data as any
}

export const getUserReviews = async (userId: string) => {
  const { data } = await run(
    db.from('reviews').select('*').eq('vendor_id', userId)
  )

  return data.map(convertReview)
}

export const getMyReviewOnContract = async (
  contractId: string,
  userId: string
) => {
  const { data } = await db
    .from('reviews')
    .select('*')
    .eq('market_id', contractId)
    .eq('reviewer_id', userId)
    .single()

  return data && convertReview(data)
}

const convertReview = (review: Row<'reviews'>) => ({
  ...review,
  created_time: tsToMillis(review.created_time),
})
