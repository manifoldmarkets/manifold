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

export function SignedInBinaryMobileBetting(props: {
  contract: BinaryContract | PseudoNumericContract
  user: User
}) {
  const { contract, user } = props
  const { unfilledBets, balanceByUserId } = useUnfilledBetsAndBalanceByUserId(
    contract.id
  )

  return (
    <Col className="my-3 w-full gap-2 px-1">
      <BuyPanel
        hidden={false}
        contract={contract as CPMMBinaryContract}
        user={user}
        unfilledBets={unfilledBets}
        balanceByUserId={balanceByUserId}
        mobileView={true}
      />
      <SellRow
        contract={contract}
        user={user}
        className={'rounded-md border-2 border-gray-200 px-4 py-2'}
      />
    </Col>
  )
}
