import { Spacer } from './layout/spacer'
import { Col } from './layout/col'
import { useTracking } from 'web/hooks/use-tracking'
import { SiteLink } from './site-link'
import Link from 'next/link'

export function LandingPagePanel() {
  useTracking('view landing page')

  return (
    <>
      <Col className="mb-6 rounded-xl sm:m-12 sm:mt-0">
        <img
          height={250}
          width={250}
          className="self-center"
          src="/flappy-logo.gif"
        />
        <div className="m-4 max-w-[550px] self-center">
          <h1 className="text-3xl sm:text-6xl xl:text-6xl">
            <div className="font-semibold sm:mb-2">
              CSPI/Salem{' '}
              <span className="bg-gradient-to-r from-indigo-500 to-blue-500 bg-clip-text font-bold text-transparent">
                Tournament
              </span>
            </div>
          </h1>
          <Spacer h={6} />
          <div className="mb-4 px-2 ">
            Predict the future and win!
            <br />
            <br />
            Manifold Markets is partnering with CSPI and the Salem Center of the
            University of Texas at Austin to bring a{' '}
            <SiteLink
              className="underline"
              href={
                'https://www.cspicenter.com/p/introducing-the-salemcspi-forecasting'
              }
            >
              forecasting tournament
            </SiteLink>
            .
          </div>
        </div>
        <Spacer h={6} />
        <Link href="/markets">
          <button className="self-center rounded-md border-none bg-gradient-to-r from-indigo-500 to-blue-500 py-4 px-6 text-lg font-semibold normal-case text-white hover:from-indigo-600 hover:to-blue-600">
            Go to markets
          </button>
        </Link>
      </Col>
    </>
  )
}
