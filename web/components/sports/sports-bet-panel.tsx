import { useEffect, useState } from 'react'
import { db } from 'web/lib/supabase/db'
import { getContract, getAnswersForContracts } from 'common/supabase/contracts'
import { CPMMMultiContract, isMultiCpmm } from 'common/contract'
import {
  isThreeWayMulti,
  MultiBetDialog,
  ThreeWayTradeDialog,
} from 'web/components/bet/bet-dialog'
import { SportsMatch, MatchOutcome } from './sports-match-card'

// Game markets are bet on with Manifold's standard dialogs: knockout markets
// have no Draw answer, so they're two-answer "versus" markets; soccer markets
// with a Draw are three-way. Both load the contract by id.
function useSportsContract(contractId: string | undefined) {
  const [contract, setContract] = useState<CPMMMultiContract | null>(null)

  useEffect(() => {
    if (!contractId) return
    let cancelled = false
    getContract(db, contractId)
      .then(async (c) => {
        // isMultiCpmm: a converted cpmm-multi-2 game would otherwise render a silent null.
        if (cancelled || !c || !isMultiCpmm(c)) return
        const answerMap = await getAnswersForContracts(db, [c.id])
        if (cancelled) return
        const multi = c as CPMMMultiContract
        setContract({
          ...multi,
          answers: answerMap[c.id] ?? multi.answers ?? [],
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [contractId])

  return contract
}

export function SportsVersusBetDialog({
  contractId,
  onClose,
  initialAnswerId,
}: {
  contractId: string | undefined
  onClose: () => void
  /** The answer (team) the dialog opens on; defaults to the first answer. */
  initialAnswerId?: string
}) {
  const contract = useSportsContract(contractId)

  if (!contract) return null
  // The versus panel treats the first answer as YES and the second as NO, so
  // the side is decided by where the answer sits in the fetched market, not
  // by which team is home ("Lakers @ Celtics" lists the away team first).
  const initialOutcome =
    initialAnswerId && contract.answers[1]?.id === initialAnswerId
      ? 'NO'
      : 'YES'
  return (
    <MultiBetDialog
      contract={contract}
      open
      setOpen={(open) => {
        if (!open) onClose()
      }}
      initialOutcome={initialOutcome}
    />
  )
}

/** Home / draw / away markets: one ticket with a picker between the three. */
export function SportsThreeWayBetDialog({
  match,
  initialOutcome,
  onClose,
}: {
  match: SportsMatch
  initialOutcome: MatchOutcome
  onClose: () => void
}) {
  const contract = useSportsContract(match.contractId)

  if (!contract) return null
  const setOpen = (open: boolean) => {
    if (!open) onClose()
  }
  if (!isThreeWayMulti(contract))
    return <MultiBetDialog contract={contract} open setOpen={setOpen} />

  const answerIds = {
    teamA: match.teamAAnswerId,
    draw: match.drawAnswerId,
    teamB: match.teamBAnswerId,
  }
  const live = match.liveScore
  const description = live
    ? [
        live.minute === 'HT'
          ? 'Half time'
          : live.minute != null
          ? `Live · ${live.minute}'`
          : 'Live',
        live.home != null && live.away != null
          ? `${live.home} – ${live.away}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : `${match.closeDateLabel} · Kickoff ${match.closeTime}`
  return (
    <ThreeWayTradeDialog
      contract={contract}
      open
      setOpen={setOpen}
      trackingLocation="sports three-way"
      initialAnswerId={answerIds[initialOutcome]}
      answerOrder={[answerIds.teamA, answerIds.draw, answerIds.teamB]}
      description={description}
    />
  )
}
