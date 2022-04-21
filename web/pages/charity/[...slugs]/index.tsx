import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Charity } from '../../../components/charity/charity-card'
import { Col } from '../../../components/layout/col'
import { Row } from '../../../components/layout/row'
import { Page } from '../../../components/page'
import { Title } from '../../../components/title'
import { BuyAmountInput } from '../../../components/amount-input'
import { Spacer } from '../../../components/layout/spacer'
import { User } from '../../../../common/user'
import { useUser } from '../../../hooks/use-user'
import { Linkify } from '../../../components/linkify'
import { transact } from '../../../lib/firebase/api-call'

const manaToUSD = (mana: number) =>
  (mana / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

// TODO: replace with props
const data: Charity = {
  name: 'QRI',
  slug: 'qri',
  website: 'https://www.google.com',
  ein: '123456789',
  photo: 'https://placekitten.com/200/200',
  blurb:
    'Lorem Ipsum is simply dummy text of Lorem Ipsum is simply dummy text ofLorem Ipsum is simply dummy text ofLorem Ipsum is simply dLorem Ipsum is simply dummy text ofLorem Ipsum is simply dummy text ofLorem Ipsum is simply dummy text ofLorem Ipsum is simply dummy text ofLorem Ipsum is simply dummy text ofLorem Ipsum is simply dummy text ofLorem Ipsum is simply dummy text ofLorem Ipsum isLorem Ipsum is simply dummy text ofLorem Ipsum is simply dummy text of simply dummy text ofummy text of ',
  raised: 23450,
}

export default function CharityPage() {
  const { name, photo, blurb } = data

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
            <Details userDonated={4} numSupporters={1} />
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

function Details(props: { userDonated?: number; numSupporters: number }) {
  const { userDonated, numSupporters } = props
  const { raised, website } = data
  return (
    <Col className="gap-1 text-right">
      <div className="text-primary mb-2 text-4xl">
        {manaToUSD(raised)} raised
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
    // TODO await sending to db
    await transact({
      amount,
      toId: 'asdfsasdf', // TODO hardcode in Manifold Markets official account
      category: 'TO_CHARITY',
      data: {
        charityId: 'fjdkslasdf', // TODO fill in
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
