import { USElectionsPage } from 'web/components/elections-page'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { getElectionsPageProps } from 'web/lib/politics/home'
import { ElectionsPageProps } from 'web/public/data/elections-data'
import Image from 'next/image'
import { formatMoneyUSD } from 'common/util/format'
import { CoinNumber } from 'web/components/widgets/coin-number'
import { Row } from 'web/components/layout/row'
import { buttonClass } from 'web/components/buttons/button'
import clsx from 'clsx'
import Link from 'next/link'
import SquiggleVertical from 'web/lib/icons/squiggle-vertical.svg'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import Custom404 from './404'
import { ENV } from 'common/envs/constants'
import { useTracking } from 'web/hooks/use-tracking'

const revalidate = 60

export async function getStaticProps() {
  if (ENV === 'DEV') {
    return {
      props: {},
      revalidate,
    }
  }

  const electionsPageProps = await getElectionsPageProps()
  return {
    props: electionsPageProps,
    revalidate,
  }
}

export default function Pakman(props: ElectionsPageProps) {
  useTracking('pakman page view')

  if (Object.keys(props).length === 0) {
    return <Custom404 />
  }

  return (
    <Page trackPageView="Kohrs page">
      <SEO
        title="Kohrs Manifold"
        description="Matt Kohrs on Manifold."
        url="/kohrs"
      />
      <PromotionalPanel
        darkModeImg={'/kohrs/kohrs.jpeg'}
        lightModeImg={'/kohrs/kohrs.jpeg'}
        welcomerName="Matt Kohrs"
      />

      <USElectionsPage {...props} hideTitle />
    </Page>
  )
}

export function PromotionalPanel(props: {
  darkModeImg: string
  lightModeImg: string
  welcomerName: string
}) {
  const { darkModeImg, lightModeImg, welcomerName } = props
  const isMobile = useIsMobile()
  return (
    <div
      className={`mx-1 mb-6 flex select-none flex-col overflow-hidden rounded-lg bg-indigo-700 sm:mx-2 sm:flex-row`}
    >
      <Col className={` bg-indigo-700 px-8 py-6 sm:w-[30rem] sm:bg-indigo-300`}>
        <Image
          className="mx-auto my-auto"
          src={isMobile ? darkModeImg : lightModeImg}
          alt="Pakman Show Logo"
          height={256}
          width={256}
        />
      </Col>

      <div className={`mx-8 h-[1px] bg-indigo-300 sm:hidden`} />
      <Col className="relative w-full items-center px-8 py-6 text-white sm:px-16">
        {!isMobile && (
          <div className="absolute -left-0.5 bottom-0 z-20 h-full">
            <SquiggleVertical className={clsx(`h-full text-indigo-300`)} />
          </div>
        )}

        <div className="text-2xl">
          Welcome, from <b>{welcomerName}</b>
        </div>
        <Col className="w-full items-center text-lg text-indigo-300">
          <div className="mx-auto mt-2">
            Register today and get a limited time offer in store!
          </div>
          <Row
            className={`md::text-4xl relative mx-auto mt-4 items-center gap-2 rounded-xl border border-indigo-300 p-5 text-2xl `}
          >
            <CoinNumber
              amount={5000}
              // isInline
              numberType="short"
              className=" font-bold text-white"
            />
            <div className="text-xl">+</div>
            <CoinNumber
              amount={40}
              // isInline
              coinType={'sweepies'}
              className="font-bold text-white"
            />{' '}
            <div
              className={`absolute bottom-[-14px]  left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-indigo-300 px-3 text-lg text-indigo-700`}
            >
              for only <b>{formatMoneyUSD(20)}</b>
            </div>
          </Row>
          <div className="mt-5">
            <CoinNumber
              amount={1}
              coinType={'sweepies'}
              isInline
              numberType="short"
            />{' '}
            → {formatMoneyUSD(1)} USD
          </div>

          <div className="group relative z-30 mt-8">
            <Link
              className={clsx(
                buttonClass('2xl', 'gradient-pink'),
                'absolute -left-1.5 bottom-1.5 z-10 mt-8 transition-all ease-in-out focus:-left-0.5 focus:bottom-0.5 group-hover:-left-2 group-hover:bottom-2 focus:group-hover:-left-0.5 focus:group-hover:bottom-0.5'
              )}
              href="/gidx/register"
              color="gradient-pink"
            >
              Register today!
            </Link>
            <div
              className={clsx(
                `text-ink-900 rounded-md bg-teal-300 dark:bg-teal-700`,
                'px-6 py-3 text-xl font-semibold'
              )}
            >
              Register today!
            </div>
          </div>
        </Col>
      </Col>
    </div>
  )
}
