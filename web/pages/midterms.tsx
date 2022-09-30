import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/page'
import { Title } from 'web/components/title'
import {
  StateElectionMarket,
  StateElectionMap,
} from 'web/components/usa-map/state-election-map'

const senateMidterms: StateElectionMarket[] = [
  {
    state: 'AZ',
    creatorUsername: 'BTE',
    slug: 'will-blake-masters-win-the-arizona',
    isWinRepublican: true,
  },
  {
    state: 'OH',
    creatorUsername: 'BTE',
    slug: 'will-jd-vance-win-the-ohio-senate-s',
    isWinRepublican: true,
  },
  {
    state: 'WI',
    creatorUsername: 'BTE',
    slug: 'will-ron-johnson-be-reelected-in-th',
    isWinRepublican: true,
  },
  {
    state: 'FL',
    creatorUsername: 'BTE',
    slug: 'will-marco-rubio-be-reelected-to-th',
    isWinRepublican: true,
  },
  {
    state: 'PA',
    creatorUsername: 'MattP',
    slug: 'will-dr-oz-be-elected-to-the-us-sen',
    isWinRepublican: true,
  },
  {
    state: 'GA',
    creatorUsername: 'NcyRocks',
    slug: 'will-a-democrat-win-the-2022-us-sen-3d2432ba6d79',
    isWinRepublican: false,
  },
  {
    state: 'NV',
    creatorUsername: 'NcyRocks',
    slug: 'will-a-democrat-win-the-2022-us-sen',
    isWinRepublican: false,
  },
  {
    state: 'NC',
    creatorUsername: 'NcyRocks',
    slug: 'will-a-democrat-win-the-2022-us-sen-6f1a901e1fcf',
    isWinRepublican: false,
  },
  {
    state: 'NH',
    creatorUsername: 'NcyRocks',
    slug: 'will-a-democrat-win-the-2022-us-sen-23194a72f1b7',
    isWinRepublican: false,
  },
  {
    state: 'UT',
    creatorUsername: 'SG',
    slug: 'will-mike-lee-win-the-2022-utah-sen',
    isWinRepublican: true,
  },
  {
    state: 'CO',
    creatorUsername: 'SG',
    slug: 'will-michael-bennet-win-the-2022-co',
    isWinRepublican: false,
  },
]

const App = () => {
  return (
    <Page className="">
      <Col className="items-center justify-center">
        <Title text="2022 US Senate Midterms" className="mt-8" />
        <StateElectionMap markets={senateMidterms} />

        <iframe
          src="https://manifold.markets/embed/NathanpmYoung/will-the-democrats-control-the-sena"
          title="Will the Democrats control the Senate after the Midterms?"
          frameBorder="0"
          width={800}
          height={400}
          className="mt-8"
        ></iframe>

        <div className="mt-8 text-2xl">Related markets</div>
        <iframe
          src="https://manifold.markets/BoltonBailey/will-democrats-maintain-control-of"
          title="Will the Democrats control the House after the Midterms?"
          frameBorder="0"
          width={800}
          height={400}
          className="mt-8"
        ></iframe>

        <iframe
          src="https://manifold.markets/SG/will-a-democrat-win-the-2024-us-pre"
          title="Will a Democrat win the 2024 US presidential election?"
          frameBorder="0"
          width={800}
          height={400}
          className="mt-8"
        ></iframe>
      </Col>
    </Page>
  )
}

export default App
