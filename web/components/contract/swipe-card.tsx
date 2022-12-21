import clsx from 'clsx'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  MinusIcon,
  PlusIcon,
} from '@heroicons/react/solid'

import { getOutcomeProbabilityAfterBet } from 'common/calculate'
import { BinaryContract, Contract } from 'common/contract'
import { getBinaryProb } from 'common/contract-details'
import { formatMoney, formatPercent } from 'common/util/format'
import { richTextToString } from 'common/util/parse'
import { memo } from 'react'
import { contractPath } from 'web/lib/firebase/contracts'
import { fromNow } from 'web/lib/util/time'
import { Avatar } from '../widgets/avatar'
import { SiteLink } from '../widgets/site-link'
import { Row } from '../layout/row'
import { NoLabel, YesLabel } from '../outcome-label'
import { Col } from '../layout/col'
import { useContract } from 'web/hooks/use-contracts'

const betTapAdd = 10

export const SwipeCard = memo(
  (props: {
    contract: BinaryContract
    amount: number
    setAmount: (amount: number) => void
    swipeDirection: 'YES' | 'NO' | undefined
    className?: string
  }) => {
    const { amount, setAmount, swipeDirection, className } = props
    const contract = (useContract(props.contract.id) ??
      props.contract) as BinaryContract
    const { question, description, coverImageUrl } = contract

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

    return (
      <Col
        className={clsx(className, 'user-select-none relative flex h-full')}
        onClick={(e) => e.preventDefault()}
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
          <Percent
            contract={contract}
            amount={amount}
            outcome={swipeDirection}
          />
          {/* TODO: use editor excluding widgets */}
          <div className="prose prose-invert prose-sm line-clamp-3 mx-8 mb-2 text-gray-50">
            {typeof description === 'string'
              ? description
              : richTextToString(description)}
          </div>

          <SwipeStatus outcome={swipeDirection} />

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

const SwipeStatus = (props: { outcome: 'YES' | 'NO' | undefined }) => {
  const { outcome } = props

  if (outcome === 'NO') {
    return (
      <div className="text-scarlet-100 mr-8 flex justify-end gap-1">
        <ArrowLeftIcon className="h-5" /> Betting NO
      </div>
    )
  }
  if (outcome === 'YES') {
    return (
      <div className="ml-8 flex justify-start gap-1 text-teal-100">
        Betting YES <ArrowRightIcon className="h-5" />
      </div>
    )
  }
  return (
    <Row className="items-center justify-center text-yellow-100">
      <YesLabel /> <ArrowRightIcon className="h-6 text-teal-600" />
      <span className="mx-4 whitespace-nowrap text-yellow-100">
        Swipe to bet
      </span>
      <ArrowLeftIcon className="text-scarlet-600 h-6" /> <NoLabel />
    </Row>
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
