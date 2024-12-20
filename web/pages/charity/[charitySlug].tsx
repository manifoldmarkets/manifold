import { charities, Charity } from 'common/charity'
import {
  CASH_TO_CHARITY_DOLLARS,
  MIN_CASH_DONATION,
} from 'common/envs/constants'
import { User } from 'common/user'
import { formatMoneyUSD, formatSweepies } from 'common/util/format'
import Image from 'next/legacy/image'
import { useCallback, useEffect, useState } from 'react'
import { SEO } from 'web/components/SEO'
import { Button } from 'web/components/buttons/button'
import { Donation } from 'web/components/charity/feed-items'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { AmountInput } from 'web/components/widgets/amount-input'
import { CoinNumber } from 'web/components/widgets/coin-number'
import { CollapsibleContent } from 'web/components/widgets/collapsible-content'
import { FullscreenConfetti } from 'web/components/widgets/fullscreen-confetti'
import { Linkify } from 'web/components/widgets/linkify'
import { PaginationNextPrev } from 'web/components/widgets/pagination'
import { Title } from 'web/components/widgets/title'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { usePagination } from 'web/hooks/use-pagination'
import { useUser } from 'web/hooks/use-user'
import { api, APIError } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import {
  getDonationsByCharity,
  getDonationsPageQuery,
} from 'web/lib/supabase/txns'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'
import Custom404 from '../404'

type DonationItem = { user: User; ts: number; amount: number }

const PAGE_SIZE = 50

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export async function getStaticProps(ctx: { params: { charitySlug: string } }) {
  const { charitySlug } = ctx.params
  const charity = charities.find((c) => c.id === charitySlug?.toLowerCase())
  if (!charity) {
    return {
      props: {
        charity: null,
        donations: [],
        stats: { numSupporters: 0, total: 0 },
      },
      revalidate: 60,
    }
  }
  const stats = (await getDonationsByCharity())[charity.id] ?? {
    numSupporters: 0,
    total: 0,
  }
  const donations = await getDonationsPageQuery(charity.id)({
    limit: PAGE_SIZE,
  })
  return {
    props: { charity, donations, stats },
    revalidate: 60,
  }
}

export default function CharityPageWrapper(props: {
  charity: Charity | null
  donations: DonationItem[]
  stats: { numSupporters: number; total: number }
}) {
  const { charity, donations, stats } = props
  if (!charity) {
    return <Custom404 />
  }
  return <CharityPage charity={charity} donations={donations} stats={stats} />
}

function CharityPage(props: {
  charity: Charity
  donations: DonationItem[]
  stats: { numSupporters: number; total: number }
}) {
  const { charity, donations } = props
  const { name, photo, description } = charity
  const user = useUser()

  const [showConfetti, setShowConfetti] = useState(false)
  const [stats, setStats] = useState(props.stats)

  const paginationCallback = useCallback(getDonationsPageQuery(charity.id), [
    charity.id,
  ])

  const pagination = usePagination({
    pageSize: PAGE_SIZE,
    q: paginationCallback,
    prefix: donations,
  })

  const updateStats = (amount: number) => {
    setStats((prevStats) => ({
      total: prevStats.total + amount,
      numSupporters: prevStats.numSupporters + 1, // TODO: not always true, may have donated before.
    }))
  }

  return (
    <Page
      trackPageView={'charity slug page'}
      trackPageProps={{ charityName: charity.name }}
    >
      <SEO title={name} description={description} url="/browse" />
      {showConfetti && <FullscreenConfetti />}

      <Col className="mx-1 w-full items-center sm:px-0">
        <Col className="bg-canvas-0 max-w-2xl rounded px-8 py-6">
          <Title>{name}</Title>
          <Row className="justify-between">
            {photo && (
              <div className="relative w-40 rounded bg-white">
                <Image src={photo} alt="" layout="fill" objectFit="contain" />
              </div>
            )}
            <Details charity={charity} stats={stats} />
          </Row>
          <DonationBox
            user={user}
            charity={charity}
            onDonated={(user, ts, amount) => {
              pagination.prepend({
                user,
                ts,
                amount: CASH_TO_CHARITY_DOLLARS * amount,
              })
              updateStats(CASH_TO_CHARITY_DOLLARS * amount)
              setShowConfetti(true)
            }}
          />
          <CollapsibleContent
            content={description}
            mediaSize="md"
            stateKey={`isCollapsed-charity-${charity.id}`}
          />
          <Spacer h={8} />
          {pagination.items.map((d, i) => (
            <Donation key={i} user={d.user} ts={d.ts} amount={d.amount} />
          ))}
          <PaginationNextPrev {...pagination} />
        </Col>
      </Col>
    </Page>
  )
}

