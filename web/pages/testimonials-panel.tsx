import { useEffect, useState } from 'react'
import {
  getNextPageNumber,
  PaginationCircle,
} from 'web/components/landing-page-panel'
import { Col } from 'web/components/layout/col'
import { ENV_CONFIG } from 'common/envs/constants'
import { Row } from 'web/components/layout/row'
import Link from 'next/link'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import clsx from 'clsx'
import { Button } from 'web/components/buttons/button'
import { withTracking } from 'web/lib/service/analytics'
import { firebaseLogin } from 'web/lib/firebase/users'
import { STARTING_BALANCE } from 'common/economy'
import SquiggleVerticalFlippedIcon from 'web/lib/icons/squiggle_vertical_flipped'
import SquiggleHorizontalFlippedIcon from 'web/lib/icons/squiggle_horizontal_flipped'
import StartQuoteIcon from 'web/lib/icons/start_quote'
import EndQuoteIcon from 'web/lib/icons/start_quote copy'
import testimonials from '../public/testimonials/testimonials.json'

export default function TestimonialsPanel() {
  const isMobile = useIsMobile()
  const [pageNumber, setPageNumber] = useState(0)
  const testimonialList = testimonials.testimonials
  const maxPage = testimonialList.length - 1
  const hasTestimonials = maxPage >= 0

  useEffect(() => {
    const newTimeoutId = setTimeout(
      () => setPageNumber(getNextPageNumber(pageNumber, maxPage)),
      8000
    )
    return () => clearTimeout(newTimeoutId)
  }, [pageNumber, maxPage])

  return (
    <>
      <div
        className={clsx(
          'mt-8 flex h-96 w-full flex-col overflow-hidden drop-shadow-sm sm:mt-4 sm:h-64 sm:flex-row'
        )}
      >
        <div
          className={clsx(
            'relative z-30 h-[5%] w-full rounded-t-xl bg-indigo-200 sm:h-full sm:w-2/5 sm:rounded-l-xl sm:rounded-r-none'
          )}
        >
          <div className="group absolute top-8 left-8 z-30 sm:top-32">
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
                'rounded-md bg-teal-200 text-gray-900',
                isMobile
                  ? 'px-6 py-2.5 text-base font-semibold'
                  : 'px-6 py-3 text-xl font-semibold'
              )}
            >
              Get started
            </div>
          </div>
          <div className="absolute top-6 left-8 sm:top-48 md:left-8">
            <div className="hidden text-right text-sm text-gray-900 sm:inline">
              And get{'   '}
              <span className="relative z-10 font-semibold">
                {ENV_CONFIG.moneyMoniker}
                {STARTING_BALANCE}
              </span>
              {'   '}
              to start trading!
            </div>
          </div>
        </div>
        <div className="relative h-[95%] w-full rounded-b-xl bg-indigo-700 sm:h-full sm:w-3/5 sm:rounded-r-xl sm:rounded-l-none">
          {hasTestimonials && (
            <Testimonial
              key={testimonialList[pageNumber].testimonial}
              {...testimonialList[pageNumber]}
            />
          )}
          {!isMobile && (
            <div className="absolute -left-0.5 bottom-0 z-10 h-full">
              <SquiggleVerticalFlippedIcon
                className={clsx('h-full text-indigo-200')}
              />
            </div>
          )}
          {isMobile && (
            <div className="absolute right-0 -top-0.5 z-10 w-full items-center">
              <SquiggleHorizontalFlippedIcon
                className={clsx('text-indigo-200')}
              />
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
              {testimonialList.map((testimonial, index) => (
                <PaginationCircle
                  key={testimonial.name}
                  currentPageNumber={pageNumber}
                  pageNumber={index}
                  onClick={() => {
                    setPageNumber(index)
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export function Testimonial(props: {
  testimonial: string
  name: string
  credit: string
  icon: string
  src: string
}) {
  const { testimonial, name, credit, icon, src } = props
  return (
    <div className="animate-slide-up-1 sm:animate-slide-in-1 absolute top-[20%] left-8 z-20 w-4/5 select-none text-white sm:top-2 sm:z-0">
      <StartQuoteIcon className="h-10 w-10 text-teal-200" />
      <div className="ml-8">{testimonial}</div>
      <Row className="justify-end">
        <EndQuoteIcon className="h-10 w-10 text-teal-200" />
      </Row>
      <Link href={src} target="_blank">
        <Row className="group mt-2 justify-end gap-2 ">
          <img src={icon} className="h-10 w-10 rounded-full drop-shadow-sm" />
          <Col className="text-sm">
            <div className="font-semibold transition-colors group-hover:text-teal-200">
              {name}
            </div>
            <div className="font-thin text-indigo-200">{credit}</div>
          </Col>
        </Row>
      </Link>
    </div>
  )
}
