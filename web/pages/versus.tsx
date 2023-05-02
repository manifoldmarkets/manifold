import { ClockIcon, UserIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { sortBy } from 'lodash'
import Router from 'next/router'

import { ExclamationIcon } from '@heroicons/react/outline'
import { getDisplayProbability, getProbability } from 'common/calculate'
import { ContractMetrics } from 'common/calculate-metrics'
import { Contract, contractPath, CPMMBinaryContract } from 'common/contract'
import { ContractCardView } from 'common/events'
import { filterDefined } from 'common/util/array'
import { formatMoney, formatPercentShort } from 'common/util/format'
import { MINUTE_MS } from 'common/util/time'
import { useEffect, useState } from 'react'
import { BetDialog } from 'web/components/bet/bet-dialog'
import { binaryOutcomes } from 'web/components/bet/bet-panel'
import { Button } from 'web/components/buttons/button'
import { LikeButton } from 'web/components/contract/like-button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { SEO } from 'web/components/SEO'
import { CommentsButton } from 'web/components/swipe/swipe-comments'
import { Input } from 'web/components/widgets/input'
import { Title } from 'web/components/widgets/title'
import { Tooltip } from 'web/components/widgets/tooltip'
import {
  useContracts,
  useRealtimeContract,
} from 'web/hooks/use-contract-supabase'
import { useGroupContractIds } from 'web/hooks/use-group'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { useUser } from 'web/hooks/use-user'
import { createDebate } from 'web/lib/firebase/api'
import { listGroupContracts } from 'web/lib/firebase/groups'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'

const debateGroupId = '0i8ozKhPq5qJ89DG9tCW'

export const getStaticProps = async () => {
  const contracts = await listGroupContracts(debateGroupId)
  const openContracts = contracts.filter(
    (contract) => contract.isResolved === false
  )
  return {
    props: {
      contracts: openContracts,
    },
  }
}

const Versus = (props: { contracts: Contract[] }) => {
  const contractIds = useGroupContractIds(debateGroupId)
  const loadedContracts = filterDefined(useContracts(contractIds))
  const contracts =
    loadedContracts.length >= props.contracts.length
      ? loadedContracts
      : props.contracts

  const openContracts = contracts.filter(
    (contract) =>
      contract.isResolved === false &&
      contract.closeTime &&
      contract.closeTime > Date.now()
  )
  const sortedContracts = sortBy(openContracts, (c) => c.createdTime).reverse()

  const [_, setCount] = useState(0)
  useEffect(() => {
    const intervalId = setInterval(() => setCount((c) => c + 1), MINUTE_MS)
    return clearInterval(intervalId)
  }, [])

  return (
    <Page>
      <SEO title="Versus" description="Battle with mana." url="/versus" />
      <Col className="w-full max-w-xl self-center">
        <Title className="text-ink-800 mt-4 ml-6">⚔️ Versus ⚔️</Title>
        <VersusCards contracts={sortedContracts} />
        <CreateVersusWidget className="mt-8" />
      </Col>
    </Page>
  )
}

const VersusCards = (props: { contracts: Contract[] }) => {
  const { contracts } = props
  return (
    <Col>
      {contracts.map((contract) => (
        <ContractCardVersus key={contract.id} contract={contract} />
      ))}
    </Col>
  )
}

const CreateVersusWidget = (props: { className?: string }) => {
  const { className } = props
  const [topic1, setTopic1] = useState<string>('')
  const [topic2, setTopic2] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)

  const isValid = topic1 && topic2

  const onCreate = () => {
    if (isValid) setIsLoading(true)
    createDebate({ topic1, topic2 }).then((data) => {
      console.log('hello, market created', data)
      setIsLoading(false)
      setTopic1('')
      setTopic2('')
      window.scrollTo(0, 0)
    })
  }

  return (
    <Col className={clsx(className, 'w-full rounded-lg border px-6 py-6')}>
      <Col className="text-ink-800 w-full max-w-[275px] gap-4 self-center ">
        <div className="mb-2 text-2xl">
          <ExclamationIcon className="mr-2 inline-block h-7 w-7" />
          Create your battle
        </div>

        <Col>
          <label className="px-1 pb-3">
            Player 1 <span className={'text-scarlet-500 text-sm'}>*</span>
          </label>

          <Input
            placeholder="e.g. Trump"
            maxLength={140}
            value={topic1}
            onChange={(e) => setTopic1(e.target.value ?? '')}
          />
        </Col>
        <div className="self-center text-xl">vs.</div>
        <Col>
          <label className="px-1 pb-3">
            Player 2 <span className={'text-scarlet-500 text-sm'}>*</span>
          </label>
          <Input
            placeholder="e.g. Biden"
            maxLength={140}
            value={topic2}
            onChange={(e) => setTopic2(e.target.value ?? '')}
          />
        </Col>

        <Col className="mt-4 gap-2">
          <div>Cost: {formatMoney(20)}</div>
          <div>At a random time within 24h, resolves to currrent market %.</div>
        </Col>

        <Button
          className="mt-4"
          onClick={onCreate}
          disabled={!isValid}
          loading={isLoading}
        >
          Start battle
        </Button>
      </Col>
    </Col>
  )
}

export default Versus

