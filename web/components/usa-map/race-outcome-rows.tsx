import { ReactNode, useState } from 'react'
import { capitalize, groupBy, sumBy } from 'lodash'
import { Answer } from 'common/answer'
import { getAnswerProbability } from 'common/calculate'
import {
  BinaryContract,
  Contract,
  CPMMMultiContract,
  isMultiCpmm,
} from 'common/contract'
import { TRADE_TERM } from 'common/envs/constants'
import { floatingEqual } from 'common/util/math'
import { AnswerCpmmBetPanel } from 'web/components/answers/answer-bet-panel'
import { BetDialog } from 'web/components/bet/bet-dialog'
import { Button } from 'web/components/buttons/button'
import {
  Modal,
  MODAL_CLASS,
  SCROLLABLE_MODAL_CLASS,
} from 'web/components/layout/modal'
import {
  BinaryUserPosition,
  UserPosition,
} from 'web/components/us-elections/contracts/candidates-panel/candidates-user-position'
import { SliderColor } from 'web/components/widgets/slider'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { useSaveBinaryShares } from 'web/hooks/use-save-binary-shares'
import { useUser } from 'web/hooks/use-user'
import { useUserContractBets } from 'client-common/hooks/use-user-bets'
import { api } from 'web/lib/api/api'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { complementParty, sourceAudit } from './audited-sources'
import { formatOdds } from './election-display'
import type { ElectionMode, Race } from './election-map-model'
import {
  arrangeOutcomes,
  binaryRows,
  districtRows,
  OutcomeParty,
  OutcomeRow,
  outcomeRow,
} from './race-outcomes'
import styles from './election-explorer.module.css'

// One row design for every race source: party label, candidate subtitle,
// percentage, party-colored bar and a Bet button, in the map's party colors.

const partyTone = (party: OutcomeParty) =>
  party === 'D'
    ? 'dem'
    : party === 'R'
    ? 'rep'
    : party === 'any' || party === 'unknown'
    ? 'any'
    : 'other'

const sliderColor = (party: OutcomeParty): SliderColor =>
  party === 'D' ? 'azure' : party === 'R' ? 'sienna' : 'gray'

const isOpen = (contract: Contract) =>
  !contract.isResolved &&
  (contract.closeTime == null || contract.closeTime > Date.now())

export function RaceOutcomes(props: {
  contract: Contract
  race: Race
  mode: ElectionMode
}) {
  const { contract, race, mode } = props
  if (isMultiCpmm(contract) && contract.outcomeType === 'MULTIPLE_CHOICE')
    return <MultiOutcomes contract={contract} race={race} />
  if (contract.mechanism === 'cpmm-1' && contract.outcomeType === 'BINARY')
    return <BinaryOutcomes contract={contract} race={race} mode={mode} />
  return null
}

function MultiOutcomes(props: { contract: CPMMMultiContract; race: Race }) {
  const { contract, race } = props
  const user = useUser()
  const audit = sourceAudit(contract.slug)
  const parties =
    audit?.contractId === contract.id ? audit.answerParties : undefined
  const [betting, setBetting] = useState<Answer>()
  const userBets = useUserContractBets(
    user?.id,
    contract.id,
    (params) => api('bets', params),
    useIsPageVisible
  )
  const betsByAnswer = groupBy(userBets, (bet) => bet.answerId)
  const answers = contract.answers.filter((a) => a.resolution !== 'CANCEL')
  const rows = answers.map((a) =>
    outcomeRow(
      { id: a.id, text: a.text, prob: getAnswerProbability(contract, a.id) },
      race.candidates ?? [],
      parties?.[a.id]
    )
  )
  const byId = Object.fromEntries(answers.map((a) => [a.id, a]))
  return (
    <>
      <OutcomeList
        rows={rows}
        raceLabel={race.label}
        canBet={(row) => isOpen(contract) && !byId[row.key]?.resolution}
        onBet={(row) => setBetting(byId[row.key])}
        extra={(row) => {
          const answer = byId[row.key]
          const shares = sumBy(betsByAnswer[row.key], (bet) =>
            bet.outcome === 'YES' ? bet.shares : -bet.shares
          )
          return user && answer && !floatingEqual(shares, 0) ? (
            <UserPosition
              contract={contract}
              answer={answer}
              userBets={betsByAnswer[row.key]}
              user={user}
              className={styles.outcomePosition}
            />
          ) : null
        }}
      />
      {betting && (
        <Modal
          open
          setOpen={(open) => !open && setBetting(undefined)}
          ariaLabel={`Bet on ${betting.text}, ${race.label}`}
          className={`${MODAL_CLASS} ${SCROLLABLE_MODAL_CLASS}`}
        >
          <AnswerCpmmBetPanel
            answer={betting}
            contract={contract}
            outcome="YES"
            closePanel={() => setBetting(undefined)}
            alwaysShowOutcomeSwitcher
          />
        </Modal>
      )}
    </>
  )
}

