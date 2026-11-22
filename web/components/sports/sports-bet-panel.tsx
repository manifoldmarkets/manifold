import clsx from 'clsx'
import dayjs from 'dayjs'
import { SportsTicketContext } from 'web/components/bet/sports-ticket-context'
import {
  matchesSportsTicket,
  sportsTicketBinding,
  toOfficialGame,
} from 'common/sports-official-game'
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
import {
  toUfcMarketBout,
  ufcCanBet,
  type UfcMarketBout,
} from 'common/bdl/ufc-card'
import { SportsMatch, MatchOutcome } from './sports-match-card'

/** Answers live in their own table. Bracket that read with two fixture checks;
 * the order endpoint repeats the check under the platform's contract lock. */
export async function readSportsContract(
  contractId: string,
  expected?: ScheduleGame
) {
  const first = await getContract(db, contractId)
  if (!first || !isMultiCpmm(first)) return null
  const answers = (await getAnswersForContracts(db, [contractId]))[contractId]
  if (!expected) {
    const legacy = first as CPMMMultiContract
    return { ...legacy, answers: answers ?? legacy.answers ?? [] }
  }
  const latest = await getContract(db, contractId)
  const rows = answers ?? []
  if (
    !latest ||
    !isMultiCpmm(latest) ||
    latest.outcomeType !== 'MULTIPLE_CHOICE' ||
    !matchesSportsTicket(expected, first, rows, sportsViewNow()) ||
    !matchesSportsTicket(expected, latest, rows, sportsViewNow())
  )
    return null
  return { ...latest, answers: rows }
}

// Game markets are bet on with Manifold's standard dialogs: knockout markets
// have no Draw answer, so they're two-answer "versus" markets; soccer markets
// with a Draw are three-way. Both load the contract by id.
function useSportsContract(
  contractId: string | undefined,
  expected?: ScheduleGame
) {
  const [contract, setContract] = useState<CPMMMultiContract | null>(null)
  const [failed, setFailed] = useState(!contractId)

  // A changed quote invalidates the native curves as well as the picker's label.
  const quote =
    expected &&
    JSON.stringify([
      sportsTicketBinding(expected),
      expected.home.prob,
      expected.away.prob,
      expected.draw?.prob,
    ])
  useEffect(() => {
    if (!contractId) return
    let cancelled = false
    readSportsContract(contractId, expected)
      .then((value) => {
        if (cancelled) return
        setContract(value)
        setFailed(!value)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [contractId, quote])

  return { contract, failed }
}

function bindTicket(
  dialog: JSX.Element,
  game: ScheduleGame | undefined,
  contract: CPMMMultiContract,
  initialClose?: number,
  onInvalid?: () => void
) {
  if (!game) return dialog
  const closeTime = Math.min(
    game.closeTime,
    contract.closeTime ?? Infinity,
    initialClose ?? Infinity
  )
  const ticket = { binding: sportsTicketBinding(game), closeTime }
  return (
    <SportsTicketContext.Provider value={{ ticket, onInvalid }}>
      {dialog}
    </SportsTicketContext.Provider>
  )
}

// While the dialog loads, the feed snapshot and the newly read market may diverge.
function useValidTicket(
  game: ScheduleGame | undefined,
  contract: CPMMMultiContract | null,
  onClose: () => void,
  intentClose?: number,
  failed = false
) {
  const [, rerender] = useState(0)
  const now = sportsViewNow()
  const valid =
    !game ||
    (!failed &&
      (!contract ||
        ((intentClose == null || now < intentClose) &&
          matchesSportsTicket(game, contract, contract.answers, now))))
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

/** Refetch the native contract and validate the participant/answer mapping before opening the ordinary three-way ticket. */
export function UfcWinnerBetDialog({
  bout,
  selected,
  onClose,
}: {
  bout: UfcMarketBout
  selected: string
  onClose: () => void
}) {
  const { contract, failed } = useSportsContract(bout.id)
  if (failed) return <SportsLoadError onClose={onClose} />
  if (!contract) return null
  const current = toUfcMarketBout(contract, contract.answers)
  if (
    !current ||
    current.eventId !== bout.eventId ||
    !ufcCanBet(current, Date.now()) ||
    !current.answers.some(
      (a) =>
        a.answerId === selected &&
        a.fighterId ===
          bout.answers.find((pick) => pick.answerId === selected)?.fighterId
    )
  )
    return <SportsLoadError onClose={onClose} />
  return (
    <ThreeWayTradeDialog
      contract={contract}
      open
      setOpen={(open) => {
        if (!open) onClose()
      }}
      initialAnswerId={selected}
      answerOrder={current.answers.map((a) => a.answerId)}
      trackingLocation="sports UFC card"
      description={current.cardName}
    />
  )
}

export function SportsVersusBetDialog({
  contractId,
  onClose,
  initialAnswerId,
  expectedGame,
  intentClose,
  onInvalid,
}: {
  onInvalid?: () => void
  intentClose?: number
  expectedGame?: ScheduleGame
  contractId: string | undefined
  onClose: () => void
  /** The answer (team) the dialog opens on; defaults to the first answer. */
  initialAnswerId?: string
}) {
  const { contract, failed } = useSportsContract(contractId, expectedGame)
  const valid = useValidTicket(
    expectedGame,
    contract,
    onInvalid ?? onClose,
    intentClose,
    failed
  )
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
  const dialog = (
    <MultiBetDialog
      contract={contract}
      open
      setOpen={(open) => {
        if (!open) onClose()
      }}
      initialOutcome={initialOutcome}
    />
  )
  return bindTicket(dialog, expectedGame, contract, intentClose, onInvalid)
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
  onInvalid,
}: {
  onInvalid?: () => void
  intentClose?: number
  expectedGame?: ScheduleGame
  match: SportsMatch
  initialOutcome: MatchOutcome
  onClose: () => void
}) {
  const { contract, failed } = useSportsContract(match.contractId, expectedGame)
  const valid = useValidTicket(
    expectedGame,
    contract,
    onInvalid ?? onClose,
    intentClose,
    failed
  )
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
  const fetched =
    expectedGame &&
    toOfficialGame(contract, contract.answers, [], undefined, sportsViewNow())
  const displayed =
    fetched &&
    (fetched.liveUpdatedTime ?? -1) >= (expectedGame?.liveUpdatedTime ?? -1)
      ? fetched
      : expectedGame
  const live = displayed ? displayed.liveScore : match.liveScore
  // Titles often end with the date ("Everton vs Chelsea, Oct 17"); repeat it
  // only when the local kickoff date differs.
  const titleHasDate = new RegExp(
    `\\b${escapeRegExp(match.closeDateLabel)}\\b`
  ).test(contract.question)
  const kickoff = `${
    displayed && !displayed.kickoffKnown ? 'Closes' : 'Kickoff'
  } ${match.closeTime}`
  const heldLabel =
    displayed && displayed.gameState !== 'live' && displayed.status !== 'live'
      ? gameScoreLabel(displayed, (at) => dayjs(at).format('MMM D'))
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
  const dialog = (
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
  return bindTicket(dialog, expectedGame, contract, intentClose, onInvalid)
}
