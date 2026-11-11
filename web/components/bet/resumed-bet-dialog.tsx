import {
  BinaryContract,
  Contract,
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

const MARKET_PAGE = '/[username]/[contractSlug]'

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
  // The market's own page already shows a ticket for it. That page is found
  // by slug alone, so a link with an old username still counts.
  const onOwnPage =
    router.pathname === MARKET_PAGE &&
    router.query.contractSlug === contract.slug
  const show = canTrade && !onOwnPage
  // Strict mode runs the effect twice in development; report once.
  const reported = useRef(false)

  useEffect(() => {
    if (!show) {
      onDone()
      return
    }
    // Only a press that was part of the test is reported, like its exposure.
    if (reported.current || !bet.enrolled) return
    reported.current = true
    track(SIGNED_OUT_BET_RESUME_EVENT, {
      contractId: contract.id,
      location: bet.location,
      outcome: bet.outcome,
      forced: !!bet.forced,
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
