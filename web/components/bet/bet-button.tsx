import {
  BinaryContract,
  CPMMBinaryContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { UserBetsSummary } from 'web/components/bet/bet-summary'
import { User } from 'web/lib/firebase/users'
import { Col } from '../layout/col'
import { BuyPanel } from './bet-panel'

export function SignedInBinaryMobileBetting(props: {
  contract: BinaryContract | PseudoNumericContract | StonkContract
  user: User | null | undefined
}) {
  const { contract, user } = props

  return (
    <Col className="my-3 w-full">
      <BuyPanel
        inModal={false}
        contract={contract as CPMMBinaryContract}
        user={user}
      />
      <UserBetsSummary
        className="border-ink-200 !mb-2 mt-2 "
        contract={contract}
        includeSellButton={user}
      />
    </Col>
  )
}
