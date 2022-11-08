import clsx from 'clsx'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/solid'

import { PrivateUser, User } from 'common/user'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { updatePrivateUser, updateUser } from 'web/lib/firebase/users'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { Title } from '../widgets/title'
import GroupSelectorDialog from './group-selector-dialog'
import { formatMoney } from 'common/util/format'
import { STARTING_BALANCE } from 'common/economy'
import { Button } from 'web/components/buttons/button'

export default function Welcome() {
  const user = useUser()
  const privateUser = usePrivateUser()
  const [open, setOpen] = useState(true)
  const [page, setPage] = useState(0)
  const [groupSelectorOpen, setGroupSelectorOpen] = useState(false)
  const isTwitch = useIsTwitch(user)
  const TOTAL_PAGES = 4
  // Just making new users created after 11/09/2022 go through this for now
  const shouldSeeEula =
    user &&
    privateUser &&
    !privateUser?.hasSignedEula &&
    user.createdTime > 1667977200000

  function increasePage() {
    if (page < TOTAL_PAGES - 1) {
      setPage(page + 1)
    }
  }
  useEffect(() => {
    if (!open && shouldSeeEula) {
      setOpen(true)
    }
    if (!open && !shouldSeeEula && user?.shouldShowWelcome) {
      if (user?.shouldShowWelcome)
        updateUser(user.id, { shouldShowWelcome: false })
      setGroupSelectorOpen(true)
    }
  }, [open, shouldSeeEula, user?.id, user?.shouldShowWelcome])

  function decreasePage() {
    if (page > 0) {
      setPage(page - 1)
    }
  }

  if (
    isTwitch ||
    !user ||
    (!user.shouldShowWelcome && !groupSelectorOpen && !shouldSeeEula)
  )
    return <></>

  if (groupSelectorOpen)
    return (
      <GroupSelectorDialog
        open={groupSelectorOpen}
        setOpen={() => setGroupSelectorOpen(false)}
      />
    )

  return (
    <Modal
      open={open}
      setOpen={(toOpen) => {
        if (shouldSeeEula) return
        else setOpen(toOpen)
      }}
    >
      {shouldSeeEula ? (
        <Col className="h-full place-content-between rounded-md bg-white px-8 py-6 text-sm font-light md:text-lg">
          <Eula privateUser={privateUser} />
        </Col>
      ) : (
        <Col className="h-[32rem] place-content-between rounded-md bg-white px-8 py-6 text-sm font-light md:h-[40rem] md:text-lg">
          {page === 0 && <Page0 />}
          {page === 1 && <Page1 />}
          {page === 2 && <Page2 />}
          {page === 3 && <Page3 />}
          <Col>
            <Row className="place-content-between">
              <ChevronLeftIcon
                className={clsx(
                  'h-10 w-10 text-gray-400 hover:text-gray-500',
                  page === 0 ? 'disabled invisible' : ''
                )}
                onClick={decreasePage}
              />
              <PageIndicator page={page} totalpages={TOTAL_PAGES} />
              <ChevronRightIcon
                className={clsx(
                  'h-10 w-10 text-indigo-500 hover:text-indigo-600',
                  page === TOTAL_PAGES - 1 ? 'disabled invisible' : ''
                )}
                onClick={increasePage}
              />
            </Row>
            <u
              className="self-center text-xs text-gray-500"
              onClick={() => setOpen(false)}
            >
              I got the gist, exit welcome
            </u>
          </Col>
        </Col>
      )}
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

function PageIndicator(props: { page: number; totalpages: number }) {
  const { page, totalpages } = props
  return (
    <Row>
      {[...Array(totalpages)].map((e, i) => (
        <div
          key={i}
          className={clsx(
            'mx-1.5 my-auto h-1.5 w-1.5 rounded-full',
            i === page ? 'bg-indigo-500' : 'bg-gray-300'
          )}
        />
      ))}
    </Row>
  )
}

function Page0() {
  return (
    <>
      <img
        className="h-2/3 w-2/3 place-self-center object-contain"
        src="/welcome/manipurple.png"
      />
      <Title className="text-center" text="Welcome to Manifold Markets!" />
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

function Page1() {
  return (
    <>
      <p>
        Your question becomes a prediction market that people can bet{' '}
        <span className="font-normal text-indigo-700">mana (M$)</span> on.
      </p>
      <div className="mt-8 font-semibold">The core idea</div>
      <div className="mt-2">
        If people have to put their mana where their mouth is, you’ll get a
        pretty accurate answer!
      </div>
      <video loop autoPlay className="my-4 h-full w-full">
        <source src="/welcome/mana-example.mp4" type="video/mp4" />
        Your browser does not support video
      </video>
    </>
  )
}

function Page2() {
  return (
    <>
      <p>
        <span className="mt-4 font-normal text-indigo-700">Mana (M$)</span> is
        the play money you bet with. You can also turn it into a real donation
        to charity, at a 100:1 ratio.
      </p>
      <Row className="bg-greyscale-1 border-greyscale-2 mt-4 gap-2 rounded border py-2 pl-2 pr-4 text-sm text-indigo-700">
        <ExclamationCircleIcon className="h-5 w-5" />
        Mana can not be traded in for real money.
      </Row>
      <div className="mt-8 font-semibold">Example</div>
      <p className="mt-2">
        When you donate{' '}
        <span className="font-semibold">{formatMoney(1000)}</span> to Givewell,
        Manifold sends them <span className="font-semibold">$10 USD</span>.
      </p>
      <video loop autoPlay className="z-0 h-full w-full">
        <source src="/welcome/charity.mp4" type="video/mp4" />
        Your browser does not support video
      </video>
    </>
  )
}

function Page3() {
  return (
    <>
      <img className="mx-auto object-contain" src="/welcome/treasure.png" />
      <Title className="mx-auto" text="Let's start predicting!" />
      <p className="mb-8">
        As a thank you for signing up, we’ve sent you{' '}
        <span className="font-normal text-indigo-700">
          {formatMoney(STARTING_BALANCE)}
        </span>{' '}
      </p>
    </>
  )
}

function Eula(props: { privateUser: PrivateUser }) {
  const { privateUser } = props
  const [expanded, setExpanded] = useState<'privacy' | 'tos' | null>()
  return (
    <Col className="mt-4 gap-2">
      <img
        className="h-2/3 w-2/3 place-self-center object-contain"
        src="/welcome/manipurple.png"
      />
      <Title className="text-center" text="Welcome to Manifold Markets!" />
      <div className="font-semibold">Terms of Service & Privacy Policy</div>
      <span>
        <span className="mt-2">
          By using Manifold Markets, you agree to the following:
        </span>{' '}
        <span
          className="cursor-pointer text-indigo-500 hover:text-indigo-600"
          onClick={() => setExpanded(expanded === 'privacy' ? null : 'privacy')}
        >
          Privacy Policy
        </span>{' '}
        &{' '}
        <span
          className="cursor-pointer text-indigo-500 hover:text-indigo-600"
          onClick={() => setExpanded(expanded === 'tos' ? null : 'tos')}
        >
          Terms of Service
        </span>
      </span>
      <Row>
        {expanded === 'tos' && (
          <iframe
            src={'https://manifold.markets/terms'}
            className="mt-4 mb-4 h-72 w-full overflow-x-hidden overflow-y-scroll"
          />
        )}
        <div className={'my-2 h-0.5 bg-gray-200'} />
        {expanded === 'privacy' && (
          <iframe
            src={'https://manifold.markets/privacy'}
            className="mt-4 mb-4 h-72 w-full overflow-x-hidden overflow-y-scroll"
          />
        )}
      </Row>
      <Row className={'justify-end'}>
        <Button
          color={'blue'}
          onClick={() =>
            updatePrivateUser(privateUser.id, { hasSignedEula: true })
          }
        >
          I agree
        </Button>
      </Row>
    </Col>
  )
}
