import { deleteMarket } from 'web/lib/firebase/api'
import { Button } from './button'

export const DeleteMarketButton = (props: {
  className?: string
  contractId: string
}) => {
  const { contractId, className } = props

  return (
    <Button
      className={className}
      onClick={() =>
        deleteMarket({ contractId }).then(() => window.location.reload())
      }
    >
      Delete market
    </Button>
  )
}
