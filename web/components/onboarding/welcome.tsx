import clsx from 'clsx'

import { STARTING_BALANCE } from 'common/economy'
import { ENV_CONFIG } from 'common/envs/constants'
import { User } from 'common/user'
import { buildArray } from 'common/util/array'
import { formatMoney } from 'common/util/format'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { useABTest } from 'web/hooks/use-ab-test'
import { useUser } from 'web/hooks/use-user'
import { updateUser } from 'web/lib/firebase/users'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
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

  const skipWelcome = useABTest('welcome-flow', {
    skip: true,
    show: false,
  })

  if (skipWelcome || !shouldShowWelcomeModals) return <></>

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
          <Row className="mt-2 justify-between">
            <Button
              color={'gray-white'}
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
              'mt-2 cursor-pointer self-center text-xs text-gray-500 hover:underline',
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
        className="h-1/3 w-1/3 place-self-center object-contain sm:h-1/2 sm:w-1/2 "
        src="/welcome/manipurple.png"
      />
      <div className="mt-3 mb-6 to-white text-center text-xl font-normal text-indigo-700">
        Welcome to Manifold Markets
      </div>
      <p className="mb-4 text-lg">
        Bet on anything and help people predict the future!
      </p>
      <p> </p>
    </>
  )
}

function PredictionMarketPage() {
  return (
    <>
      <div className="mt-3 mb-6 text-center text-xl font-normal text-indigo-700">
        How it works
      </div>
      <div className="mt-2 text-lg">
        Create a market on any question. Bet on the right answer. The
        probability is the market's best estimate.
      </div>
      <img
        src="/welcome/manifold-example.gif"
        className="my-4 h-full w-full object-contain"
      />
    </>
  )
}

function ThankYouPage() {
  return (
    <>
      <img
        className="mx-auto mb-6 h-1/2 w-1/2 object-contain"
        src={'/welcome/treasure.png'}
      />
      <div
        className="mb-6 text-center text-xl font-normal text-indigo-700"
        children="Start trading"
      />
      <p className="text-lg">
        As a thank you for signing up, we sent you{' '}
        {formatMoney(STARTING_BALANCE)} in play money!
      </p>
      <Row className={'my-3 text-sm text-gray-600'}>
        Note that mana ({ENV_CONFIG.moneyMoniker}) can't be converted into cash.
      </Row>
    </>
  )
}
