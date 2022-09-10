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
  const { hasYesShares, hasNoShares } = useSaveBinaryShares(contract, userBets)

  return (
    <>
      <Col className={clsx('items-center', className)}>
        {user ? (
          <Button
            size="lg"
            className={clsx(
              'my-auto inline-flex min-w-[75px] whitespace-nowrap',
              btnClassName
            )}
            onClick={() => setOpen(true)}
          >
            Predict
          </Button>
        ) : (
          <BetSignUpPrompt />
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
