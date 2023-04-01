import { StarIcon, ClockIcon, UserIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { ContractMetrics } from 'common/calculate-metrics'
import { Contract, contractPath, CPMMBinaryContract } from 'common/contract'
import { ContractCardView } from 'common/events'
import { formatMoney } from 'common/util/format'
import { DAY_MS } from 'common/util/time'
import Router from 'next/router'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { ContractStatusLabel } from 'web/components/contract/contracts-list-entry'
import { LikeButton } from 'web/components/contract/like-button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { CommentsButton } from 'web/components/swipe/swipe-comments'
import { Input } from 'web/components/widgets/input'
import { Title } from 'web/components/widgets/title'
import { Tooltip } from 'web/components/widgets/tooltip'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { useUser } from 'web/hooks/use-user'
import { createDebate } from 'web/lib/firebase/api'
import { listGroupContracts } from 'web/lib/firebase/groups'
import { track } from 'web/lib/service/analytics'
import { fromNow } from 'web/lib/util/time'
import { Row } from 'web/components/layout/row'
import { useContract } from 'web/hooks/use-contracts'
import { binaryOutcomes } from 'web/components/bet/bet-panel'
import { firebaseLogin } from 'web/lib/firebase/users'
import { BetDialog } from 'web/components/bet/bet-dialog'
import { getProbability } from 'common/calculate'

export const getStaticProps = async () => {
  const debateGroupId = '0i8ozKhPq5qJ89DG9tCW'
  const contracts = await listGroupContracts(debateGroupId)
  return {
    props: {
      contracts,
    },
  }
}

const Debate = (props: { contracts: Contract[] }) => {
  const { contracts } = props
  return (
    <Page>
      <SEO
        title="Debate"
        description="Debate the big questions"
        url="/debate"
      />
      <Col className="w-full max-w-xl self-center">
        <Title>Manifold Debate</Title>
        <Debates contracts={contracts} />
        <div className="my-6 border-t-2" />
        <CreateDebateWidget />
      </Col>
    </Page>
  )
}

const Debates = (props: { contracts: Contract[] }) => {
  const { contracts } = props
  return (
    <Col>
      {contracts.map((contract) => (
        <ContractCardDebate key={contract.id} contract={contract} />
      ))}
    </Col>
  )
}

const CreateDebateWidget = () => {
  const [topic1, setTopic1] = useState<string>('')
  const [topic2, setTopic2] = useState<string>('')

  const isValid = topic1 && topic2

  const onCreate = () => {
    if (isValid)
      createDebate({ topic1, topic2 }).then((data) => {
        console.log('hello, market created', data)
        window.location.reload()
      })
  }

  return (
    <Col>
      <div className="mb-6 text-2xl">Create a debate</div>

      <Col className="max-w-[200px] gap-4">
        <Col>
          <label className="px-1 pb-3">
            Topic 1 <span className={'text-scarlet-500 text-sm'}>*</span>
          </label>

          <Input
            placeholder="e.g. Elon Musk"
            autoFocus
            maxLength={140}
            value={topic1}
            onChange={(e) => setTopic1(e.target.value ?? '')}
          />
        </Col>
        <div className="self-center text-xl">vs.</div>
        <Col>
          <label className="px-1 pb-3">
            Topic 2 <span className={'text-scarlet-500 text-sm'}>*</span>
          </label>
          <Input
            placeholder="e.g. Bill Gates"
            autoFocus
            maxLength={140}
            value={topic2}
            onChange={(e) => setTopic2(e.target.value ?? '')}
          />
        </Col>

        <Col className="mt-6 gap-2">
          <div>Cost: {formatMoney(50)}</div>
          <div>Duration: 1 hour</div>
        </Col>
        <Button onClick={onCreate} disabled={!isValid}>
          Start debate
        </Button>
      </Col>
    </Col>
  )
}

export default Debate

function ContractCardDebate(props: { contract: Contract; className?: string }) {
  const { className } = props
  const user = useUser()

  const contract = useContract(props.contract.id) ?? props.contract
  const { question, coverImageUrl, outcomeType, mechanism } = contract

  const metrics = useSavedContractMetrics(contract)

  const { ref } = useIsVisible(
    () =>
      track('view market card', {
        contractId: contract.id,
        creatorId: contract.creatorId,
        slug: contract.slug,
      } as ContractCardView),
    true
  )

  const isBinaryCpmm = outcomeType === 'BINARY' && mechanism === 'cpmm-1'
  const showImage = !!coverImageUrl

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
          'gap-2 py-2 px-4 backdrop-blur-sm'
        )}
      >
        <Row className="text-ink-500 items-center gap-3 overflow-hidden text-sm">
          <ReasonChosen contract={contract} />
        </Row>

        <BetRow
          contract={contract as CPMMBinaryContract}
          noUser={!user}
          topic1={topic1 ?? 'YES'}
          topic2={topic2 ?? 'NO'}
        />

        <Row ref={ref} className="text-ink-500 items-center gap-3 text-sm">
          {isBinaryCpmm && metrics && metrics.hasShares && (
            <YourMetricsFooter metrics={metrics} />
          )}

          <Row
            className="ml-auto items-center gap-1"
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
      </Col>
    </div>
  )
}

function ReasonChosen(props: { contract: Contract }) {
  const { contract } = props
  const { createdTime, closeTime, uniqueBettorCount } = contract

  const now = Date.now()
  const reason =
    createdTime > now - DAY_MS
      ? 'New'
      : closeTime && closeTime < now + DAY_MS
      ? 'Closing soon'
      : !uniqueBettorCount || uniqueBettorCount <= 5
      ? 'For you'
      : 'Trending'

  return (
    <Row className="gap-3">
      <div className="flex items-center gap-1">
        {reason}
        {reason === 'New' && <StarIcon className="h-4 w-4" />}
      </div>
      <Row className="shrink-0 items-center gap-1 whitespace-nowrap">
        {reason === 'Closing soon' && (
          <>
            <ClockIcon className="h-4 w-4" />
            {fromNow(closeTime || 0)}
          </>
        )}
        {reason === 'New' && fromNow(createdTime)}
        {reason === 'Trending' && (
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
        )}
      </Row>
    </Row>
  )
}

function YourMetricsFooter(props: { metrics: ContractMetrics }) {
  const { metrics } = props
  const { totalShares, maxSharesOutcome, profit } = metrics
  const { YES: yesShares, NO: noShares } = totalShares

  return (
    <Row className="border-ink-200 items-center gap-4 rounded border p-2 text-sm">
      <Row className="items-center gap-2">
        <span className="text-ink-500">Payout on {maxSharesOutcome}</span>
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
    <Row className="relative w-full items-center rounded-lg border border-gray-200">
      <div
        className={clsx(
          'absolute -z-10 h-full rounded-l-lg bg-green-200 transition-all'
        )}
        style={{ width: `${100 * prob}%` }}
        aria-hidden
      />
      <div
        className={clsx(
          'absolute right-0 -z-10 h-full rounded-r-lg bg-red-200 transition-all'
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
            Bet
            <div className="whitespace-nowrap">{topic1}</div>
          </Col>
        </Button>
        <Col className="items-center text-base font-semibold">
          <ContractStatusLabel contract={contract} />
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
            Bet
            <div className="whitespace-nowrap">{topic2}</div>
          </Col>
        </Button>
      </Row>

      <BetDialog
        contract={contract}
        initialOutcome={outcome}
        open={betDialogOpen}
        setOpen={setBetDialogOpen}
      />
    </Row>
  )
}
