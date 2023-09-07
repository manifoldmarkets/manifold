import { useQuery } from 'web/hooks/use-query'
import { getUserReviews } from 'web/lib/supabase/reviews'
import { Modal } from '../layout/modal'
import { Title } from '../widgets/title'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Review } from './review'
import { Col } from '../layout/col'
import { useState } from 'react'

export function UserReviews(props: { userId: string; rating: number }) {
  const { userId, rating } = props
  const [openReviewModal, setOpenReviewModal] = useState(false)

  const reviews = useQuery(() => getUserReviews(userId))

  const ratingLabel =
    rating > 4.8 ? (
      <span className="font-semibold text-green-600">Exceptional</span>
    ) : rating > 4.5 ? (
      <span className="font-semibold text-green-600">Great</span>
    ) : rating > 3.3 ? (
      <span className="font-semibold text-green-600">Good</span>
    ) : rating > 2.5 ? (
      <span className="font-semibold text-yellow-600">Okay</span>
    ) : rating > 2 ? (
      <span className="font-semibold text-red-600">Poor</span>
    ) : (
      <span className="font-semibold text-red-600">Very Poor</span>
    )

  return (
    <Modal open={openReviewModal} setOpen={setOpenReviewModal}>
      <div className="bg-canvas-0 max-h-[90vh] overflow-y-auto rounded p-6">
        <Title>Reviews</Title>

        <div className="mb-4">Resolution reliability: {ratingLabel}</div>
        {reviews.isLoading && <LoadingIndicator className="text-center" />}

        <Col className="divide-ink-300 divide-y-2">
          {reviews.data?.map((review, i) => (
            <Review
              key={i}
              userId={review.reviewer_id}
              rating={review.rating}
              created={review.created_time}
              contractId={review.market_id}
              text={review.content as any}
            />
          ))}
        </Col>
      </div>
    </Modal>
  )
}
