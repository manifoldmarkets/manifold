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
import { useEffect, useMemo, useState } from 'react'
import SquiggleHorizontalIcon from 'web/lib/icons/squiggle_horizontal'
import TypewriterComponent from 'typewriter-effect'
import EquilateralLeftTriangle from 'web/lib/icons/equilateral-left-triangle'
import EquilateralRightTriangle from 'web/lib/icons/equilateral-right-triangle'
import CountUp from 'react-countup'
import Particles from 'react-tsparticles'
import { useCallback } from 'preact/hooks'
import { Container, Engine } from 'tsparticles-engine'
import { loadSlim } from 'tsparticles-slim'

export type PageNumber = 0 | 1 | 2

export function getNextPageNumber(pageNumber: PageNumber): PageNumber {
  switch (pageNumber) {
    case 0:
      return 1
    case 1:
      return 2
    case 2:
      return 0
  }
}

export function PaginationCircle(props: {
  currentPageNumber: PageNumber
  pageNumber: PageNumber
  onClick: () => void
}) {
  const { currentPageNumber, pageNumber, onClick } = props
  return (
    <div
      onClick={() => onClick()}
      className={clsx(
        'h-1.5 w-1.5 rounded-full',
        currentPageNumber === pageNumber ? 'bg-white' : 'bg-indigo-400'
      )}
    />
  )
}

export function LandingPagePanel() {
  useTracking('view landing page')
  const isMobile = useIsMobile()
  const desktop_height = 'h-60' //240px
  const mobile_height = 'h-96'

  const [isButtonHover, setIsButtonHovered] = useState(false)
  const [pageNumber, setPageNumber] = useState<PageNumber>(1)
  // const [timeoutEnabled, setTimeoutEnabled] = useState(true)
  const [currTimeoutId, setTimeoutId] = useState<
    NodeJS.Timeout | undefined | null
  >(null)

  useEffect(() => {
    if (currTimeoutId) {
      clearTimeout(currTimeoutId)
    }
    const newTimeoutId = setTimeout(
      () => setPageNumber(getNextPageNumber(pageNumber)),
      5500
    )
    setTimeoutId(newTimeoutId)
  }, [pageNumber])

  return (
    <>
      <div
        className={clsx(
          'mt-4 flex w-full flex-col overflow-hidden drop-shadow-sm sm:flex-row',
          isMobile ? mobile_height : desktop_height
        )}
      >
        <div className="relative h-4/5 w-full rounded-t-xl bg-indigo-700 sm:h-full sm:w-3/5 sm:rounded-l-xl sm:rounded-r-none">
          {pageNumber === 0 && <LandingPage0 isMobile={isMobile} />}
          {pageNumber === 1 && <LandingPage1 isMobile={isMobile} />}
          {pageNumber === 2 && <LandingPage2 isMobile={isMobile} />}
          {!isMobile && (
            <div className="absolute right-0 bottom-0 z-20 h-full">
              <SquiggleVerticalIcon className={clsx('text-indigo-200')} />
            </div>
          )}
          {isMobile && (
            <div className="absolute right-0 -bottom-0.5 z-20 w-full items-center">
              <SquiggleHorizontalIcon className={clsx('text-indigo-200')} />
            </div>
          )}
          <div
            className={clsx(
              'absolute',
              isMobile ? 'right-0 h-full w-8' : 'bottom-0 h-8 w-full'
            )}
          >
            <div
              className={clsx(
                'gap-2',
                isMobile ? 'mt-40 ml-3 flex flex-col' : 'ml-40 flex flex-row'
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
            'z-30 w-full bg-indigo-200 sm:w-2/5',
            isMobile ? 'h-1/5 rounded-b-xl' : `${desktop_height} rounded-r-xl`
          )}
        >
          <LandingPageManifoldMarketsLogo isMobile={isMobile} />
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
    </>
  )
}

export function LandingPage0(props: { isMobile: boolean }) {
  const { isMobile } = props
  const text = 'Ask any question'
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
          'sm: absolute text-xl text-indigo-300',
          isMobile
            ? 'animate-slide-up-2 left-[21px] top-[33px]'
            : 'animate-slide-in-1 left-[33px] top-[17px]'
        )}
      >
        {text}
      </div>
      <Col
        className={clsx(
          'absolute z-10 h-32 w-72 gap-2 rounded-md bg-white px-4 py-2 drop-shadow',
          isMobile
            ? 'animate-slide-up-3 top-[70px] left-[20px]'
            : 'animate-slide-in-4 top-[58px] left-[32px]'
        )}
      >
        <Row className="items-center gap-2">
          <UserCircleIcon className="h-5 w-5 text-red-300" />
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

export function LandingPageManifoldMarketsLogo(props: { isMobile: boolean }) {
  const { isMobile } = props
  return (
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
  )
}

