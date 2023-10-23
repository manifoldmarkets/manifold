import {
  BinaryContract,
  CPMMBinaryContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { User } from 'web/lib/firebase/users'
import { Col } from '../layout/col'
import { PreviewBuyPanel } from './preview-bet-panel'

export function PreviewSignedInBinaryMobileBetting(props: {
  contract: BinaryContract | PseudoNumericContract | StonkContract
  user: User | null | undefined
}) {
  const { contract, user } = props

  return (
    <Col className="my-3 w-full px-1">
      <PreviewBuyPanel
        inModal={false}
        contract={contract as CPMMBinaryContract}
        user={user}
      />
    </Col>
  )
}
