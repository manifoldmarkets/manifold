import clsx from 'clsx'
import dayjs from 'dayjs'

import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { useTracking } from 'web/hooks/use-tracking'
import { formatMoney } from 'common/util/format'
import { BuyAmountInput } from 'web/components/widgets/amount-input'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { useUser } from 'web/hooks/use-user'
import { useEffect, useState } from 'react'
import { Avatar } from 'web/components/widgets/avatar'

import { Spacer } from 'web/components/layout/spacer'
import { coll, getValues, listenForValues } from 'web/lib/firebase/utils'
import { Bid } from 'common/bid'
import { orderBy, query } from 'firebase/firestore'
import { max } from 'lodash'
import { call } from 'web/lib/firebase/api'
import { getApiUrl } from 'common/api'
import { APRIL_FOOLS_ENABLED } from 'common/envs/constants'
import { GradientContainer } from 'web/components/widgets/gradient-container'

const CUTOFF_TIME = 1680418800000 // Apr 2nd, 12 am PT

export async function getStaticProps() {
  const q = query(coll<Bid>('apr1-auction'), orderBy('createdTime', 'desc'))
  const bids = await getValues<Bid>(q)

  return {
    props: {
      bids,
    },
    revalidate: 60, // regenerate after a minute
  }
}

export default function ManaAuctionPage(props: { bids: Bid[] }) {
  useTracking('view mana auction')

  const bids = useBids(props.bids)
  const maxBid = max(bids.map((b) => b.amount)) ?? 0
  const bidder = bids.find((b) => b.amount === maxBid)?.displayName ?? 'None'

  const time = useTimer()
  const timeRemaining = getCountdown(time, CUTOFF_TIME)

  // if (!APRIL_FOOLS_ENABLED)
  //   return (
  //     <Page>
  //       <Col className="gap-4 sm:px-4 sm:pb-4">
  //         <Title className="mx-2 !mb-0 mt-2 sm:mx-0 lg:mt-0">
  //           Coming soon...
  //         </Title>
  //       </Col>
  //     </Page>
  //   )

  return (
    <Page>
      <Col className="gap-4 sm:px-4 sm:pb-4">
        <Title className="mx-2 !mb-0 mt-2 sm:mx-0 lg:mt-0">
          💰 {formatMoney(10000)} auction 💰
        </Title>

        <div>
          To celebrate April 1st and to give back to the community, Manifold is
          hosting an auction for {formatMoney(10000)}.
        </div>

        <GradientContainer className="mb-8 p-4">
          <Row className="gap-4 sm:gap-8">
            <div className="text-ink-700 text-center text-xl">
              Highest bid{' '}
              <div className="text-primary-700 text-4xl">
                {formatMoney(maxBid)}
              </div>
            </div>

            <div className="text-ink-700 hidden flex-col text-center text-xl sm:flex">
              Bidder <div className="text-secondary-700 text-3xl">{bidder}</div>
            </div>

            <div className="text-ink-700 text-center text-xl">
              Time remaining{' '}
              <div className="text-secondary-700 text-3xl">{timeRemaining}</div>
            </div>
          </Row>
        </GradientContainer>

        <BidButton />

        <BidTable bids={bids} />

        <div className="prose prose-sm text-ink-600 max-w-[800px]">
          <b>Rules</b>
          <ul>
            <li>
              The highest bidder at midnight Pacific Time wins{' '}
              {formatMoney(10000)}.
            </li>

            <li>
              Users can submit multiple bids. Each bid must be at least 10%
              higher than the previous bid.
            </li>

            <li>
              Users pay their highest bid. E.g. if you bid {formatMoney(5)} and
              then {formatMoney(10)}, you will end up paying {formatMoney(10)}{' '}
              in total, even if your bid does not win.
            </li>
          </ul>
        </div>
      </Col>
    </Page>
  )
}

const useTimer = () => {
  const [time, setTime] = useState(+new Date(2023, 3, 1))

  useEffect(() => {
    const interval = setInterval(() => setTime(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  return time
}

const getCountdown = (now: number, later: number) => {
  const distance = now >= later ? 0 : later - now

  const hours = Math.floor(
    (distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
  )
  const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((distance % (1000 * 60)) / 1000)

  return `${hours}h ${minutes}m ${seconds}s`
}

const BidTable = ({ bids }: { bids: Bid[] }) => {
  if (bids.length === 0) return <></>

  return (
    <>
      <Spacer h={2} />

      <div>Bids</div>

      <Col className="bg-canvas-0 divide-ink-300 border-ink-300  w-72 divide-y-[0.5px] rounded-sm border-[0.5px]">
        {bids.map((bid) => (
          <div
            key={bid.createdTime}
            className={clsx(
              'group flex flex-row gap-1 whitespace-nowrap px-4 py-3 lg:gap-2',
              'focus:bg-ink-300/30 lg:hover:bg-ink-300/30 transition-colors',
              'justify-between'
            )}
          >
            <Row className="text-ink-700 max-w-sm truncate">
              <Avatar
                username={bid.username}
                avatarUrl={bid.avatar}
                size="xs"
                className="mr-2"
              />
              {bid.displayName}
            </Row>

            <div>{formatMoney(bid.amount)}</div>
            <div className="text-ink-700">
              {dayjs(bid.createdTime).format('h:mm A')}
            </div>
          </div>
        ))}
      </Col>
    </>
  )
}

const BidButton = () => {
  const user = useUser()

  const [amount, setAmount] = useState<number | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [serverError, setServerError] = useState<string | undefined>(undefined)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const onAmountChange = (amount: number | undefined) => {
    setIsSuccess(false)
    setAmount(amount)

    // Check for errors.
    if (amount !== undefined) {
      if (user && user.balance < amount) {
        setError('Insufficient balance')
      } else if (amount < 1) {
        setError('Minimum amount: ' + formatMoney(1))
      } else {
        setError(undefined)
      }
    }
  }

  const submit = async () => {
    if (!amount) return

    setIsLoading(true)
    setServerError(undefined)

    await placeBid(amount)
      .then(() => {
        setIsSuccess(true)
        setAmount(undefined)
      })
      .catch((e) => {
        console.log('error', e.message)
        setServerError(e.message)
        setIsSuccess(false)
      })

    setIsLoading(false)
  }

  return (
    <div className="">
      <div className="mb-4">Place your bid to win big!</div>

      <Row className="">
        <BuyAmountInput
          amount={amount}
          onChange={onAmountChange}
          error={error || serverError}
          disabled={isLoading}
          inputClassName="w-40"
          setError={setError}
        />
        <Button
          onClick={submit}
          disabled={isLoading || !!error}
          className="ml-4"
        >
          Bid
        </Button>
      </Row>

      {isSuccess && amount && <div>Success! Bid placed.</div>}

      {isLoading && <div>Processing...</div>}
    </div>
  )
}

export const useBids = (initialBids: Bid[]) => {
  const [bids, setBids] = useState<Bid[]>(initialBids)

  useEffect(() => {
    return listenForValues<Bid>(
      query(coll<Bid>('apr1-auction'), orderBy('createdTime', 'desc')),
      setBids
    )
  }, [])

  return bids
}

export function placeBid(amount: number) {
  return call(getApiUrl('auctionbid'), 'POST', { amount })
}
