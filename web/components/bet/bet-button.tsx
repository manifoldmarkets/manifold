import { BuyPanel } from './bet-panel'
import {
  BinaryContract,
  CPMMBinaryContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { Col } from '../layout/col'
import { User } from 'web/lib/firebase/users'
import { SellRow } from './sell-row'
import { useIsMobile } from 'web/hooks/use-is-mobile'

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
      <SellRow
        contract={contract as CPMMBinaryContract}
        user={user}
        className={'border-ink-200 mt-2 rounded-md border-2 px-4 py-2'}
      />
    </Col>
  )
}
