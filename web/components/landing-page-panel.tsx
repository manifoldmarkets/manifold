import { UserCircleIcon } from '@heroicons/react/solid'
import { firebaseLogin } from 'web/lib/firebase/users'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { withTracking } from 'web/lib/service/analytics'
import { useTracking } from 'web/hooks/use-tracking'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import SquiggleVerticalIcon from 'web/lib/icons/squiggle_vertical'
import clsx from 'clsx'
import { Button } from './buttons/button'
import React, { useEffect, useState } from 'react'
import SquiggleHorizontalIcon from 'web/lib/icons/squiggle_horizontal'
import TypewriterComponent from 'typewriter-effect'
import EquilateralLeftTriangle from 'web/lib/icons/equilateral-left-triangle'
import EquilateralRightTriangle from 'web/lib/icons/equilateral-right-triangle'
import CountUp from 'react-countup'
import { ENV_CONFIG } from 'common/envs/constants'
import { STARTING_BALANCE } from 'common/economy'
import { Modal } from 'web/components/layout/modal'
import { CharityPage } from 'web/components/onboarding/welcome'

const MAX_PAGE = 2

export function getNextPageNumber(pageNumber: number, maxPage: number) {
  if (pageNumber + 1 <= maxPage) {
    return pageNumber + 1
  } else {
    return 0
  }
}

export function PaginationCircle(props: {
  currentPageNumber: number
  pageNumber: number
  onClick: () => void
}) {
  const { currentPageNumber, pageNumber, onClick } = props
  return (
    <div onClick={() => onClick()} className="cursor-pointer p-1.5">
      <div
        className={clsx(
          'h-2 w-2 rounded-full transition-colors',
          currentPageNumber === pageNumber ? 'bg-white' : 'bg-indigo-400'
        )}
      />
    </div>
  )
}

