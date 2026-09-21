import { useState } from 'react'
import toast from 'react-hot-toast'
import { deleteMarket } from 'web/lib/api/api'
import { Button } from './button'

export const DeleteMarketButton = (props: {
  className?: string
  contractId: string
}) => {
  const { contractId, className } = props

  const [loading, setLoading] = useState(false)

  return (
    <Button
      className={className}
      size="2xs"
      color="red"
      loading={loading}
      disabled={loading}
      onClick={() => {
        setLoading(true)
        deleteMarket({ contractId })
          .then(() => window.location.reload())
          .catch((e) => {
            toast.error(e.message ?? 'Failed to delete question')
            setLoading(false)
          })
      }}
    >
      Delete question
    </Button>
  )
}
