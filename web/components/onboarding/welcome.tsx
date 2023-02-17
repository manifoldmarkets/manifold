import clsx from 'clsx'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'

import { STARTING_BALANCE } from 'common/economy'
import { ENV_CONFIG } from 'common/envs/constants'
import { User } from 'common/user'
import { buildArray } from 'common/util/array'
import { formatMoney } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import { useUser } from 'web/hooks/use-user'
import { updateUser } from 'web/lib/firebase/users'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { Title } from '../widgets/title'
import GroupSelectorDialog from './group-selector-dialog'

export default function Welcome() {
  const user = useUser()
  const isTwitch = useIsTwitch(user)

  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)

  const [showSignedOutUser, setShowSignedOutUser] = useState(false)
  const [groupSelectorOpen, setGroupSelectorOpen] = useState(false)

  const router = useRouter()

  const availablePages = buildArray([
    <WhatIsManifoldPage />,
    <PredictionMarketPage />,
    <WhatIsManaPage />,
    user && <ThankYouPage />,
  ])

  const isLastPage = page === availablePages.length - 1

  useEffect(() => {
    if (user) return
    const { showHelpModal } = router.query
    if (showHelpModal) {
      setPage(0)
      setShowSignedOutUser(true)
      setOpen(true)
      router.replace(router.pathname, router.pathname, { shallow: true })
    }
  }, [router.query])

  useEffect(() => {
    if (user?.shouldShowWelcome) setOpen(true)
  }, [user])

  const close = () => {
    setOpen(false)
    setPage(0)
    if (user?.shouldShowWelcome) {
      updateUser(user.id, { shouldShowWelcome: false })
      setGroupSelectorOpen(true)
    }
    if (showSignedOutUser) setShowSignedOutUser(false)
  }
  function increasePage() {
    if (!isLastPage) setPage(page + 1)
    else close()
  }

  function decreasePage() {
    if (page > 0) {
      setPage(page - 1)
    }
  }

  const shouldShowWelcomeModals =
    (!isTwitch && user && user.shouldShowWelcome) ||
    (user && !user.shouldShowWelcome && groupSelectorOpen) ||
    showSignedOutUser

  if (!shouldShowWelcomeModals) return <></>

  if (groupSelectorOpen)
    return (
      <GroupSelectorDialog
        open={groupSelectorOpen}
        setOpen={() => setGroupSelectorOpen(false)}
      />
    )

  return (
    <Modal open={open} setOpen={close}>
      <Col className="place-content-between rounded-md bg-white px-8 py-6 text-sm font-light md:text-lg">
        {availablePages[page]}
        <Col>
          <Row className="justify-between">
            <Button
              color={'gray'}
              className={page === 0 ? 'invisible' : ''}
              onClick={decreasePage}
            >
              Previous
            </Button>
            <Button onClick={increasePage}>
              {isLastPage ? 'Done' : 'Next'}
            </Button>
          </Row>
          <span
            className={clsx(
              'cursor-pointer self-center text-xs text-gray-500 hover:underline',
              isLastPage && 'invisible'
            )}
            onClick={close}
          >
            I got the gist, exit welcome
          </span>
        </Col>
      </Col>
    </Modal>
  )
}

const useIsTwitch = (user: User | null | undefined) => {
  const router = useRouter()
  const isTwitch = router.pathname === '/twitch'

  useEffect(() => {
    if (isTwitch && user?.shouldShowWelcome) {
      updateUser(user.id, { shouldShowWelcome: false })
    }
  }, [isTwitch, user?.id, user?.shouldShowWelcome])

  return isTwitch
}

function WhatIsManifoldPage() {
  return (
    <>
      <img
        className="h-2/3 w-2/3 place-self-center object-contain"
        src="/welcome/manipurple.png"
      />
      <Title className="text-center" children="Welcome to Manifold Markets!" />
      <p>
        Manifold Markets is a place where anyone can ask a question about the
        future.
      </p>
      <div className="mt-4">For example,</div>
      <div className="mt-2 font-normal text-indigo-700">
        “Will Michelle Obama be the next president of the United States?”
      </div>
    </>
  )
}

function PredictionMarketPage() {
  return (
    <>
      <p>
        Your question becomes a prediction market that people can bet{' '}
        <span className="font-normal text-indigo-700">
          mana ({ENV_CONFIG.moneyMoniker})
        </span>{' '}
        on.
      </p>
      <div className="mt-8 font-semibold">The core idea</div>
      <div className="mt-2">
        If people have to put their mana where their mouth is, you’ll get a
        pretty accurate answer!
      </div>
      <img
        src="/welcome/manifold-example.gif"
        className="my-4 h-full w-full object-contain"
      />
    </>
  )
}

export function WhatIsManaPage() {
  return (
    <>
      <Title className="">What is mana ({ENV_CONFIG.moneyMoniker})?</Title>
      <p>
        <span className="mt-4 font-normal text-indigo-700">
          Mana ({ENV_CONFIG.moneyMoniker})
        </span>{' '}
        is Manifold's play money. Use it to create and bet in markets. The more
        mana you have, the more you can bet and move the market.
      </p>
      <p>
        Mana <strong>can't be converted to real money</strong>.
      </p>
      <img
        src="/logo-flapping-with-money.gif"
        height={200}
        width={200}
        className="place-self-center object-contain"
      />
    </>
  )
}

export function CharityPage() {
  return (
    <>
      <Title children="Donate" />
      <p className="mt-2">
        You can turn your mana earnings into a real donation to charity, at a
        100:1 ratio. When you donate{' '}
        <span className="font-semibold">{formatMoney(1000)}</span> to Givewell,
        Manifold sends them <span className="font-semibold">$10 USD</span>.
      </p>
      <img
        src="/welcome/charity.gif"
        className="my-4 h-full w-full object-contain"
      />
    </>
  )
}

function ThankYouPage() {
  return (
    <>
      <img
        className="mx-auto mb-8 w-[60%] object-contain"
        src={'/welcome/treasure.png'}
      />
      <Title className="mx-auto" children="Start predicting!" />
      <p className="text-center">As a thank you for signing up, we sent you </p>
      <div className="mx-auto mt-2 mb-8 text-2xl font-normal text-indigo-700">
        {formatMoney(STARTING_BALANCE)}
      </div>
    </>
  )
}
