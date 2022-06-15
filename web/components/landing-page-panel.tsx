import { SparklesIcon } from '@heroicons/react/solid'

import { Contract } from 'common/contract'

import { Spacer } from './layout/spacer'
import { firebaseLogin } from 'web/lib/firebase/users'
import { ContractsGrid } from './contract/contracts-list'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { withTracking } from 'web/lib/service/analytics'

export function LandingPagePanel(props: { hotContracts: Contract[] }) {
  const { hotContracts } = props

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
              Predict{' '}
              <span className="bg-gradient-to-r from-indigo-500 to-blue-500 bg-clip-text font-bold text-transparent">
                anything!
              </span>
            </div>
          </h1>
          <Spacer h={6} />
          <div className="mb-4 px-2 ">
            Create a play-money prediction market on any topic you care about
            and bet with your friends on what will happen!
            <br />
            {/* <br />
          Sign up and get {formatMoney(1000)} - worth $10 to your{' '}
          <SiteLink className="font-semibold" href="/charity">
            favorite charity.
          </SiteLink>
          <br /> */}
          </div>
        </div>
        <Spacer h={6} />
        <button
          className="self-center rounded-md border-none bg-gradient-to-r from-indigo-500 to-blue-500 py-4 px-6 text-lg font-semibold normal-case text-white hover:from-indigo-600 hover:to-blue-600"
          onClick={withTracking(firebaseLogin, 'landing page button click')}
        >
          Get started
        </button>{' '}
      </Col>

      <Row className="m-4 mb-6 items-center gap-1 text-xl font-semibold text-gray-800">
        <SparklesIcon className="inline h-5 w-5" aria-hidden="true" />
        Trending markets
      </Row>
      <ContractsGrid
        contracts={hotContracts?.slice(0, 10) || []}
        loadMore={() => {}}
        hasMore={false}
      />
    </>
  )
}
