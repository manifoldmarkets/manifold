import { useEffect, useState } from 'react'
import { Review, getMyReviewOnContract } from 'web/lib/supabase/reviews'

export function useReview(contractId: string, userId?: string) {
  const [review, setReview] = useState<Review | null>(null)
  useEffect(() => {
    if (!userId) return
    getMyReviewOnContract(contractId, userId).then((r) => {
      setReview(r)
    })
  }, [userId, contractId])

  return review
}
