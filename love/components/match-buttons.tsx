import clsx from 'clsx'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { createMatch } from 'web/lib/firebase/api'

export const AddYourselfAsMatchButton = (props: {
  currentUserId: string
  matchUserId: string
  className?: string
}) => {
  const { currentUserId, matchUserId, className } = props

  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async () => {
    setIsSubmitting(true)
    const result = await createMatch({
      userId1: currentUserId,
      userId2: matchUserId,
      betAmount: 50,
    }).finally(() => setIsSubmitting(false))

    console.log('result', result)
  }

  return (
    <Button
      className={clsx(className)}
      color="green"
      onClick={submit}
      disabled={isSubmitting}
      loading={isSubmitting}
    >
      Add yourself as a match
    </Button>
  )
}
