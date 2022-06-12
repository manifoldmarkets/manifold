import { sortBy, sumBy, uniqBy } from 'lodash'
import clsx from 'clsx'
import React, { useEffect, useRef, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/page'
import { Title } from 'web/components/title'
import { BuyAmountInput } from 'web/components/amount-input'
import { Spacer } from 'web/components/layout/spacer'
import { User } from 'common/user'
import { useUser } from 'web/hooks/use-user'
import { Linkify } from 'web/components/linkify'
import { transact } from 'web/lib/firebase/fn-call'
import { charities, Charity } from 'common/charity'
import { useRouter } from 'next/router'
import Custom404 from '../404'
import { useCharityTxns } from 'web/hooks/use-charity-txns'
import { useWindowSize } from 'web/hooks/use-window-size'
import Confetti from 'react-confetti'
import { Donation } from 'web/components/charity/feed-items'
import Image from 'next/image'
import { manaToUSD } from '../../../common/util/format'

export default function CharityPageWrapper() {
  const router = useRouter()
  const { charitySlug } = router.query as { charitySlug: string }

  const charity = charities.find((c) => c.slug === charitySlug?.toLowerCase())
  if (!router.isReady) return <></>
  if (!charity) {
    return <Custom404 />
  }
  return <CharityPage charity={charity} />
}

function CharityPage(props: { charity: Charity }) {
  const { charity } = props
  const { name, photo, description } = charity

  // TODO: why not just useUser inside Donation Box rather than passing in?
  const user = useUser()

  const txns = useCharityTxns(charity.id)
  const newToOld = sortBy(txns, (txn) => -txn.createdTime)
  const totalRaised = sumBy(txns, (txn) => txn.amount)
  const fromYou = sumBy(
    txns.filter((txn) => txn.fromId === user?.id),
    (txn) => txn.amount
  )
  const numSupporters = uniqBy(txns, (txn) => txn.fromId).length

  const { width, height } = useWindowSize()
  const [showConfetti, setShowConfetti] = useState(false)

  return (
    <Page
      rightSidebar={
        <DonationBox
          user={user}
          charity={charity}
          setShowConfetti={setShowConfetti}
        />
      }
    >
      {showConfetti && (
        <Confetti
          width={width ? width : 500}
          height={height ? height : 500}
          recycle={false}
          numberOfPieces={300}
        />
      )}

      <Col className="mx-1 w-full items-center sm:px-0">
        <Col className="max-w-2xl rounded bg-white dark:bg-black px-8 py-6">
          <Title className="!mt-0" text={name} />
          {/* TODO: donations over time chart */}
          <Row className="justify-between">
            {photo && (
              <div className="relative w-40 rounded-2xl">
                <Image src={photo} alt="" layout="fill" objectFit="contain" />
              </div>
            )}
            <Details
              charity={charity}
              totalRaised={totalRaised}
              userDonated={fromYou}
              numSupporters={numSupporters}
            />
          </Row>
          <h2 className="mt-7 mb-2 text-xl text-indigo-700 dark:text-indigo-300">About</h2>
          <Blurb text={description} />
          {newToOld.map((txn) => (
            <Donation key={txn.id} txn={txn} />
          ))}
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
        className={clsx(
          'whitespace-pre-line text-gray-500',
          !open && 'line-clamp-5'
        )}
        ref={ref}
      >
        {text}
      </div>
      <button
        onClick={() => setOpen(!open)}
        className={clsx(
          'btn btn-link capitalize-none my-3 normal-case text-indigo-700 dark:text-indigo-300',
          hideExpander && 'invisible'
        )}
      >
        {open ? 'Hide' : 'Read more'}
      </button>
    </>
  )
}

function Details(props: {
  charity: Charity
  totalRaised: number
  userDonated: number
  numSupporters: number
}) {
  const { charity, userDonated, numSupporters, totalRaised } = props
  const { website } = charity
  return (
    <Col className="gap-1 text-right">
      <div className="text-primary mb-2 text-4xl">
        {manaToUSD(totalRaised ?? 0)} raised
      </div>
      {userDonated > 0 && (
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

function DonationBox(props: {
  user?: User | null
  charity: Charity
  setShowConfetti: (show: boolean) => void
}) {
  const { user, charity, setShowConfetti } = props
  const [amount, setAmount] = useState<number | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const donateDisabled = isSubmitting || !amount || error

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
    setShowConfetti(true)
  }

  return (
    <div className="rounded-lg bg-white dark:bg-black py-6 px-8 shadow-lg">
      <Title text="Donate" className="!mt-0" />
      <form onSubmit={onSubmit}>
        <label
          className="mb-2 block text-sm text-gray-500"
          htmlFor="donate-input"
        >
          Amount
        </label>
        <BuyAmountInput
          inputClassName="w-full max-w-none donate-input"
          amount={amount}
          onChange={setAmount}
          error={error}
          setError={setError}
        />

        <Col className="mt-3 w-full gap-3">
          <Row className="items-center text-sm xl:justify-between">
            <span className="mr-1 text-gray-500">{charity.name} receives</span>
            <span>{manaToUSD(amount || 0)}</span>
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
