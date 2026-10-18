import { escapeRegExp } from 'lodash'
import { useEffect, useState } from 'react'
import { db } from 'web/lib/supabase/db'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
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
  const [failed, setFailed] = useState(!contractId)

  useEffect(() => {
    if (!contractId) return
    let cancelled = false
    getContract(db, contractId)
      .then(async (c) => {
        if (cancelled) return
        // isMultiCpmm: a converted cpmm-multi-2 game would otherwise render a silent null.
        if (!c || !isMultiCpmm(c)) return setFailed(true)
        const answerMap = await getAnswersForContracts(db, [c.id])
        if (cancelled) return
        const multi = c as CPMMMultiContract
        setContract({
          ...multi,
          answers: answerMap[c.id] ?? multi.answers ?? [],
        })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [contractId])

  return { contract, failed }
}

// The row keeps its bet state while this is open, so give it a way to close.
function SportsLoadError(props: { onClose: () => void }) {
  return (
    <Modal
      open
      setOpen={(open) => {
        if (!open) props.onClose()
      }}
      className={MODAL_CLASS}
    >
      <p className="text-ink-700">
        Couldn&apos;t load this market. Please try again.
      </p>
    </Modal>
  )
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
  const { contract, failed } = useSportsContract(contractId)

  if (failed) return <SportsLoadError onClose={onClose} />
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
  const { contract, failed } = useSportsContract(match.contractId)

  if (failed) return <SportsLoadError onClose={onClose} />
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
  // Titles often end with the date ("Everton vs Chelsea, Oct 17"); repeat it
  // only when the local kickoff date differs.
  const titleHasDate = new RegExp(
    `\\b${escapeRegExp(match.closeDateLabel)}\\b`
  ).test(contract.question)
  const kickoff = `Kickoff ${match.closeTime}`
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
    : titleHasDate
    ? kickoff
    : `${match.closeDateLabel} · ${kickoff}`
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
