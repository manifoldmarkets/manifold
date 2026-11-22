import clsx from 'clsx'
import { matchesSportsTicket } from 'common/sports-official-game'
import { ScheduleGame } from 'common/sports-schedule'
import { gameScoreLabel } from 'common/sports-scoreboard'
import { sportsViewNow } from 'common/sports-view-clock'
import { escapeRegExp } from 'lodash'
import { useEffect, useState } from 'react'
import { db } from 'web/lib/supabase/db'
import { AnswerCpmmBetPanel } from 'web/components/answers/answer-bet-panel'
import {
  Modal,
  MODAL_CLASS,
  SCROLLABLE_MODAL_CLASS,
} from 'web/components/layout/modal'
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
function useSportsContract(contractId: string | undefined, verify = false) {
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
          answers: answerMap[c.id] ?? (verify ? [] : multi.answers ?? []),
        })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [contractId, verify])

  return { contract, failed }
}

// While the dialog loads, the feed snapshot and the newly read market may diverge.
function useValidTicket(
  game: ScheduleGame | undefined,
  contract: CPMMMultiContract | null,
  onClose: () => void,
  intentClose?: number
) {
  const [, rerender] = useState(0)
  const now = sportsViewNow()
  const valid =
    !game ||
    !contract ||
    ((intentClose == null || now < intentClose) &&
      matchesSportsTicket(game, contract, contract.answers, now))
  useEffect(() => {
    if (!valid) onClose()
    if (!game || !valid || !contract || contract.closeTime == null) return
    const delay =
      Math.min(game.closeTime, contract.closeTime, intentClose ?? Infinity) -
      sportsViewNow()
    const timer = setTimeout(
      () => rerender((n) => n + 1),
      Math.min(2147483647, Math.max(delay, 0))
    )
    return () => clearTimeout(timer)
  }, [valid, game, contract, now, onClose, intentClose])
  return valid
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
  expectedGame,
  intentClose,
}: {
  intentClose?: number
  expectedGame?: ScheduleGame
  contractId: string | undefined
  onClose: () => void
  /** The answer (team) the dialog opens on; defaults to the first answer. */
  initialAnswerId?: string
}) {
  const { contract, failed } = useSportsContract(contractId, !!expectedGame)
  const valid = useValidTicket(expectedGame, contract, onClose, intentClose)
  if (!valid) return null

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

/**
 * One answer of a multiple choice market, like a driver in an F1 session's
 * winner or podium market: YES that they do it, or NO.
 */
export function SportsAnswerBetDialog({
  contractId,
  answerId,
  onClose,
}: {
  contractId: string
  answerId: string
  onClose: () => void
}) {
  const { contract, failed } = useSportsContract(contractId)
  const answer = contract?.answers.find((a) => a.id === answerId)

  if (failed || (contract && !answer))
    return <SportsLoadError onClose={onClose} />
  if (!contract || !answer) return null
  return (
    <Modal
      open
      setOpen={(open) => {
        if (!open) onClose()
      }}
      className={clsx(MODAL_CLASS, SCROLLABLE_MODAL_CLASS)}
    >
      <AnswerCpmmBetPanel
        answer={answer}
        contract={contract}
        outcome="YES"
        closePanel={onClose}
        alwaysShowOutcomeSwitcher
      />
    </Modal>
  )
}

/** Home / draw / away markets: one ticket with a picker between the three. */
export function SportsThreeWayBetDialog({
  match,
  initialOutcome,
  onClose,
  expectedGame,
  intentClose,
}: {
  intentClose?: number
  expectedGame?: ScheduleGame
  match: SportsMatch
  initialOutcome: MatchOutcome
  onClose: () => void
}) {
  const { contract, failed } = useSportsContract(
    match.contractId,
    !!expectedGame
  )
  const valid = useValidTicket(expectedGame, contract, onClose, intentClose)
  if (!valid) return null

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
  const heldLabel =
    expectedGame &&
    ['suspended', 'postponed', 'delayed'].includes(expectedGame.gameState ?? '')
      ? gameScoreLabel(expectedGame)
      : undefined
  const description = heldLabel
    ? [
        heldLabel,
        live?.home != null && live.away != null
          ? `${live.home} – ${live.away}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : live
    ? [
        live.minute === 'HT'
          ? 'Half time'
          : live.minute != null
          ? `In progress · ${live.minute}'`
          : 'In progress',
        'Scores delayed',
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