function Details(props: {
  charity: Charity
  stats: { numSupporters: number; total: number }
}) {
  const { charity, stats } = props
  const { numSupporters, total } = stats
  const { website } = charity
  return (
    <Col className="gap-1 text-right">
      <div className="mb-2 text-4xl text-teal-500">
        {formatMoneyUSD(total ?? 0)} raised
      </div>
      {numSupporters && (
        <div className="text-ink-500">{numSupporters} supporters</div>
      )}
      <Linkify text={website} />
    </Col>
  )
}

function DonationBox(props: {
  user?: User | null
  charity: Charity
  onDonated?: (user: User, ts: number, amount: number) => void
}) {
  const { user, charity, onDonated } = props

  const { data, refresh } = useAPIGetter('get-redeemable-prize-cash', {})
  const redeemableCash = data?.redeemablePrizeCash ?? 0

  const [amount, setAmount] = useState<number | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const min = MIN_CASH_DONATION

  useEffect(() => {
    if (amount && amount < min) {
      setError(`Minimum amount: ${formatSweepies(min)}`)
    } else if (amount && amount > redeemableCash) {
      setError(`You don't have enough redeemable sweepcash`)
    } else {
      setError(undefined)
    }
  }, [amount])

  const donateDisabled = isSubmitting || !amount || !!error || amount < min

  const onSubmit: React.FormEventHandler = async (e) => {
    if (!user || donateDisabled) return

    e.preventDefault()
    setIsSubmitting(true)
    setError(undefined)

    await api('donate', { amount, to: charity.id }).catch((e) => {
      console.error(e)
      if (e instanceof APIError) setError(e.message)
    })

    setIsSubmitting(false)
    setAmount(undefined)
    onDonated?.(user, Date.now(), amount)
    track('donation', { charityId: charity.id, amount })
    await refresh()
  }

  return (
    <div className="bg-canvas-50 my-4 flex flex-col rounded-lg px-4 py-2">
      <h2 className="text-primary-600 !mt-0 mb-4 text-2xl">Donate</h2>
      <label className="text-ink-700 mb-2 block text-sm">Amount</label>
      <AmountInput
        error={!!error}
        amount={amount}
        onChangeAmount={setAmount}
        label={<SweepiesCoin />}
        allowFloat={true}
      />

      {error && (
        <div className="text-scarlet-500 my-4 h-2 text-sm dark:text-red-400">
          {error}
        </div>
      )}

      <Col className="mb-8 mt-4 w-full gap-3">
        <Row className="items-center text-sm xl:justify-between">
          <span className="text-ink-500 mr-1">{charity.name} receives</span>
          <span>{formatMoneyUSD(CASH_TO_CHARITY_DOLLARS * (amount || 0))}</span>
        </Row>
      </Col>

      {user && (
        <Button
          type="submit"
          color="green"
          size="xl"
          className="w-full"
          disabled={donateDisabled}
          loading={isSubmitting}
          onClick={onSubmit}
        >
          Donate
        </Button>
      )}

      <div className="mt-2 text-xs">
        <CoinNumber amount={min} isInline coinType={'sweepies'} /> donation
        minimum
      </div>
    </div>
  )
}