function ContractCardVersus(props: { contract: Contract; className?: string }) {
  const { className } = props
  const user = useUser()

  const contract = useRealtimeContract(props.contract.id) ?? props.contract
  const {
    question,
    coverImageUrl,
    outcomeType,
    mechanism,
    closeTime,
    uniqueBettorCount,
  } = contract

  const metrics = useSavedContractMetrics(contract)

  const { ref } = useIsVisible(
    () =>
      track('view versus card', {
        contractId: contract.id,
        creatorId: contract.creatorId,
        slug: contract.slug,
      } as ContractCardView),
    true
  )

  const isBinaryCpmm = outcomeType === 'BINARY' && mechanism === 'cpmm-1'
  const showImage = !!coverImageUrl
  const minutesRemaining = Math.max(
    Math.ceil(((closeTime ?? 1000) - Date.now()) / MINUTE_MS),
    0
  )

  const path = contractPath(contract)

  const [topic1, topic2] = question.split(' vs ')
  return (
    <div
      className={clsx(
        'relative',
        'border-ink-300 group my-2 flex cursor-pointer flex-col overflow-hidden rounded-xl border-[0.5px]',
        'focus:bg-ink-400/20 lg:hover:bg-ink-400/20 outline-none transition-colors',
        className
      )}
      // we have other links inside this card like the username, so can't make the whole card a button or link
      tabIndex={-1}
      onClick={(e) => {
        Router.push(path)
        e.currentTarget.focus() // focus the div like a button, for style
      }}
    >
      <Col
        className={clsx(
          showImage ? 'bg-canvas-0/95' : 'bg-canvas-0/70',
          'gap-2 px-0 pb-2 backdrop-blur-sm'
        )}
      >
        <BetRow
          contract={contract as CPMMBinaryContract}
          noUser={!user}
          topic1={topic1 ?? 'YES'}
          topic2={topic2 ?? 'NO'}
        />

        <Row
          ref={ref}
          className="text-ink-500 items-center justify-between gap-4 overflow-hidden px-4 text-sm"
        >
          <Tooltip
            text={`${uniqueBettorCount ?? 0} unique traders`}
            placement="bottom"
            className={'z-10'}
          >
            <Row className={'shrink-0 items-center gap-1'}>
              <UserIcon className="h-4 w-4" />
              <div>{uniqueBettorCount ?? 0}</div>
            </Row>
          </Tooltip>

          <Row className="items-center gap-2">
            <ClockIcon className="h-4 w-4" />
            Resolves within {Math.ceil(minutesRemaining / 60)} hours
          </Row>

          <Row
            className="items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1.5 p-1">
              <LikeButton
                contentId={contract.id}
                contentCreatorId={contract.creatorId}
                user={user}
                contentType={'contract'}
                totalLikes={contract.likedByUserCount ?? 0}
                contract={contract}
                contentText={question}
                showTotalLikesUnder
                size="md"
                color="gray"
                className="!px-0"
              />
            </div>

            <CommentsButton contract={contract} user={user} />
          </Row>
        </Row>

        {isBinaryCpmm && metrics && metrics.hasShares && (
          <Row className="w-full px-4">
            <YourMetricsFooter metrics={metrics} />
          </Row>
        )}
      </Col>
    </div>
  )
}

function YourMetricsFooter(props: { metrics: ContractMetrics }) {
  const { metrics } = props
  const { totalShares, maxSharesOutcome, profit } = metrics
  const { YES: yesShares, NO: noShares } = totalShares

  return (
    <Row className="border-ink-200 w-full items-center gap-4 rounded border p-2 text-sm">
      <Row className="items-center gap-2">
        <span className="text-ink-500">
          Payout at {maxSharesOutcome === 'YES' ? '100%' : '0%'}:
        </span>
        <span className="text-ink-600 font-semibold">
          {maxSharesOutcome === 'YES'
            ? formatMoney(yesShares)
            : formatMoney(noShares)}{' '}
        </span>
      </Row>
      <Row className="ml-auto items-center gap-2">
        <div className="text-ink-500">Profit </div>
        <div className={clsx('text-ink-600 font-semibold')}>
          {profit ? formatMoney(profit) : '--'}
        </div>
      </Row>
    </Row>
  )
}

function BetRow(props: {
  contract: CPMMBinaryContract
  topic1: string
  topic2: string
  noUser?: boolean
}) {
  const { contract, topic1, topic2, noUser } = props
  const [outcome, setOutcome] = useState<binaryOutcomes>()
  const [betDialogOpen, setBetDialogOpen] = useState(false)

  const prob = getProbability(contract)

  return (
    <Row className="relative w-full items-center rounded-lg">
      <div
        className={clsx(
          'absolute -z-10 h-full rounded-tl-lg bg-green-200 transition-all'
        )}
        style={{ width: `${100 * prob}%` }}
        aria-hidden
      />
      <div
        className={clsx(
          'absolute right-0 -z-10 h-full rounded-tr-lg bg-red-200 transition-all'
        )}
        style={{ width: `${100 * (1 - prob)}%` }}
        aria-hidden
      />
      <Row className="w-full items-center justify-between p-4">
        <Button
          className="min-w-[100px] shadow"
          size="lg"
          color="green"
          onClick={(e) => {
            e.stopPropagation()
            if (noUser) {
              firebaseLogin()
              return
            }
            setOutcome('YES')
            setBetDialogOpen(true)
          }}
        >
          <Col>
            Bet on
            <div className="whitespace-nowrap">{topic1}</div>
          </Col>
        </Button>
        <Col className="items-center text-xl font-semibold text-gray-800">
          {formatPercentShort(getDisplayProbability(contract))}
        </Col>
        <Button
          className="min-w-[100px] shadow"
          size="lg"
          color="red"
          onClick={(e) => {
            e.stopPropagation()
            if (noUser) {
              firebaseLogin()
              return
            }
            setOutcome('NO')
            setBetDialogOpen(true)
          }}
        >
          <Col>
            Bet on
            <div className="whitespace-nowrap">{topic2}</div>
          </Col>
        </Button>
      </Row>

      <BetDialog
        contract={contract}
        initialOutcome={outcome}
        open={betDialogOpen}
        setOpen={setBetDialogOpen}
        trackingLocation="versus card"
      />
    </Row>
  )
}
