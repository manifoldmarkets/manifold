import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { updateUser } from 'web/lib/firebase/users'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { Title } from '../title'

export default function Welcome() {
  const user = useUser()
  const [open, setOpen] = useState(true)
  const [page, setPage] = useState(0)
  const TOTAL_PAGES = 4

  function increasePage() {
    if (page < TOTAL_PAGES - 1) {
      setPage(page + 1)
    }
  }

  function decreasePage() {
    if (page > 0) {
      setPage(page - 1)
    }
  }

  async function setUserHasSeenWelcome() {
    if (user) {
      await updateUser(user.id, { ['shouldShowWelcome']: false })
    }
  }

  if (!user || !user.shouldShowWelcome) {
    return <></>
  } else
    return (
      <Modal
        open={open}
        setOpen={(newOpen) => {
          setUserHasSeenWelcome()
          setOpen(newOpen)
        }}
      >
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
              onClick={() => {
                setOpen(false)
                setUserHasSeenWelcome()
              }}
            >
              I got the gist, exit welcome
            </u>
          </Col>
        </Col>
      </Modal>
    )
}

function PageIndicator(props: { page: number; totalpages: number }) {
  const { page, totalpages } = props
  return (
    <Row>
      {[...Array(totalpages)].map((e, i) => (
        <div
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
      <div className="mt-8 font-semibold">Example</div>
      <p className="mt-2">
        When you donate <span className="font-semibold">M$1000</span> to
        Givewell, Manifold sends them{' '}
        <span className="font-semibold">$10 USD</span>.
      </p>
      <video loop autoPlay className="my-4 h-full w-full">
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
        <span className="font-normal text-indigo-700">M$1000 Mana</span>{' '}
      </p>
    </>
  )
}