export function LandingPage1(props: { isMobile: boolean }) {
  const { isMobile } = props
  const startPredictMs = 2200
  const text = 'Predict with play money'
  const [shouldPercentChange, setShouldPercentChange] = useState(false)
  setTimeout(() => setShouldPercentChange(true), startPredictMs)
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
          'absolute text-xl text-indigo-300',
          isMobile
            ? 'animate-slide-up-2 left-[21px] top-[33px]'
            : 'animate-slide-in-1 left-[33px] top-[17px] '
        )}
      >
        {text}
      </div>
      <Col
        className={clsx(
          'absolute z-10 h-32 w-72 gap-1 rounded-md bg-white px-4 py-2 drop-shadow',
          isMobile
            ? 'animate-slide-up-3 left-[20px] top-[70px]'
            : 'animate-slide-in-4 left-[32px] top-[58px]'
        )}
      >
        <Row className="items-center gap-1">
          <UserCircleIcon className="h-5 w-5 text-blue-300" />
          <div className="text-greyscale-4 text-sm">Your friend</div>
        </Row>
        <div>Will Stacy ask me out tomorrow?</div>
      </Col>
      <div
        className={clsx(
          'bg-greyscale-1.5 absolute z-20 mt-2 h-10 w-60 rounded-md drop-shadow',
          isMobile
            ? 'animate-slide-up-3-big left-[36px] top-[130px]'
            : 'animate-slide-in-4 left-[48px] top-[114px]'
        )}
      >
        <div
          className={clsx(
            'h-full rounded-l-md bg-indigo-200 transition-all duration-1000 ease-out',
            shouldPercentChange ? 'w-[120px]' : 'w-48'
          )}
        />
        <EquilateralLeftTriangle
          className={clsx(
            'animate-press-3x absolute left-[8px] top-[7px] z-10 h-6 w-6 text-indigo-700'
          )}
        />
        <EquilateralLeftTriangle
          className={clsx(
            'text-greyscale-5 absolute left-[11px] top-[11px] z-0 h-6 w-6'
          )}
        />
        <div className="absolute top-[6px] left-[100px] z-30 text-xl font-semibold">
          {shouldPercentChange && (
            <CountUp start={75} end={50} duration={0.8} suffix="%" />
          )}
          {!shouldPercentChange && <div>75%</div>}
        </div>
        <EquilateralRightTriangle
          className={clsx(
            'absolute right-[8px] top-[7px] z-10 h-6 w-6 text-indigo-700'
          )}
        />
        <EquilateralRightTriangle
          className={clsx(
            'text-greyscale-5 absolute right-[7px] top-[11px] z-0 h-6 w-6'
          )}
        />
      </div>
      <div
        className={clsx(
          'absolute z-10 mt-2 h-10 w-60 rounded-md bg-teal-200',
          isMobile
            ? 'animate-slide-up-4-big left-[44px] top-[138px]'
            : 'animate-slide-in-3 left-[56px] top-[122px]'
        )}
      />
      {/* <SpendManaParticles /> */}
    </>
  )
}

export function LandingPage2(props: { isMobile: boolean }) {
  const { isMobile } = props
  const text = 'Profit'
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
          'absolute text-xl text-indigo-300',
          isMobile
            ? 'animate-slide-up-2 left-[21px] top-[33px]'
            : 'animate-slide-in-1 left-[33px] top-[17px]'
        )}
      >
        {text}
      </div>
    </>
  )
}

export function SpendManaParticles() {
  const particlesInit = useCallback(async (engine: Engine) => {
    // you can initialize the tsParticles instance (engine) here, adding custom shapes or presets
    // this loads the tsparticles package bundle, it's the easiest method for getting everything ready
    // starting from v2 you can add only the features you need reducing the bundle size
    await loadSlim(engine)
  }, [])

  const particlesLoaded = useCallback(
    async (container: Container | undefined) => {
      await console.log(container)
    },
    []
  )
  return (
    <Particles
      id="tsparticles"
      init={particlesInit}
      loaded={particlesLoaded}
      options={{
        background: {
          color: {
            value: '#0d47a1',
          },
        },
        fpsLimit: 120,
        interactivity: {
          events: {
            onClick: {
              enable: true,
              mode: 'push',
            },
            onHover: {
              enable: true,
              mode: 'repulse',
            },
            resize: true,
          },
          modes: {
            push: {
              quantity: 4,
            },
            repulse: {
              distance: 200,
              duration: 0.4,
            },
          },
        },
        particles: {
          color: {
            value: '#ffffff',
          },
          links: {
            color: '#ffffff',
            distance: 150,
            enable: true,
            opacity: 0.5,
            width: 1,
          },
          collisions: {
            enable: true,
          },
          move: {
            direction: 'none',
            enable: true,
            outModes: {
              default: 'bounce',
            },
            random: false,
            speed: 6,
            straight: false,
          },
          number: {
            density: {
              enable: true,
              area: 800,
            },
            value: 80,
          },
          opacity: {
            value: 0.5,
          },
          shape: {
            type: 'circle',
          },
          size: {
            value: { min: 1, max: 5 },
          },
        },
        detectRetina: true,
      }}
    />
  )
}
