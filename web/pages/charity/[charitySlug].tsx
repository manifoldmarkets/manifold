import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { Col } from '../../components/layout/col'
import { Row } from '../../components/layout/row'
import { Page } from '../../components/page'
import { Title } from '../../components/title'
import { BuyAmountInput } from '../../components/amount-input'
import { Spacer } from '../../components/layout/spacer'
import { User } from '../../../common/user'
import { useUser } from '../../hooks/use-user'
import { Linkify } from '../../components/linkify'
import { transact } from '../../lib/firebase/api-call'
import { charities, Charity } from '../../../common/charity'
import { useRouter } from 'next/router'
import Custom404 from '../404'

const manaToUSD = (mana: number) =>
  (mana / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

export default function CharityPageWrapper() {
  const router = useRouter()
  const { charitySlug } = router.query as { charitySlug: string }

  const charity = charities.find(
    (c) => c.slug.toLowerCase() === charitySlug?.toLowerCase()
  )
  if (!router.isReady) return <></>
  if (!charity) {
    return <Custom404 />
  }
  return <CharityPage charity={charity} />
}

function CharityPage(props: { charity: Charity }) {
  const { charity } = props
  const { name, photo, blurb } = charity

  // TODO: why not just useUser inside Donation Box rather than passing in?
  const user = useUser()

  return (
    <Page rightSidebar={<DonationBox user={user} />}>
      <Col className="mx-1 w-full items-center sm:px-0">
        <Col className="max-w-2xl rounded bg-white px-8">
          <Title text={name} />
          {/* TODO: donations over time chart */}
          <Row className="justify-between">
            {photo && <img src={photo} alt="" className="w-40 rounded-2xl" />}
            <Details charity={charity} userDonated={4} numSupporters={1} />
          </Row>
          <h2 className="mt-7 mb-2 text-xl text-indigo-700">About</h2>
          <Blurb text={blurb} />
        </Col>
      </Col>
    </Page>
  )
}

function Blurb({ text }: { text: string }) {
  const [open, setOpen] = useState(false)

  // Calculate whether the full blurb is already shown
  const ref = useRef<HTMLDivElement>(null)
  const [hideExpander, setHideExpander] = useState(false)
  useEffect(() => {
    if (ref.current) {
      setHideExpander(ref.current.scrollHeight <= ref.current.clientHeight)
    }
  }, [])

  return (
    <>
      <div
        className={clsx(' text-gray-500', !open && 'line-clamp-5')}
        ref={ref}
      >
        {text}
      </div>
      <button
        onClick={() => setOpen(!open)}
        className={clsx(
          'btn btn-link capitalize-none my-3 normal-case text-indigo-700',
          hideExpander && 'hidden'
        )}
      >
        {open ? 'Hide' : 'Read more'}
      </button>
    </>
  )
}

function Details(props: {
  charity: Charity
  userDonated?: number
  numSupporters: number
}) {
  const { charity, userDonated, numSupporters } = props
  const { raised, website } = charity
  return (
    <Col className="gap-1 text-right">
      <div className="text-primary mb-2 text-4xl">
        {manaToUSD(raised ?? 0)} raised
      </div>
      {userDonated && (
        <div className="text-primary text-xl">
          {manaToUSD(userDonated)} from you!
        </div>
      )}
      {numSupporters > 0 && (
        <div className="text-gray-500">{numSupporters} supporters</div>
      )}
      <Linkify text={website} />
    </Col>
  )
}

function DonationBox(props: { user?: User | null }) {
  const { user } = props
  const [amount, setAmount] = useState<number | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const donateDisabled = isSubmitting || !amount || error

  const onSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(undefined)
    await transact({
      amount,
      // TODO hardcode in Manifold Markets official account.
      // Or should we just have it go into a void?
      toId: 'igi2zGXsfxYPgB0DJTXVJVmwCOr2', // akrolsmir@gmail in Dev env
      category: 'TO_CHARITY',
      description: `${user?.name} donated M$ ${amount} to wellgive`,
      txnData: {
        charityId: 'wellgive', // TODO fill in
      },
    })
    setIsSubmitting(false)
    setAmount(undefined)
  }

  return (
    <div className="rounded-lg bg-white py-6 px-8 shadow-lg">
      <div className="mb-6 text-2xl text-gray-700">Donate</div>
      <form onSubmit={onSubmit}>
        <label
          className="mb-2 block text-sm text-gray-500"
          htmlFor="donate-input"
        >
          Amount
        </label>
        <BuyAmountInput
          inputClassName="w-full donate-input"
          amount={amount}
          onChange={setAmount}
          error={error}
          setError={setError}
        />

        <Col className="mt-3 w-full gap-3">
          <Row className="items-center justify-between text-sm">
            <span className="text-gray-500">Conversion</span>
            <span>
              {amount || 0} Mana
              <span className="mx-2">→</span>
              {manaToUSD(amount || 0)}
            </span>
          </Row>
          {/* TODO: matching pool */}
        </Col>

        <Spacer h={8} />

        {user && (
          <button
            type="submit"
            className={clsx(
              'btn w-full',
              donateDisabled ? 'btn-disabled' : 'btn-primary',
              isSubmitting && 'loading'
            )}
          >
            Donate
          </button>
        )}
      </form>
    </div>
  )
}
