import { useState } from 'react'
import clsx from 'clsx'

import { BuyPanel, SimpleBetPanel } from './bet-panel'
import {
  BinaryContract,
  CPMMBinaryContract,
  PseudoNumericContract,
} from 'common/contract'
import { Modal } from '../layout/modal'
import { useUser } from 'web/hooks/use-user'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { useSaveBinaryShares } from '../../hooks/use-save-binary-shares'
import { Col } from '../layout/col'
import { Button } from 'web/components/buttons/button'
import { BetSignUpPrompt } from '../sign-up-prompt'
import { User } from 'web/lib/firebase/users'
import { SellRow } from './sell-row'
import { useUnfilledBetsAndBalanceByUserId } from 'web/hooks/use-bets'
import { PlayMoneyDisclaimer } from '../play-money-disclaimer'

/** Button that opens BetPanel in a new modal */
export default function BetButton(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  className?: string
  btnClassName?: string
  betPanelClassName?: string
}) {
  const { className, btnClassName, betPanelClassName, contract } = props
  const [open, setOpen] = useState(false)

  const user = useUser()
  const userBets = useUserContractBets(user?.id, contract.id)
  const { yesShares, noShares, hasYesShares, hasNoShares } =
    useSaveBinaryShares(contract, userBets)

  const { outcomeType } = contract
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'

  return (
    <>
      <Col className={clsx('items-center', className)}>
        {user ? (
          <Button
            size="lg"
            className={clsx(
              'my-auto inline-flex min-w-[75px] whitespace-nowrap capitalize',
              btnClassName
            )}
            onClick={() => setOpen(true)}
          >
            Predict
          </Button>
        ) : (
          <BetSignUpPrompt />
        )}

        {user && (
          <div className={'mt-1 w-24 text-center text-sm text-gray-500'}>
            {hasYesShares
              ? `(${Math.floor(yesShares)} ${
                  isPseudoNumeric ? 'HIGHER' : 'YES'
                })`
              : hasNoShares
              ? `(${Math.floor(noShares)} ${isPseudoNumeric ? 'LOWER' : 'NO'})`
              : ''}
          </div>
        )}
      </Col>

      <Modal open={open} setOpen={setOpen} position="center">
        <SimpleBetPanel
          className={betPanelClassName}
          contract={contract}
          onBetSuccess={() => setOpen(false)}
          hasShares={hasYesShares || hasNoShares}
        />
      </Modal>
    </>
  )
}

export function BinaryMobileBetting(props: { contract: BinaryContract }) {
  const { contract } = props
  const user = useUser()
  if (user) {
    return <SignedInBinaryMobileBetting contract={contract} user={user} />
  } else if (user === null) {
    return (
      <Col className="w-full">
        <BetSignUpPrompt className="w-full" />
        <PlayMoneyDisclaimer />
      </Col>
    )
  }
  return null
}

export function SignedInBinaryMobileBetting(props: {
  contract: BinaryContract
  user: User
}) {
  const { contract, user } = props
  const { unfilledBets, balanceByUserId } = useUnfilledBetsAndBalanceByUserId(
    contract.id
  )

  return (
    <>
      <Col className="w-full gap-2 px-1">
        <Col>
          <BuyPanel
            hidden={false}
            contract={contract as CPMMBinaryContract}
            user={user}
            unfilledBets={unfilledBets}
            balanceByUserId={balanceByUserId}
            mobileView={true}
          />
        </Col>
        <SellRow
          contract={contract}
          user={user}
          className={
            'border-greyscale-2 bg-greyscale-0 rounded-md border-2 px-4 py-2'
          }
        />
      </Col>
    </>
  )
}
