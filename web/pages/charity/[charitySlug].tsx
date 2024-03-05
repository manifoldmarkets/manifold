import { useCallback, useState } from 'react'
import Image from 'next/legacy/image'

import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { BuyAmountInput } from 'web/components/widgets/amount-input'
import { Spacer } from 'web/components/layout/spacer'
import { User } from 'common/user'
import { useUser } from 'web/hooks/use-user'
import { usePagination } from 'web/hooks/use-pagination'
import { Linkify } from 'web/components/widgets/linkify'
import { transact } from 'web/lib/firebase/api'
import { charities, Charity } from 'common/charity'
import Custom404 from '../404'
import {
  getDonationsByCharity,
  getDonationsPageQuery,
} from 'web/lib/supabase/txns'
import { Donation } from 'web/components/charity/feed-items'
import { manaToUSD } from 'common/util/format'
import { track } from 'web/lib/service/analytics'
import { SEO } from 'web/components/SEO'
import { Button } from 'web/components/buttons/button'
import { FullscreenConfetti } from 'web/components/widgets/fullscreen-confetti'
import { CollapsibleContent } from 'web/components/widgets/collapsible-content'
import { PaginationNextPrev } from 'web/components/widgets/pagination'

type DonationItem = { user: User; ts: number; amount: number }

const PAGE_SIZE = 50

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export async function getStaticProps(ctx: { params: { charitySlug: string } }) {
  const { charitySlug } = ctx.params
  const charity = charities.find((c) => c.slug === charitySlug?.toLowerCase())
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
  console.log(charity.id, stats)
  const donations = await getDonationsPageQuery(charity.id)(PAGE_SIZE)
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
  const { charity, donations, stats } = props
  const { name, photo, description } = charity
  const user = useUser()

  const [showConfetti, setShowConfetti] = useState(false)

  const paginationCallback = useCallback(getDonationsPageQuery(charity.id), [
    charity.id,
  ])

  const pagination = usePagination({
    pageSize: PAGE_SIZE,
    q: paginationCallback,
    prefix: donations,
  })
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
              pagination.prepend({ user, ts, amount })
              setShowConfetti(true)
            }}
          />
          <CollapsibleContent
            content={description}
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
        {manaToUSD(total ?? 0)} raised
      </div>
      {numSupporters && (
        <div className="text-ink-500">{numSupporters} supporters</div>
      )}
      <Linkify text={website} />
    </Col>
  )
}

const MIN_DONATION_MANA = 100

function DonationBox(props: {
  user?: User | null
  charity: Charity
  onDonated?: (user: User, ts: number, amount: number) => void
}) {
  const { user, charity, onDonated } = props
  const [amount, setAmount] = useState<number | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const donateDisabled =
    isSubmitting || !amount || !!error || amount < MIN_DONATION_MANA

  const onSubmit: React.FormEventHandler = async (e) => {
    if (!user || donateDisabled) return

    e.preventDefault()
    setIsSubmitting(true)
    setError(undefined)

    await transact({
      amount,
      fromId: user.id,
      fromType: 'USER',
      toId: charity.id,
      toType: 'CHARITY',
      token: 'M$',
      category: 'CHARITY',
      description: `${user.name} donated M$ ${amount} to ${charity.name}`,
    }).catch((err) => console.log('Error', err))

    setIsSubmitting(false)
    setAmount(undefined)
    onDonated?.(user, Date.now(), amount)
    track('donation', { charityId: charity.id, amount })
  }

  return (
    <div className="bg-canvas-50 my-4 rounded-lg px-4 py-2">
      <h2 className="text-primary-600 !mt-0 mb-4 text-2xl">Donate</h2>
      <label className="text-ink-700 mb-2 block text-sm">Amount</label>
      <BuyAmountInput
        inputClassName="donate-input"
        minimumAmount={MIN_DONATION_MANA}
        amount={amount}
        onChange={setAmount}
        error={error}
        setError={setError}
      />

      <Col className="mt-3 w-full gap-3">
        <Row className="items-center text-sm xl:justify-between">
          <span className="text-ink-500 mr-1">{charity.name} receives</span>
          <span>{manaToUSD(amount || 0)}</span>
        </Row>
      </Col>

      <Spacer h={8} />

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
          {(amount ?? 0) < MIN_DONATION_MANA ? '$1 minimum' : 'Donate'}
        </Button>
      )}
    </div>
  )
}
