import { StarIcon as StarOutline } from '@heroicons/react/outline'
import { StarIcon } from '@heroicons/react/solid'
import { clamp, range } from 'lodash'
import { GradientContainer } from '../widgets/gradient-container'
import { useEffect, useState } from 'react'
import { Button } from '../buttons/button'
import { leaveReview } from 'web/lib/firebase/api'
import { TextEditor, useTextEditor } from '../widgets/editor'
import { Col } from '../layout/col'
import clsx from 'clsx'
import { useMutation, useQuery } from 'react-query'
import toast from 'react-hot-toast'
import { User } from 'common/user'
import { getMyReviewOnContract } from 'web/lib/supabase/reviews'

export type Rating = 1 | 2 | 3 | 4 | 5

export const StarPicker = (props: {
  rating?: Rating
  setRating: (value: Rating) => void
  className?: string
}) => {
  const { rating = 0, setRating, className } = props

  return (
    <div className={clsx('flex', className)}>
      {range(1, 6).map((star) => (
        <button key={'star' + star} onClick={() => setRating(star as Rating)}>
          {star <= rating ? (
            <StarIcon className="h-8 w-8 text-yellow-500" />
          ) : (
            <StarOutline className="text-ink-300 h-8 w-8" />
          )}
        </button>
      ))}
    </div>
  )
}

export const ReviewPanel = (props: {
  marketId: string
  author: string
  user: User
}) => {
  const { marketId, author, user } = props
  const [rating, setRating] = useState<Rating>()

  const editor = useTextEditor({
    size: 'sm',
    placeholder: 'Add details (optional)',
  })

  useEffect(() => {
    if (editor)
      getMyReviewOnContract(marketId, user.id).then((r) => {
        if (r) {
          setRating(r.rating as any)
          if (r.content && !editor.isDestroyed) {
            editor.commands.setContent(r.content as any)
          }
        }
      })
  }, [!!editor])

  const send = useMutation(['review'], leaveReview, {
    onError: (e) => {
      toast.error((e as any).message ?? 'Failed to save review. Try again.')
    },
    onSuccess: () => {
      toast.success('Review saved!')
    },
  })

  return (
    <GradientContainer>
      <Col className="items-center gap-2">
        <h2 className="text-primary-500 text-xl">Rate {author}</h2>
        <span className="text-sm italic">
          Did they run the market well and resolve it right?
        </span>

        <StarPicker rating={rating} setRating={setRating} className="my-3" />
        <TextEditor editor={editor} />
        <Button
          className="self-end"
          disabled={rating == undefined}
          loading={send.isLoading}
          onClick={() =>
            send.mutate({ marketId, rating, review: editor?.getJSON() })
          }
        >
          Submit
        </Button>
      </Col>
    </GradientContainer>
  )
}

export const StarDisplay = (props: { rating: number }) => {
  const rating = clamp(props.rating, 0, 5)
  const fullStars = Math.floor(rating)
  const fraction = rating - fullStars

  // star path is about 15 px in a 20px wide viewbox
  const clipPx = (1 - fraction) * 15 + 2.5

  return (
    <div className="inline-flex align-top">
      {range(1, fullStars + 1).map((star) => (
        <StarIcon key={'star' + star} className="h-5 w-5 text-yellow-500" />
      ))}
      <div className="relative">
        <StarIcon
          className="absolute h-5 w-5 text-yellow-500"
          viewBox={`${-clipPx} 0 20 20`}
          style={{ left: -clipPx }}
        />
        <StarOutline className="text-ink-300 h-5 w-5" />
      </div>
      {range(fullStars + 2, 6).map((star) => (
        <StarOutline key={'star' + star} className="text-ink-300 h-5 w-5" />
      ))}
    </div>
  )
}