function BinaryOutcomes(props: {
  contract: BinaryContract
  race: Race
  mode: ElectionMode
}) {
  const { contract, race, mode } = props
  const user = useUser()
  const [outcome, setOutcome] = useState<'YES' | 'NO'>()
  const userBets = useUserContractBets(
    user?.id,
    contract.id,
    (params) => api('bets', params),
    useIsPageVisible
  )
  const { sharesOutcome } = useSaveBinaryShares(contract, userBets)
  const rows = binaryRows(contract, race, mode)
  const pseudonym = {
    YES: {
      pseudonymName: rows.YES.label,
      pseudonymColor: sliderColor(rows.YES.party),
    },
    NO: {
      pseudonymName: rows.NO.label,
      pseudonymColor: sliderColor(rows.NO.party),
    },
  }
  return (
    <>
      <OutcomeList
        rows={[rows.YES, rows.NO]}
        raceLabel={race.label}
        canBet={() => isOpen(contract)}
        onBet={(row) => {
          if (!user) return firebaseLogin()
          setOutcome(row.key === 'YES' ? 'YES' : 'NO')
        }}
        extra={(row) =>
          user && userBets && sharesOutcome === row.key ? (
            <BinaryUserPosition
              contract={contract}
              userBets={userBets}
              user={user}
              binaryPseudonym={pseudonym}
              className={styles.outcomePosition}
            />
          ) : null
        }
      />
      {outcome && (
        <BetDialog
          contract={contract}
          open
          setOpen={(open) => !open && setOutcome(undefined)}
          initialOutcome={outcome}
          trackingLocation="election map race"
          questionPseudonym={race.label}
          binaryPseudonym={pseudonym}
        />
      )}
    </>
  )
}

// A district's party question inside a "Which districts will Democrats
// win?" portfolio: YES is the Democrat, NO everyone else.
export function DistrictOutcomes(props: {
  contract: CPMMMultiContract
  answer: Answer
  race: Race
}) {
  const { contract, answer, race } = props
  const [outcome, setOutcome] = useState<'YES' | 'NO'>()
  const dem = getAnswerProbability(contract, answer.id)
  const noIsRep = complementParty('house', race.id, 'D') === 'R'
  const rows = districtRows(dem, race)
  const closed = !isOpen(contract) || !!answer.resolution
  return (
    <>
      <OutcomeList
        rows={rows}
        raceLabel={race.label}
        canBet={() => !closed}
        onBet={(row) => setOutcome(row.key === 'YES' ? 'YES' : 'NO')}
      />
      <p className={styles.note}>
        {closed
          ? 'Trading has closed for this district.'
          : noIsRep
          ? 'This market asks whether a Democrat wins. Betting Republican buys No.'
          : 'This market asks whether a Democrat wins. No means any other winner.'}
      </p>
      {outcome && (
        <Modal
          open
          setOpen={(open) => !open && setOutcome(undefined)}
          ariaLabel={`Bet on ${race.label}`}
          className={`${MODAL_CLASS} ${SCROLLABLE_MODAL_CLASS}`}
        >
          <h2 className="mb-2 text-xl font-semibold">{race.label}</h2>
          <p className="text-ink-600 mb-4 text-sm">
            Will a Democrat win this district? Yes = Democratic; No = any other
            winner{noIsRep ? ', in practice the Republican' : ''}.
          </p>
          <AnswerCpmmBetPanel
            answer={answer}
            contract={contract}
            outcome={outcome}
            closePanel={() => setOutcome(undefined)}
            alwaysShowOutcomeSwitcher
            pseudonym={{
              YES: { pseudonymName: 'Democratic', pseudonymColor: 'azure' },
              NO: noIsRep
                ? { pseudonymName: 'Republican', pseudonymColor: 'sienna' }
                : { pseudonymName: 'Any other winner', pseudonymColor: 'gray' },
            }}
          />
        </Modal>
      )}
    </>
  )
}

function OutcomeList(props: {
  rows: OutcomeRow[]
  raceLabel: string
  canBet: (row: OutcomeRow) => boolean
  onBet: (row: OutcomeRow) => void
  extra?: (row: OutcomeRow) => ReactNode
}) {
  const { rows, raceLabel, canBet, onBet, extra } = props
  const [expanded, setExpanded] = useState(false)
  const { shown, folded } = arrangeOutcomes(rows)
  const visible = expanded ? [...shown, ...folded] : shown
  return (
    <div className={styles.outcomes}>
      {visible.map((row) => {
        const name = row.subtitle ? `${row.label}, ${row.subtitle}` : row.label
        return (
          <div
            key={row.key}
            className={styles.outcome}
            data-party={partyTone(row.party)}
          >
            <span className={styles.outcomeName}>
              <span>{row.label}</span>
              {row.subtitle && <small>{row.subtitle}</small>}
              {extra?.(row)}
            </span>
            <strong className={styles.outcomeProb}>
              {formatOdds(row.prob)}
            </strong>
            {canBet(row) ? (
              <Button
                size="2xs"
                color="indigo-outline"
                className="bg-primary-50"
                aria-label={`Bet ${name}, ${raceLabel}`}
                aria-haspopup="dialog"
                onClick={(e) => {
                  e.stopPropagation()
                  track('bet intent', { location: 'election map race' })
                  onBet(row)
                }}
              >
                {capitalize(TRADE_TERM)}
              </Button>
            ) : (
              <span />
            )}
            <span className={styles.outcomeTrack} aria-hidden>
              <i
                style={{
                  width: `${Math.min(1, Math.max(0, row.prob)) * 100}%`,
                }}
              />
            </span>
          </div>
        )
      })}
      {folded.length > 0 && (
        <button
          className={styles.moreOutcomes}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded
            ? 'Show fewer'
            : `+${folded.length} more under 1% (not on the ballot)`}
        </button>
      )}
    </div>
  )
}
