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

// The whole 2028 presidential outlook in one collapsible card. Collapsed (the
// default) it's a neat one-liner: the title plus the leading Democrat and
// Republican. Expanded it reveals the party split (Dem-vs-Rep, with betting)
// and the full candidate field.
export function Presidency2028Section(props: {
  contract: Contract
  partyContract: Contract | null
}) {
  const contract = useLiveContract(props.contract)
  const [expanded, setExpanded] = usePersistentInMemoryState(
    false,
    'expand-2028-presidency'
  )

  const leaders = getPartyLeaders(contract)
  const partyProbs = getPartyProbs(props.partyContract)

  return (
    <Col className="bg-canvas-0 overflow-hidden rounded-xl">
      <button
        onClick={() => setExpanded(!expanded)}
        className="hover:bg-canvas-50 group flex flex-col gap-2 px-4 py-3 text-left transition-colors sm:flex-row sm:items-center sm:justify-between"
      >
        <Row className="min-w-0 items-center gap-1.5">
          <ChevronDownIcon
            className={clsx(
              'text-ink-400 group-hover:text-ink-700 h-5 w-5 shrink-0 transition-transform',
              !expanded && '-rotate-90'
            )}
          />
          <span className="group-hover:text-primary-700 truncate font-semibold transition-colors sm:text-lg">
            Who will be president in 2028?
          </span>
        </Row>
        {!expanded && (
          <Row className="ml-[26px] flex-wrap items-center gap-x-4 gap-y-1.5 sm:ml-0">
            {partyProbs && (
              <PartyMiniPreview dem={partyProbs.dem} rep={partyProbs.rep} />
            )}
            {leaders.map((l) => (
              <LeaderChip key={l.text} {...l} />
            ))}
          </Row>
        )}
      </button>
      {expanded && (
        <Col className="border-ink-200 gap-3 border-t px-4 py-4">
          {props.partyContract && (
            <PresidencyPartyBar contract={props.partyContract} />
          )}
          <div className="border-ink-200 border-t" />
          <Col className="gap-1.5">
            <Row className="items-center justify-between">
              <span className="text-ink-500 text-xs font-semibold uppercase tracking-wide">
                By candidate
              </span>
              <Link
                href={`${contractPath(contract)}?graph=true`}
                className="text-ink-400 hover:text-primary-600 text-xs hover:underline"
              >
                chart →
              </Link>
            </Row>
            <CandidatePanel
              contract={contract as MultiContract}
              maxAnswers={8}
              excludeAnswers={EXCLUDED_ANSWERS}
            />
          </Col>
        </Col>
      )}
    </Col>
  )
}

// Compact Dem-vs-Rep split for the collapsed header — the party-level companion
// to the candidate face chips.
function PartyMiniPreview(props: { dem: number; rep: number }) {
  const { dem, rep } = props
  const denom = dem + rep || 1
  return (
    <Row className="items-center gap-1.5">
      <span className="text-sm font-bold" style={{ color: DEM_COLOR }}>
        {formatPercent(dem)}
      </span>
      <div className="flex h-1.5 w-10 overflow-hidden rounded-full">
        <div style={{ width: `${(dem / denom) * 100}%`, backgroundColor: DEM_COLOR }} />
        <div style={{ width: `${(rep / denom) * 100}%`, backgroundColor: REP_COLOR }} />
      </div>
      <span className="text-sm font-bold" style={{ color: REP_COLOR }}>
        {formatPercent(rep)}
      </span>
    </Row>
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
// Rendered inset inside the collapsible 2028 card.
function PresidencyPartyBar(props: { contract: Contract }) {
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
    <Col className="gap-2">
      <Row className="items-center justify-between">
        <span className="text-ink-500 text-xs font-semibold uppercase tracking-wide">
          By party
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
