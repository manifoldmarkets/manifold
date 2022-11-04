import Image from 'next/image'
import { SparklesIcon, UserCircleIcon } from '@heroicons/react/solid'

import { Contract } from 'common/contract'

import { Spacer } from './layout/spacer'
import { firebaseLogin } from 'web/lib/firebase/users'
import { ContractsGrid } from './contract/contracts-grid'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { withTracking } from 'web/lib/service/analytics'
import { useTracking } from 'web/hooks/use-tracking'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import SquiggleVerticalIcon from 'web/lib/icons/squiggle_vertical'
import clsx from 'clsx'
import { Button } from './buttons/button'
import { ManifoldLogo } from './nav/manifold-logo'
import { useState } from 'react'
import SquiggleHorizontalIcon from 'web/lib/icons/squiggle_horizontal'
import TypewriterComponent from 'typewriter-effect'

export function LandingPagePanel(props: { hotContracts: Contract[] }) {
  const { hotContracts } = props

  useTracking('view landing page')
  const isMobile = useIsMobile()
  const desktop_height = 'h-60' //240px
  const mobile_height = 'h-96'

  const [isButtonHover, setIsButtonHovered] = useState(false)
  const [pageNumber, setPageNumber] = useState<0 | 1 | 2>(0)

  return (
    <>
      <div
        className={clsx(
          'mt-4 flex w-full flex-col overflow-hidden drop-shadow-sm sm:flex-row',
          isMobile ? mobile_height : desktop_height
        )}
      >
        <div className="relative h-4/5 w-full rounded-t-xl bg-indigo-700 sm:h-full sm:w-3/5 sm:rounded-l-xl sm:rounded-r-none">
          {/* <SignedOutHomepage0 onTimeout={() => setPageNumber(1)} /> */}
          <SignedOutHomepage1 onTimeout={() => setPageNumber(2)} />
          {!isMobile && (
            <div className="absolute right-0 bottom-0 z-20 h-full">
              <SquiggleVerticalIcon className={clsx('text-indigo-300')} />
            </div>
          )}
          {isMobile && (
            <div className="absolute right-0 -bottom-0.5 z-20 w-full">
              <SquiggleHorizontalIcon className={clsx('text-indigo-300')} />
            </div>
          )}
        </div>
        <div
          className={clsx(
            'z-30 w-full bg-indigo-300 sm:w-2/5',
            isMobile ? 'h-1/5 rounded-b-xl' : `${desktop_height} rounded-r-xl`
          )}
        >
          <Row className="absolute right-4 top-2 items-center gap-2">
            {isMobile && (
              <img
                className="transition-all group-hover:rotate-12"
                src={'/logo-white.svg'}
                width={24}
                height={24}
                alt=""
              />
            )}
            {!isMobile && (
              <img
                className="transition-all group-hover:rotate-12"
                src={'/logo.svg'}
                width={24}
                height={24}
                alt=""
              />
            )}
            <div
              className={clsx(
                'font-major-mono sm:text-greyscale-7 text-sm lowercase text-white sm:whitespace-nowrap'
              )}
            >
              Manifold Markets
            </div>
          </Row>
          <div
            className="absolute bottom-16 right-8 z-30 md:right-12"
            onMouseEnter={() => setIsButtonHovered(true)}
            onMouseLeave={() => setIsButtonHovered(false)}
          >
            <Button
              className={clsx(
                'absolute z-10 transition-all ease-in-out focus:bottom-0.5 focus:-left-0.5',
                isButtonHover ? 'bottom-2 -left-2' : 'bottom-1.5 -left-1.5'
              )}
              onClick={withTracking(firebaseLogin, 'landing page button click')}
              color="gradient-pink"
              size={isMobile ? 'xl' : '2xl'}
            >
              Get started
            </Button>
            <div
              className={clsx(
                'bg-greyscale-7 text-greyscale-7 rounded-md',
                isMobile
                  ? 'px-6 py-2.5 text-base font-semibold'
                  : 'px-6 py-3 text-xl font-semibold'
              )}
            >
              Get started
            </div>
          </div>
          <div className="absolute right-8 bottom-8 md:right-12">
            <div className="text-greyscale-7 text-right text-sm">
              and get{'   '}
              <span className="relative z-10 bg-teal-200 px-1 font-semibold">
                M$500
                <div className="absolute left-0 -bottom-0.5 -z-10 h-full w-full bg-teal-200" />
              </span>
              {'   '}
              to start predicting!
            </div>
          </div>
        </div>
      </div>
      <ContractsGrid contracts={hotContracts?.slice(0, 10) || []} />
    </>
  )
}

export function SignedOutHomepage0(props: { onTimeout: () => void }) {
  const { onTimeout } = props
  setTimeout(() => onTimeout, 5000)
  const text = 'Ask any question'
  return (
    <>
      <div className="animate-slide-in-2 absolute top-[32px] left-[32px] z-10 text-xl text-white sm:top-[16px]">
        {text}
      </div>
      <div className="animate-slide-in-1 absolute top-[33px] left-[33px] text-xl text-indigo-300 sm:top-[17px]">
        {text}
      </div>
      <Col className="animate-slide-in-4 absolute top-[80px] left-[32px] z-10 h-32 w-72 gap-2 rounded-md bg-white px-4 py-2 drop-shadow sm:top-[64px]">
        <Row className="items-center gap-2">
          <div className="h-5 w-5 rounded-full bg-red-300" />
          <div className="text-greyscale-4">You</div>
        </Row>
        <TypewriterComponent
          options={{ delay: 30 }}
          onInit={(typeWriter) => {
            typeWriter
              .pauseFor(1400)
              .typeString('How many babies will I have in 2 years?')
              .start()
          }}
        />
      </Col>
      <div className="animate-slide-in-3 absolute top-[88px] left-[40px] h-32 w-72 rounded-md bg-teal-200 sm:top-[72px]" />
    </>
  )
}

export function SignedOutHomepage1(props: { onTimeout: () => void }) {
  const { onTimeout } = props
  setTimeout(() => onTimeout, 5000)
  const text = 'Predict with play money'
  return (
    <>
      <div className="animate-slide-in-2 absolute top-[32px] left-[32px] z-10 text-xl text-white sm:top-[16px]">
        {text}
      </div>
      <div className="animate-slide-in-1 absolute top-[33px] left-[33px] text-xl text-indigo-300 sm:top-[17px]">
        {text}
      </div>
      <Col className="animate-slide-in-4 absolute top-[80px] left-[32px] z-10 h-36 w-[350px] gap-1 rounded-md bg-white px-4 py-2 drop-shadow sm:top-[64px]">
        <Row className="items-center gap-1">
          <UserCircleIcon className="h-5 w-5 text-blue-300" />
          <div className="text-greyscale-4 text-sm">Your friend</div>
        </Row>
        <div>Will Stacy ask me out tomorrow?</div>
        <div className="bg-greyscale-1.5 z-10 mt-4 h-10 w-72 overflow-hidden rounded-md drop-shadow">
          <div className="absolute left-0 h-full w-48 bg-indigo-200" />
        </div>
        <div className="absolute top-[68px] left-6 -z-10 mt-4 h-10 w-72 overflow-hidden rounded-md bg-teal-200" />
      </Col>
    </>
  )
}