export function LandingPagePanel() {
  useTracking('view landing page')
  const isMobile = useIsMobile()
  const [pageNumber, setPageNumber] = useState(0)

  useEffect(() => {
    const newTimeoutId = setTimeout(
      () => setPageNumber(getNextPageNumber(pageNumber, MAX_PAGE)),
      6000
    )
    return () => clearTimeout(newTimeoutId)
  }, [pageNumber])

  return (
    <>
      <div className="flex h-96 w-full flex-col overflow-hidden drop-shadow-sm sm:mt-4 sm:h-60 sm:flex-row">
        <div className="relative h-4/5 w-full rounded-t-xl bg-indigo-700 sm:h-full sm:w-3/5 sm:rounded-l-xl sm:rounded-r-none">
          {pageNumber === 0 && <LandingPage0 isMobile={isMobile} />}
          {pageNumber === 1 && <LandingPage1 isMobile={isMobile} />}
          {pageNumber === 2 && <LandingPage2 isMobile={isMobile} />}
          {!isMobile && (
            <div className="absolute -right-0.5 bottom-0 z-20 h-full">
              <SquiggleVerticalIcon className="h-full text-indigo-200" />
            </div>
          )}
          {isMobile && (
            <div className="absolute right-0 -bottom-0.5 z-20 w-full items-center">
              <SquiggleHorizontalIcon className="text-indigo-200" />
            </div>
          )}
          <div
            className={clsx(
              'absolute',
              isMobile ? 'right-0 h-full w-8' : 'bottom-0 h-6 w-full'
            )}
          >
            <div
              className={clsx(
                'z-50 ',
                isMobile ? 'mt-32 ml-1 flex flex-col' : 'ml-40 flex flex-row'
              )}
            >
              <PaginationCircle
                currentPageNumber={pageNumber}
                pageNumber={0}
                onClick={() => {
                  setPageNumber(0)
                }}
              />
              <PaginationCircle
                currentPageNumber={pageNumber}
                pageNumber={1}
                onClick={() => setPageNumber(1)}
              />
              <PaginationCircle
                currentPageNumber={pageNumber}
                pageNumber={2}
                onClick={() => setPageNumber(2)}
              />
            </div>
          </div>
        </div>
        <div
          className={clsx(
            'relative z-30 h-1/5 w-full rounded-b-xl bg-indigo-200 sm:h-full sm:w-2/5 sm:rounded-r-xl sm:rounded-l-none'
          )}
        >
          <div className="group absolute bottom-16 right-8 z-30 md:right-12">
            <Button
              className="absolute bottom-1.5 -left-1.5 z-10 transition-all ease-in-out focus:bottom-0.5 focus:-left-0.5 group-hover:bottom-2 group-hover:-left-2 focus:group-hover:bottom-0.5 focus:group-hover:-left-0.5"
              onClick={withTracking(firebaseLogin, 'landing page button click')}
              color="gradient-pink"
              size={isMobile ? 'xl' : '2xl'}
            >
              Get started
            </Button>
            <div
              className={clsx(
                'rounded-md bg-teal-200 text-white',
                isMobile
                  ? 'px-6 py-2.5 text-base font-semibold'
                  : 'px-6 py-3 text-xl font-semibold'
              )}
            >
              Get started
            </div>
          </div>
          <div className="absolute top-6 right-8 sm:top-48 md:right-12">
            <div className="text-right text-sm text-black">
              and get{'   '}
              <span className="relative z-10 font-semibold">
                {ENV_CONFIG.moneyMoniker}
                {STARTING_BALANCE}
              </span>
              {'   '}
              in play money!
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export function CharityModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { open, setOpen } = props
  return (
    <Modal open={open} setOpen={setOpen}>
      <CharityPage className={'rounded-md p-6'} />
    </Modal>
  )
}

export function LandingPage0(props: { isMobile: boolean }) {
  const { isMobile } = props
  const text = '1. Create a question'
  return (
    <>
      <div
        className={clsx(
          'sm: absolute z-10 text-xl text-white',
          isMobile
            ? 'animate-slide-up-1 left-[20px] top-[32px]'
            : 'animate-slide-in-2 left-[32px] top-[16px]'
        )}
      >
        {text}
      </div>
      <div
        className={clsx(
          'absolute text-xl text-indigo-300',
          isMobile
            ? 'animate-slide-up-2 left-[21px] top-[33px]'
            : 'animate-slide-in-1 left-[33px] top-[17px]'
        )}
      >
        {text}
      </div>
      <Col
        className={clsx(
          'bg-canvas-0 absolute z-10 h-32 w-72 gap-2 rounded-md px-4 py-2 drop-shadow',
          isMobile
            ? 'animate-slide-up-3 top-[70px] left-[20px]'
            : 'animate-slide-in-4 top-[58px] left-[32px]'
        )}
      >
        <Row className="items-center gap-2">
          <UserCircleIcon className="h-5 w-5 text-red-300" />
          <div className="text-ink-400">You</div>
        </Row>
        <TypewriterComponent
          options={{ delay: 30 }}
          onInit={(typeWriter) => {
            typeWriter
              .pauseFor(2500)
              .typeString('Will Michelle Obama be president in 2024?')
              .start()
          }}
        />
      </Col>
      <div
        className={clsx(
          'absolute h-32 w-72 rounded-md bg-teal-200',
          isMobile
            ? 'animate-slide-up-4 left-[28px] top-[80px]'
            : 'animate-slide-in-3 left-[40px] top-[65px]'
        )}
      />
    </>
  )
}

export function LandingPage1(props: { isMobile: boolean }) {
  const { isMobile } = props
  const startPredictMs = 3000
  const text = '2. Predict with play money'
  const [shouldPercentChange, setShouldPercentChange] = useState(false)
  const [shouldButtonHighlight, setShouldButtonHighlight] = useState(false)
  const [isMVisible, setIsMVisible] = useState(true)
  setTimeout(() => setShouldButtonHighlight(true), startPredictMs - 100)
  setTimeout(() => setShouldPercentChange(true), startPredictMs)
  setTimeout(() => setIsMVisible(false), startPredictMs + 400)
  return (
    <>
      <div
        className={clsx(
          'absolute z-10 text-xl text-white',
          isMobile
            ? 'animate-slide-up-1 left-[20px] top-[32px]'
            : 'animate-slide-in-2 left-[32px] top-[16px]'
        )}
      >
        {text}
      </div>
      <div
        className={clsx(
          'text-primary-300 absolute text-xl',
          isMobile
            ? 'animate-slide-up-2 left-[21px] top-[33px]'
            : 'animate-slide-in-1 left-[33px] top-[17px] '
        )}
      >
        {text}
      </div>
      <Col
        className={clsx(
          'bg-canvas-0 absolute z-10 h-32 w-72 gap-1 rounded-md px-4 py-2 drop-shadow',
          isMobile
            ? 'animate-slide-up-3 left-[20px] top-[70px]'
            : 'animate-slide-in-4 left-[32px] top-[58px]'
        )}
      >
        <Row className="items-center gap-1">
          <UserCircleIcon className="h-5 w-5 text-blue-300" />
          <div className="text-ink-400 text-sm">Your friend</div>
        </Row>
        <div>Will I get a date to prom?</div>
      </Col>
      <div
        className={clsx(
          'bg-ink-100 absolute z-20 mt-2 h-10 w-60 rounded-md drop-shadow',
          isMobile
            ? 'animate-slide-up-3-big left-[36px] top-[130px]'
            : 'animate-slide-in-4 left-[48px] top-[114px]'
        )}
      >
        <div
          className={clsx(
            'bg-primary-200 h-full rounded-l-md transition-all duration-[1500ms] ease-out',
            shouldPercentChange ? 'w-48' : 'w-[120px]'
          )}
        />
        <EquilateralLeftTriangle className="text-primary-400 absolute left-[8px] top-[7px] z-10 h-6 w-6" />
        <EquilateralLeftTriangle className="absolute left-[11px] top-[11px] z-0 h-6 w-6 text-white opacity-20" />
        <div className="absolute top-[6px] left-[100px] z-30 text-xl font-semibold">
          {shouldPercentChange && (
            <CountUp start={50} end={75} duration={1.3} suffix="%" />
          )}
          {!shouldPercentChange && <div>50%</div>}
        </div>
        <EquilateralRightTriangle
          className={clsx(
            'animate-press-3x absolute right-[8px] top-[7px] z-10 h-6 w-6 transition-colors',
            shouldButtonHighlight ? 'text-primary-600' : 'text-primary-400'
          )}
        />
        <EquilateralRightTriangle className="absolute right-[6px] top-[11px] z-0 h-6 w-6 text-white opacity-20" />
        <div
          className={clsx(
            'animate-float-and-fade-1 text-primary-600 absolute right-[10px] top-[2px] z-40 font-thin',
            !isMVisible ? 'opacity-0' : ''
          )}
        >
          {ENV_CONFIG.moneyMoniker}
        </div>
        <div
          className={clsx(
            'animate-float-and-fade-2 text-primary-600 absolute right-[10px] top-[2px] z-40 font-thin',
            !isMVisible ? 'opacity-0' : ''
          )}
        >
          {ENV_CONFIG.moneyMoniker}
        </div>
        <div
          className={clsx(
            'animate-float-and-fade-3 text-primary-600 absolute right-[10px] top-[2px] z-40 font-thin',
            !isMVisible ? 'opacity-0' : ''
          )}
        >
          {ENV_CONFIG.moneyMoniker}
        </div>
      </div>
      <div
        className={clsx(
          'absolute z-10 mt-2 h-10 w-60 rounded-md bg-teal-200',
          isMobile
            ? 'animate-slide-up-4-big left-[44px] top-[138px]'
            : 'animate-slide-in-3 left-[56px] top-[122px]'
        )}
      />
    </>
  )
}

export function LandingPage2(props: { isMobile: boolean }) {
  const { isMobile } = props
  const text = '3. Profit'
  return (
    <>
      <div
        className={clsx(
          'absolute z-10 text-xl text-white',
          isMobile
            ? 'animate-slide-up-1 left-[20px] top-[32px]'
            : 'animate-slide-in-2 left-[32px] top-[16px]'
        )}
      >
        {text}
      </div>
      <div
        className={clsx(
          'text-primary-300 absolute text-xl',
          isMobile
            ? 'animate-slide-up-2 left-[21px] top-[33px]'
            : 'animate-slide-in-1 left-[33px] top-[17px]'
        )}
      >
        {text}
      </div>
      <img
        src="landing/white_foldy.png"
        className={clsx(
          'absolute z-20',
          isMobile
            ? 'animate-slide-up-4 top-20 left-4 h-40'
            : 'animate-slide-in-3 top-12 left-8 h-32'
        )}
      />
      <img
        src="landing/stonks_arrow.png"
        className={clsx(
          'rotate-30 absolute z-10',
          isMobile
            ? 'animate-slide-up-3-grow left-32 top-12 h-48'
            : 'animate-slide-in-4-grow left-44 top-12 h-32 '
        )}
      />
      <img
        src="landing/stonks.png"
        className={clsx(
          'absolute',
          isMobile
            ? 'animate-slide-up-3 top-4 h-80'
            : 'animate-slide-in-4 top-4 left-8 h-48 w-80 '
        )}
      />
    </>
  )
}
