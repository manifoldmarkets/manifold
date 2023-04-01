import { BuyPanel } from './bet-panel'
import {
  BinaryContract,
  CPMMBinaryContract,
  PseudoNumericContract,
} from 'common/contract'
import { Col } from '../layout/col'
import { User } from 'web/lib/firebase/users'
import { SellRow } from './sell-row'
import { useUnfilledBetsAndBalanceByUserId } from 'web/hooks/use-bets'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { ShareholderStats } from 'common/supabase/contract-metrics'

export function SignedInBinaryMobileBetting(props: {
  contract: BinaryContract | PseudoNumericContract
  user: User
  shareholderStats?: ShareholderStats
}) {
  const { contract, user, shareholderStats } = props
  const { unfilledBets, balanceByUserId } = useUnfilledBetsAndBalanceByUserId(
    contract.id
  )

  const isMobile = useIsMobile()

  return (
    <Col className="my-3 w-full px-1">
      <BuyPanel
        hidden={false}
        contract={contract as CPMMBinaryContract}
        user={user}
        unfilledBets={unfilledBets}
        balanceByUserId={balanceByUserId}
        mobileView={isMobile}
        shareholderStats={shareholderStats}
      />
      <SellRow
        contract={contract}
        user={user}
        className={'border-ink-200 mt-2 rounded-md border-2 px-4 py-2'}
      />
    </Col>
  )
}
