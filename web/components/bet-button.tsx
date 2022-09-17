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
  contract: CPMMBinaryContract
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
  contract: CPMMBinaryContract
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
        {/* <SellRow
          contract={contract}
          user={user}
          className={'rounded-t-md bg-gray-100 px-4 py-5'}
        /> */}
        {/* <Row className="w-full justify-between gap-4">
          <button
            className={clsx(
              'w-1/2 rounded-full border-2 py-2',
              betChoice === 'YES'
                ? 'border-teal-500 bg-teal-500 text-white'
                : betChoice === 'NO'
                ? 'border-greyscale-3 text-greyscale-3 bg-white'
                : 'border-teal-500 bg-white text-teal-500'
            )}
            onClick={() => {
              if (betChoice === 'YES') {
                setBetChoice(undefined)
              } else {
                setBetChoice('YES')
              }
            }}
          >
            YES
          </button>
          <button
            className={clsx(
              'w-1/2 rounded-full border-2 py-2',
              betChoice === 'NO'
                ? 'border-red-500 bg-red-500 text-white'
                : betChoice === 'YES'
                ? 'border-greyscale-3 text-greyscale-3 bg-white'
                : 'border-red-500 bg-white text-red-500'
            )}
            onClick={() => {
              if (betChoice === 'NO') {
                setBetChoice(undefined)
              } else {
                setBetChoice('NO')
              }
            }}
          >
            NO
          </button>
        </Row> */}
        <Col>
          <BuyPanel
            hidden={false}
            contract={contract}
            user={user}
            unfilledBets={unfilledBets}
            selected={betChoice}
            mobileView={true}
            // onBuySuccess={onBetSuccess}>
          />
        </Col>
      </Col>
    </>
  )
}
