import { useState } from 'react'
import clsx from 'clsx'

import { SimpleBetPanel } from './bet-panel'
import { CPMMBinaryContract, PseudoNumericContract } from 'common/contract'
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
  enum betChoiceState {
    YES = 'yes',
    NO = 'no',
    NEITHER = 'neither',
  }
  const { contract, user } = props
  const [betChoice, setBetChoice] = useState<betChoiceState>(
    betChoiceState.NEITHER
  )
  return (
    <>
      {/* GET BACK TO THIS BUT GAH DAMN IT'S UGLY */}
      {/* <SellRow
        contract={contract}
        user={user}
        className={'rounded-t-md bg-gray-100 px-4 py-5'}
  /> */}
      <Row className="w-full">
        <button
          className={clsx(
            'w-1/2 rounded-full py-2',
            betChoice == betChoiceState.YES
              ? 'bg-emerald-500 text-white'
              : betChoice == betChoiceState.NO
              ? 'border-greyscale-4 text-greyscale-4 bg-white'
              : 'border-2 border-emerald-500 bg-white text-emerald-500'
          )}
          onClick={() => {
            if (betChoice == betChoiceState.YES) {
              setBetChoice(betChoiceState.NEITHER)
            } else {
              setBetChoice(betChoiceState.YES)
            }
          }}
        >
          YES
        </button>
      </Row>
    </>
  )
}
