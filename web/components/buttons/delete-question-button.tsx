import { useState } from 'react'
import { deleteQuestion } from 'web/lib/firebase/api'
import { Button } from './button'

export const DeleteQuestionButton = (props: {
  className?: string
  contractId: string
}) => {
  const { contractId, className } = props

  const [loading, setLoading] = useState(false)

  return (
    <Button
      className={className}
      color="red"
      loading={loading}
      disabled={loading}
      onClick={() => {
        setLoading(true)
        deleteQuestion({ contractId }).then(() => window.location.reload())
      }}
    >
      Delete question
    </Button>
  )
}
