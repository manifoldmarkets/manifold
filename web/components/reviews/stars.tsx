import { StarIcon as StarOutline } from '@heroicons/react/outline'
import { StarIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { DisplayUser } from 'common/api/user-types'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { range } from 'lodash'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { api, leaveReview } from 'web/lib/api/api'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { AmountInput } from '../widgets/amount-input'
import { ChoicesToggleGroup } from '../widgets/choices-toggle-group'
import { TextEditor, useTextEditor } from '../widgets/editor'
import { GradientContainer } from '../widgets/gradient-container'

export type Rating = 0 | 1 | 2 | 3 | 4 | 5

export const ReviewPanel = (props: {
  marketId: string
  title: string
  author: string
  className?: string
  onSubmit: (rating: Rating) => void
  creatorUser: DisplayUser | undefined
  currentUser: User | null | undefined
  existingReview?: {
    rating: Rating
    content?: any
  }
}) => {
  const {
    marketId,
    title,
    author,
    className,
    onSubmit,
    creatorUser,
    currentUser,
    existingReview,
  } = props
  const [rating, setRating] = useState<Rating>(existingReview?.rating ?? 0)
  const tipChoices = {
    [formatMoney(0)]: 0,
    [formatMoney(25)]: 25,
    [formatMoney(50)]: 50,
    [formatMoney(100)]: 100,
    Custom: 'custom',
  }
  const [tipChoice, setTipChoice] = useState<number | 'custom' | undefined>(0)

  const [customTipAmount, setCustomTipAmount] = useState<number | undefined>(
    undefined
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  const editor = useTextEditor({
    size: 'sm',
    placeholder: 'Add details (optional)',
    defaultValue: existingReview?.content,
  })

  const canTip = currentUser && creatorUser && currentUser.id !== creatorUser.id

  const handleTipChoice = (choice: number | string | boolean) => {
    if (typeof choice === 'number' || choice === 'custom') {
      setTipChoice(choice)
      if (choice !== 'custom') {
        setCustomTipAmount(undefined) // Clear custom amount if a predefined is selected
      }
    }
  }

  const getFinalTipAmount = () => {
    if (!canTip) return undefined
    if (tipChoice === 'custom') {
      return customTipAmount
    } else if (typeof tipChoice === 'number') {
      return tipChoice
    } else {
      return undefined
    }
  }

  const handleSubmit = async () => {
    if (rating === 0) return
    setIsSubmitting(true)

    const tipAmountToSend = getFinalTipAmount()
    const reviewData = { marketId, rating, review: editor?.getJSON() }

    try {
      // 1. Submit the review directly
      await leaveReview(reviewData)
      toast.success('Review saved!')
      // 2. If tip is selected, send the managram
      if (tipAmountToSend && tipAmountToSend > 0 && creatorUser) {
        await toast
          .promise(
            api('managram', {
              toIds: [creatorUser.id],
              amount: tipAmountToSend,
              message: `Tip for ${title}`,
              token: 'M$',
            }),
            {
              loading: `Sending tip to ${creatorUser.name}...`,
              success: `Sent ${formatMoney(tipAmountToSend)} tip to ${
                creatorUser.name
              }!`,
              error: (tipError: any) =>
                `Failed to send tip: ${tipError?.message ?? 'Unknown error'}`,
            }
          )
          .catch((tipError) => {
            console.error('Tip sending failed:', tipError)
          })
      }
      onSubmit(rating)
    } catch (reviewError: any) {
      toast.error(
        `Failed to save review: ${reviewError?.message ?? 'Unknown error'}`
      )
      console.error('Review submission failed:', reviewError)
    } finally {
      // Always reset loading state regardless of tip success/failure
      setIsSubmitting(false)
    }
  }

  return (
    <GradientContainer className={className}>
      <Col className="gap-4">
        <Col className="items-center gap-2">
          <h2 className="text-primary-500 text-xl">
            {existingReview ? 'Update your rating of' : 'Rate'} {author}
          </h2>
          <span className="text-sm italic">
            Did they honestly resolve the question?
          </span>

          <StarRating
            rating={rating}
            onClick={(rating: Rating) => {
              setRating(rating)
            }}
            className="my-3"
          />
        </Col>

        <TextEditor editor={editor} />

        {canTip && (
          <Col className="w-full gap-2 ">
            <h3 className="text-ink-800 ml-1">Tip {creatorUser?.name}?</h3>
            <ChoicesToggleGroup
              currentChoice={tipChoice}
              choicesMap={tipChoices}
              setChoice={handleTipChoice}
              color="indigo"
              className="self-start"
            />
            {tipChoice === 'custom' && (
              <AmountInput
                amount={customTipAmount}
                onChangeAmount={setCustomTipAmount}
              />
            )}
          </Col>
        )}
        <Row className="items-center justify-end gap-2">
          <Button
            disabled={rating == 0 || isSubmitting}
            loading={isSubmitting}
            onClick={handleSubmit}
          >
            {existingReview ? 'Update' : 'Submit'}
          </Button>
        </Row>
      </Col>
    </GradientContainer>
  )
}

export const StarRating = (props: {
  rating: Rating
  onClick: (rating: Rating) => void
  className?: string
}) => {
  const { rating, onClick, className } = props
  const [hoverRating, setHoverRating] = useState<number>(0)

  return (
    <div className={clsx('inline-flex align-top', className)}>
      {range(0, 5).map((i) => {
        return (
          <button
            className="relative"
            key={i}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              onClick((i + 1) as Rating)
            }}
            onMouseEnter={() => setHoverRating(i + 1)}
            onMouseLeave={() => setHoverRating(0)}
          >
            {(i + 1 <= rating || i + 1 <= hoverRating) && (
              <StarIcon
                className="absolute h-8 w-8 text-yellow-500"
                viewBox={`0 0 20 20`}
              />
            )}
            <StarOutline className="text-ink-300 h-8 w-8" />
          </button>
        )
      })}
    </div>
  )
}

export const StarDisplay = (props: { rating: Rating; className?: string }) => {
  const { rating, className } = props

  return (
    <div className={clsx('inline-flex align-top', className)}>
      {range(0, 5).map((i) => {
        return (
          <div className="relative" key={i}>
            {i + 1 <= rating && (
              <StarIcon
                className="absolute h-4 w-4 text-yellow-500"
                viewBox={`0 0 20 20`}
              />
            )}
            <StarOutline className="text-ink-300 h-4 w-4" />
          </div>
        )
      })}
    </div>
  )
}
