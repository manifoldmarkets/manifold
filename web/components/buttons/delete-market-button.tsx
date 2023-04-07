import { useState } from 'react'
import { deleteMarket } from 'web/lib/firebase/api'
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
      color="red"
      loading={loading}
      disabled={loading}
      onClick={() => {
        setLoading(true)
        deleteMarket({ contractId }).then(() => window.location.reload())
      }}
    >
      Delete market
    </Button>
  )
}
