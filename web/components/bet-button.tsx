import { useState } from 'react'
import clsx from 'clsx'

import { BetPanel, BuyPanel, SimpleBetPanel } from './bet-panel'
import { CPMMBinaryContract, PseudoNumericContract } from 'common/contract'
import { getBinaryBetStats, getBinaryCpmmBetInfo } from 'common/new-bet'
import { Modal } from './layout/modal'
import { useUser } from 'web/hooks/use-user'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { useSaveBinaryShares } from './use-save-binary-shares'
import { Col } from './layout/col'
import { Button } from 'web/components/button'
import { BetSignUpPrompt } from './sign-up-prompt'
import { PRESENT_BET } from 'common/user'
import { Contract } from 'web/lib/firebase/contracts'
import { contractDetailsButtonClassName } from './contract/contract-info-dialog'
import { User } from 'web/lib/firebase/users'
import { SellRow } from './sell-row'
import { PlayMoneyDisclaimer } from './play-money-disclaimer'
import { Row } from './layout/row'
import { useUnfilledBets } from 'web/hooks/use-bets'
import { Bet } from 'common/bet'
import { getProbability } from 'common/calculate'
import { useFocus } from 'web/hooks/use-focus'
import { isAndroid, isIOS } from 'web/lib/util/device'
import { APIError, placeBet } from 'web/lib/firebase/api'
import { track } from '@amplitude/analytics-browser'
import toast from 'react-hot-toast'
import { CheckIcon } from '@heroicons/react/solid'

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
            {PRESENT_BET}
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
          selected="YES"
          onBetSuccess={() => setOpen(false)}
          hasShares={hasYesShares || hasNoShares}
        />
      </Modal>
    </>
  )
}

export function BinaryMobileBetting(props: {
  contract: CPMMBinaryContract | Contract
  className?: string
}) {
  const { contract, className } = props
  const user = useUser()
  if (user) {
    return (
      <>
        <SignedInBinaryMobileBetting contract={contract} user={user} />
      </>
    )
  } else {
    return (
      <>
        <BetSignUpPrompt className="w-full" />
      </>
    )
  }
}

export function SignedInBinaryMobileBetting(props: {
  contract: CPMMBinaryContract | Contract
  user: User
}) {
  const { contract, user } = props
  const [betChoice, setBetChoice] = useState<'YES' | 'NO' | undefined>(
    undefined
  )
  const unfilledBets = useUnfilledBets(contract.id) ?? []

  return (
    <>
      <Col className="w-full gap-2 px-1">
        <Col>
          <BuyPanel
            hidden={false}
            contract={contract}
            user={user}
            unfilledBets={unfilledBets}
            selected={betChoice}
            mobileView={true}
          />
        </Col>
        <SellRow
          contract={contract}
          user={user}
          className={
            'border-greyscale-3 bg-greyscale-1 rounded-md border-2 px-4 py-2'
          }
        />
      </Col>
    </>
  )
}
