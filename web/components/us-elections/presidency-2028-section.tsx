import { ChevronDownIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { useState } from 'react'
import { Answer } from 'common/answer'
import { getAnswerProbability } from 'common/calculate'
import {
  Contract,
  CPMMMultiContract,
  MultiContract,
  contractPath,
} from 'common/contract'
import { formatPercent } from 'common/util/format'
import { sortBy } from 'lodash'
import Image from 'next/image'
import Link from 'next/link'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import {
  Modal,
  MODAL_CLASS,
  SCROLLABLE_MODAL_CLASS,
} from 'web/components/layout/modal'
import { AnswerCpmmBetPanel } from 'web/components/answers/answer-bet-panel'
import { useLiveContract } from 'web/hooks/use-contract'
import { track } from 'web/lib/service/analytics'
import { CandidatePanel } from './contracts/candidates-panel/candidates-panel'
import { removeTextInParentheses } from './contracts/candidates-panel/candidate-bar'
import {
  CANDIDATE_DATA,
  CandidateDataType,
} from './ candidates/candidate-data'
import {
  DEM_COLOR,
  REP_COLOR,
  getPartyProbs,
  isDemocraticAnswer,
  isRepublicanAnswer,
} from 'web/components/usa-map/state-election-map'

const DEM_LOGO = '/politics-party/democrat_symbol.png'
const REP_LOGO = '/politics-party/republican_symbol.png'

const EXCLUDED_ANSWERS = ['No 2028 Election']

// The 2028 presidential field, sitting above the midterms content. Collapsible
// so it can step out of the way — when collapsed it still shows the leading
// Democrat and Republican as a one-line summary.
export function Presidency2028Section(props: { contract: Contract }) {
  const contract = useLiveContract(props.contract)
  const [expanded, setExpanded] = usePersistentInMemoryState(
    true,
    'expand-2028-presidency'
  )

  const leaders = getPartyLeaders(contract)

  return (
    <Col className="gap-1.5">
      <Row className="items-center justify-between gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="group flex min-w-0 items-center gap-1.5 text-left"
        >
          <ChevronDownIcon
            className={clsx(
              'text-ink-400 group-hover:text-ink-700 h-5 w-5 shrink-0 transition-transform',
              !expanded && '-rotate-90'
            )}
          />
          <span className="group-hover:text-primary-700 truncate font-semibold transition-colors sm:text-lg">
            Who will be president in 2028?
          </span>
        </button>
        {!expanded && leaders.length > 0 && (
          <Row className="shrink-0 items-center gap-3">
            {leaders.map((l) => (
              <LeaderChip key={l.text} {...l} />
            ))}
          </Row>
        )}
      </Row>
      {expanded && (
        <CandidatePanel
          contract={contract as MultiContract}
          maxAnswers={8}
          excludeAnswers={EXCLUDED_ANSWERS}
        />
      )}
    </Col>
  )
}

type Leader = { text: string; prob: number; data?: CandidateDataType }

// Highest-probability Democrat and Republican, ordered by probability, for the
// collapsed summary. Returns [] for non-multi markets.
function getPartyLeaders(contract: Contract): Leader[] {
  if (contract.outcomeType !== 'MULTIPLE_CHOICE') return []
  const answers: Leader[] = (contract as MultiContract).answers
    .filter((a) => a.text !== 'Other' && !EXCLUDED_ANSWERS.includes(a.text))
    .map((a) => ({
      text: a.text,
      prob: getAnswerProbability(contract, a.id),
      data: CANDIDATE_DATA[removeTextInParentheses(a.text).trim()] as
        | CandidateDataType
        | undefined,
    }))
  const byProb = sortBy(answers, (a) => -a.prob)
  const dem = byProb.find((a) => a.data?.party === 'Democrat')
  const rep = byProb.find((a) => a.data?.party === 'Republican')
  const leaders = [dem, rep].filter((x) => !!x) as Leader[]
  return sortBy(leaders, (a) => -a.prob)
}

function LeaderChip(props: Leader) {
  const { text, prob, data } = props
  const color = data?.party === 'Democrat' ? DEM_COLOR : REP_COLOR
  return (
    <Row className="items-center gap-1.5">
      {data?.photo && (
        <Image
          src={data.photo}
          alt=""
          width={24}
          height={24}
          className="border-ink-200 bg-canvas-50 h-6 w-6 rounded-full border object-cover"
        />
      )}
      <span className="text-ink-700 hidden text-sm font-medium sm:inline">
        {data?.shortName ?? removeTextInParentheses(text)}
      </span>
      <span className="text-sm font-bold" style={{ color }}>
        {formatPercent(prob)}
      </span>
    </Row>
  )
}

// The 2028 presidency as a Democrat-vs-Republican head-to-head: party logos
// left/right, a split bar, and one-tap betting on either side. Party odds come
// from the community "which party wins" market (tolerant of varied labels).
export function PresidencyPartyBar(props: { contract: Contract }) {
  const contract = useLiveContract(props.contract)
  const [betAnswer, setBetAnswer] = useState<Answer | undefined>()

  const probs = getPartyProbs(contract)
  if (!probs || contract.mechanism !== 'cpmm-multi-1') return null

  const { dem, rep, other } = probs
  const demAnswer = contract.answers.find((a) => isDemocraticAnswer(a.text))
  const repAnswer = contract.answers.find((a) => isRepublicanAnswer(a.text))
  const otherAnswer = contract.answers.find(
    (a) => !isDemocraticAnswer(a.text) && !isRepublicanAnswer(a.text)
  )

  const openBet = (answer?: Answer) => {
    if (!answer) return
    track('bet intent', { location: '2028 party bar' })
    setBetAnswer(answer)
  }

  return (
    <Col className="bg-canvas-0 gap-2 rounded-xl p-3 sm:p-4">
      <Row className="items-center justify-between">
        <span className="text-ink-700 font-medium">
          Which party wins the presidency in 2028?
        </span>
        <Link
          href={contractPath(contract)}
          className="text-ink-400 hover:text-primary-600 text-xs hover:underline"
        >
          chart →
        </Link>
      </Row>

      <Row className="items-center justify-between gap-2">
        <Row className="items-center gap-2">
          <Image
            src={DEM_LOGO}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
          <span
            className="text-2xl font-bold leading-none sm:text-3xl"
            style={{ color: DEM_COLOR }}
          >
            {formatPercent(dem)}
          </span>
          <span className="text-ink-600 hidden text-sm sm:inline">
            Democratic
          </span>
        </Row>
        <Row className="items-center gap-2">
          <span className="text-ink-600 hidden text-sm sm:inline">
            Republican
          </span>
          <span
            className="text-2xl font-bold leading-none sm:text-3xl"
            style={{ color: REP_COLOR }}
          >
            {formatPercent(rep)}
          </span>
          <Image
            src={REP_LOGO}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
        </Row>
      </Row>

      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        <div style={{ width: `${dem * 100}%`, backgroundColor: DEM_COLOR }} />
        <div style={{ width: `${other * 100}%`, backgroundColor: '#9ca3af' }} />
        <div style={{ width: `${rep * 100}%`, backgroundColor: REP_COLOR }} />
      </div>

      <Row className="mt-1 items-stretch gap-2">
        <PartyBetButton
          label="Bet Democratic"
          color={DEM_COLOR}
          disabled={!demAnswer}
          onClick={() => openBet(demAnswer)}
        />
        {otherAnswer && (
          <button
            onClick={() => openBet(otherAnswer)}
            className="hover:bg-canvas-100 text-ink-500 border-ink-300 shrink-0 rounded-md border px-3 text-sm font-semibold transition-colors"
          >
            Other {formatPercent(other)}
          </button>
        )}
        <PartyBetButton
          label="Bet Republican"
          color={REP_COLOR}
          disabled={!repAnswer}
          onClick={() => openBet(repAnswer)}
        />
      </Row>

      <Modal
        open={betAnswer != undefined}
        setOpen={(open) => !open && setBetAnswer(undefined)}
        className={clsx(MODAL_CLASS, SCROLLABLE_MODAL_CLASS)}
      >
        {betAnswer && (
          <AnswerCpmmBetPanel
            answer={betAnswer}
            contract={contract as CPMMMultiContract}
            outcome="YES"
            closePanel={() => setBetAnswer(undefined)}
            alwaysShowOutcomeSwitcher
          />
        )}
      </Modal>
    </Col>
  )
}

function PartyBetButton(props: {
  label: string
  color: string
  disabled?: boolean
  onClick: () => void
}) {
  const { label, color, disabled, onClick } = props
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="hover:bg-canvas-100 flex-1 rounded-md border py-1.5 text-sm font-semibold transition-colors disabled:opacity-50"
      style={{ color, borderColor: color + '66' }}
    >
      {label}
    </button>
  )
}
