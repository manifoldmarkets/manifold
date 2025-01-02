import { Contract } from 'common/contract'
import { Spacer } from '../layout/spacer'
import { CreatorSharePanel, NonCreatorSharePanel } from './creator-share-panel'

export default function ContractSharePanel(props: {
  isClosed: boolean
  isCreator: boolean
  showResolver: boolean
  contract: Contract
  className?: string
}) {
  const { isClosed, isCreator, showResolver, contract, className } = props
  const { isResolved } = contract
  return (
    <div className={className}>
      {!isResolved &&
        !isClosed &&
        (isCreator ? (
          <>
            {showResolver && <Spacer h={4} />}
            <CreatorSharePanel contract={contract} />
          </>
        ) : (
          <NonCreatorSharePanel contract={contract} />
        ))}
    </div>
  )
}
