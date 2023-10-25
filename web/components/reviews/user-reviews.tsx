import { useQuery } from 'web/hooks/use-query'
import { getUserReviews } from 'web/lib/supabase/reviews'
import { Modal } from '../layout/modal'
import { Title } from '../widgets/title'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Review } from './review'
import { Col } from '../layout/col'
import { useState } from 'react'
import { Row } from '../layout/row'
import { StarIcon } from '@heroicons/react/solid'

export function UserReviews(props: {
  userId: string
  rating: number
  reviewCount: number
}) {
  const { userId, rating, reviewCount } = props
  const [open, setOpen] = useState(false)
  const shortenedRating = Math.ceil(rating * 100) / 100
  return (
    <>
      <Row
        onClick={() => setOpen(true)}
        className=" text-primary-600 group cursor-pointer items-center gap-0.5 text-lg transition-colors sm:text-xl"
      >
        {shortenedRating}
        <StarIcon className="h-5 w-5" />
        <div className="text-ink-600 text-sm group-hover:underline">
          (<span>{reviewCount}</span>)
        </div>
      </Row>
      <UserReviewsModal
        userId={userId}
        rating={shortenedRating}
        open={open}
        setOpen={setOpen}
      />
    </>
  )
}

export function UserReviewsModal(props: {
  userId: string
  rating: number
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { userId, rating, open, setOpen } = props

  const reviews = useQuery(() => getUserReviews(userId))

  return (
    <Modal open={open} setOpen={setOpen}>
      <div className="bg-canvas-0 max-h-[90vh] overflow-y-auto rounded p-6">
        <Row className="mb-4 justify-between sm:mb-6">
          <Title className="mb-0 sm:mb-0">Reviews</Title>
          <Row className="mt-0 items-center gap-0.5 text-lg sm:text-xl">
            {rating}
            <StarIcon className="h-5 w-5" />
          </Row>
        </Row>

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
