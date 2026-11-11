import {
  BinaryContract,
  Contract,
  contractPath,
  CPMMMultiContract,
  isMultiCpmm,
} from 'common/contract'
import { PendingBet, SIGNED_OUT_BET_RESUME_EVENT } from 'common/signed-out-bet'
import { useRouter } from 'next/router'
import { useEffect, useRef } from 'react'

import { isClosed } from 'web/components/contract/contracts-table'
import { useContract, useLiveContract } from 'web/hooks/use-contract'
import { track } from 'web/lib/service/analytics'
import { BetDialog, MultiBetDialog } from './bet-dialog'

export function ResumedBetDialog(props: {
  bet: PendingBet
  onDone: () => void
}) {
  const { bet, onDone } = props
  const contract = useContract(bet.contractId)

  useEffect(() => {
    if (contract === null) onDone()
  }, [contract])

  if (!contract) return null
  return <ResumedTicket contract={contract} bet={bet} onDone={onDone} />
}

// The same dialog the pressed button opens for someone who is signed in.
function ResumedTicket(props: {
  contract: Contract
  bet: PendingBet
  onDone: () => void
}) {
  const { bet, onDone } = props
  const contract = useLiveContract(props.contract)
  const router = useRouter()
  const isMulti = isMultiCpmm(contract)
  const canTrade =
    !isClosed(contract) &&
    !contract.isResolved &&
    (contract.mechanism === 'cpmm-1' || isMulti)
  // The market's own page already shows a ticket for it.
  const onOwnPage = router.asPath.split(/[?#]/)[0] === contractPath(contract)
  const show = canTrade && !onOwnPage
  // Strict mode runs the effect twice in development; report once.
  const reported = useRef(false)

  useEffect(() => {
    if (!show) {
      onDone()
      return
    }
    if (reported.current) return
    reported.current = true
    track(SIGNED_OUT_BET_RESUME_EVENT, {
      contractId: contract.id,
      location: bet.location,
      outcome: bet.outcome,
      ms: Date.now() - bet.createdTime,
    })
  }, [show])

  if (!show) return null
  const setOpen = (open: boolean) => {
    if (!open) onDone()
  }
  return isMulti ? (
    <MultiBetDialog
      contract={contract as CPMMMultiContract}
      open
      setOpen={setOpen}
    />
  ) : (
    <BetDialog
      contract={contract as BinaryContract}
      open
      setOpen={setOpen}
      trackingLocation={bet.location}
      initialOutcome={bet.outcome}
    />
  )
}
