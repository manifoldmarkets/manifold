import { track } from '@amplitude/analytics-browser'
import { MinusIcon, PlusIcon } from '@heroicons/react/solid'
import clsx from 'clsx'

import { getOutcomeProbabilityAfterBet } from 'common/calculate'
import { BinaryContract, Contract } from 'common/contract'
import { getBinaryProb } from 'common/contract-details'
import { formatMoney, formatPercent } from 'common/util/format'
import { richTextToString } from 'common/util/parse'
import { memo } from 'react'
import toast from 'react-hot-toast'
import {
  usePersistentState,
  inMemoryStore,
} from 'web/hooks/use-persistent-state'
import { useUser } from 'web/hooks/use-user'
import { placeBet } from 'web/lib/firebase/api'
import { contractPath } from 'web/lib/firebase/contracts'
import { logView } from 'web/lib/firebase/views'
import { fromNow } from 'web/lib/util/time'
import { Col } from '../layout/col'
import { Avatar } from '../widgets/avatar'
import { SiteLink } from '../widgets/site-link'
import { VisibilityObserver } from '../widgets/visibility-observer'
import { Row } from '../layout/row'

const betTapAdd = 10

export const SwipeCard = memo(
  (props: {
    contract: BinaryContract
    amount: number
    setAmount: (amount: number) => void
    onView: (contract: BinaryContract, alreadyViewed: boolean) => void
  }) => {
    const { contract, amount, setAmount, onView } = props
    const { question, description, coverImageUrl, id: contractId } = contract

    const [isViewed, setIsViewed] = usePersistentState(false, {
      key: contract.id + '-viewed',
      store: inMemoryStore(),
    })

    const userId = useUser()?.id

    const addMoney = () => setAmount(amount + betTapAdd)

    const subMoney = () => {
      if (amount <= betTapAdd) {
      } else {
        setAmount(amount - betTapAdd)
      }
    }

    const image =
      coverImageUrl ??
      `https://picsum.photos/id/${parseInt(contract.id, 36) % 1000}/512`

    const onClickBet = (outcome: 'YES' | 'NO') => {
      const promise = placeBet({ amount, outcome, contractId })

      const shortQ = contract.question.slice(0, 20)

      const message = `Bet ${formatMoney(amount)} ${outcome} on "${shortQ}"...`

      toast.promise(
        promise,
        {
          loading: message,
          success: message,
          error: (err) => `Error placing bet: ${err.message}`,
        },
        { position: 'top-center' }
      )

      userId && logView({ amount, outcome, contractId, userId })
      track('scroll bet', {
        slug: contract.slug,
        contractId,
        amount,
        outcome,
      })
    }

    return (
      <Col
        className={clsx('relative h-full snap-start snap-always')}
        id={contract.id}
      >
        {/* background */}
        <div className="flex h-full flex-col bg-black">
          <div className="relative mb-24 grow">
            <img
              src={image}
              alt=""
              className="h-full object-cover"
              style={{ filter: 'brightness(0.60)' }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent" />
          </div>
        </div>

        {/* content */}
        <div className="absolute inset-0 flex select-none flex-col gap-4">
          <CornerDetails contract={contract} />
          <SiteLink
            className="line-clamp-6 mx-8 mt-auto mb-4 text-2xl text-white"
            href={contractPath(contract)}
            followsLinkClass
          >
            {question}
          </SiteLink>
          <Percent contract={contract} amount={amount} outcome={undefined} />
          {/* TODO: use editor excluding widgets */}
          <div className="prose prose-invert prose-sm line-clamp-3 mx-8 mb-2 text-gray-50">
            {typeof description === 'string'
              ? description
              : richTextToString(description)}
          </div>

          <Row className="gap-4 px-8">
            <button
              className={clsx(
                'hover:bg-teal-600-focus hover:border-teal-600-focus inline-flex flex-1 items-center justify-center rounded-lg border-2 border-teal-600 p-2 hover:text-white',
                'bg-transparent text-lg text-teal-500 active:bg-teal-600'
              )}
              onClick={() => onClickBet('YES')}
            >
              Bet YES
            </button>
            <button
              className={clsx(
                'hover:bg-teal-600-focus hover:border-teal-600-focus border-scarlet-300 inline-flex flex-1 items-center justify-center rounded-lg border-2 p-2 hover:text-white',
                'text-scarlet-300 active:bg-scarlet-400 bg-transparent text-lg'
              )}
              onClick={() => onClickBet('NO')}
            >
              Bet NO
            </button>
          </Row>

          <div className="mb-4 flex flex-col items-center gap-2 self-center">
            <span className="flex overflow-hidden rounded-full border  border-yellow-400 text-yellow-300">
              <button
                onClick={subMoney}
                onTouchStart={subMoney}
                className="pl-5 pr-4 transition-colors focus:bg-yellow-200/20 active:bg-yellow-400 active:text-white"
              >
                <MinusIcon className="h-4" />
              </button>
              <span className="mx-1 py-4">{formatMoney(amount)}</span>
              <button
                onClick={addMoney}
                onTouchStart={addMoney}
                className="pl-4 pr-5 transition-colors focus:bg-yellow-200/20 active:bg-yellow-400 active:text-white"
              >
                <PlusIcon className="h-4" />
              </button>
            </span>
          </div>
        </div>

        <VisibilityObserver
          className="relative"
          onVisibilityUpdated={(visible) => {
            if (visible) {
              onView(contract, isViewed)
              setIsViewed(true)
            }
          }}
        />
      </Col>
    )
  }
)

const CornerDetails = (props: { contract: Contract }) => {
  const { contract } = props
  const { creatorName, creatorAvatarUrl, closeTime } = contract

  return (
    <div className="m-3 flex gap-2 self-start drop-shadow">
      <Avatar size="sm" avatarUrl={creatorAvatarUrl} noLink />
      <div className="text-xs">
        <div className="text-white">{creatorName} </div>
        {closeTime != undefined && (
          <div className="text-gray-50 ">
            trading closes {fromNow(closeTime)}
          </div>
        )}
      </div>
    </div>
  )
}

function Percent(props: {
  contract: BinaryContract
  amount: number
  outcome?: 'NO' | 'YES'
}) {
  const { contract, amount, outcome } = props
  const percent =
    outcome === 'NO'
      ? 1 - getOutcomeProbabilityAfterBet(contract, 'NO', amount)
      : outcome === 'YES'
      ? getOutcomeProbabilityAfterBet(contract, 'YES', amount)
      : getBinaryProb(contract)

  return (
    <div
      className={clsx(
        'transition-color flex items-center self-center font-bold',
        !outcome && 'text-white',
        outcome === 'YES' && 'text-teal-100',
        outcome === 'NO' && 'text-scarlet-100'
      )}
    >
      <span
        className={clsx(
          'text-8xl transition-all',
          !outcome && '[text-shadow:#4337c9_0_8px]',
          outcome === 'YES' &&
            '[text-shadow:#14b8a6_-6px_4px,#0f766e_-12px_8px]',
          outcome === 'NO' && '[text-shadow:#FF2400_6px_4px,#991600_12px_8px]'
        )}
      >
        {formatPercent(percent).slice(0, -1)}
      </span>
      <span className="pt-2 text-2xl">%</span>
    </div>
  )
}
