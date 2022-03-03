import dayjs from 'dayjs'
import _ from 'lodash'
import { DailyCountChart } from '../components/analytics/charts'
import { Col } from '../components/layout/col'
import { Page } from '../components/page'
import { Title } from '../components/title'
import { getDailyBets } from '../lib/firebase/bets'
import { getDailyContracts } from '../lib/firebase/contracts'

export async function getStaticProps() {
  const numberOfDays = 80
  const today = dayjs(dayjs().format('YYYY-MM-DD'))
  const startDate = today.subtract(numberOfDays, 'day')

  const dailyBets = await getDailyBets(startDate.valueOf(), numberOfDays)
  const dailyBetCounts = dailyBets.map((bets) => bets.length)

  const dailyContracts = await getDailyContracts(
    startDate.valueOf(),
    numberOfDays
  )
  const dailyContractCounts = dailyContracts.map(
    (contracts) => contracts.length
  )

  return {
    props: {
      startDate: startDate.valueOf(),
      dailyBetCounts,
      dailyContractCounts,
    },
    revalidate: 12 * 60 * 60, // regenerate after half a day
  }
}

export default function Analytics(props: {
  startDate: number
  dailyBetCounts: number[]
  dailyContractCounts: number[]
}) {
  return (
    <Page>
      <CustomAnalytics {...props} />
      <FirebaseAnalytics />
    </Page>
  )
}

function CustomAnalytics(props: {
  startDate: number
  dailyBetCounts: number[]
  dailyContractCounts: number[]
}) {
  const { startDate, dailyBetCounts, dailyContractCounts } = props
  return (
    <Col className="mb-8">
      <Title text="Bets count" />
      <DailyCountChart dailyCounts={dailyBetCounts} startDate={startDate} />

      <Title text="Markets count" />
      <DailyCountChart
        dailyCounts={dailyContractCounts}
        startDate={startDate}
      />
    </Col>
  )
}

function FirebaseAnalytics() {
  // Edit dashboard at https://datastudio.google.com/u/0/reporting/faeaf3a4-c8da-4275-b157-98dad017d305/page/Gg3/edit
  return (
    <iframe
      className="w-full"
      height={2200}
      src="https://datastudio.google.com/embed/reporting/faeaf3a4-c8da-4275-b157-98dad017d305/page/Gg3"
      frameBorder="0"
      style={{ border: 0 }}
      allowFullScreen
    />
  )
}
