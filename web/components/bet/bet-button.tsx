import { BuyPanel } from './bet-panel'
import {
  BinaryContract,
  CPMMBinaryContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { Col } from '../layout/col'
import { User } from 'web/lib/firebase/users'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { UserBetsSummary } from 'web/components/bet/bet-summary'

export function SignedInBinaryMobileBetting(props: {
  contract: BinaryContract | PseudoNumericContract | StonkContract
  user: User
}) {
  const { contract, user } = props
  const isMobile = useIsMobile()

  return (
    <Col className="my-3 w-full px-1">
      <BuyPanel
        hidden={false}
        contract={contract as CPMMBinaryContract}
        user={user}
        mobileView={isMobile}
      />
      <UserBetsSummary
        className="border-ink-200 mt-2 !mb-2 "
        contract={contract}
        includeSellButton={user}
      />
    </Col>
  )
}
