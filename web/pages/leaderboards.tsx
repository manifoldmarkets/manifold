import { Col } from 'web/components/layout/col'
import { Leaderboard } from 'web/components/leaderboard'
import { Page } from 'web/components/page'
import { User, getFirstDayProfit, listAllUsers } from 'web/lib/firebase/users'
import { useEffect, useState } from 'react'
import { Title } from 'web/components/title'
import { useTracking } from 'web/hooks/use-tracking'
import { SEO } from 'web/components/SEO'
import { sortBy } from 'lodash'

export async function getStaticProps() {
  const props = await fetchProps()

  return {
    props,
    revalidate: 60, // regenerate after a minute
  }
}

const fetchProps = async () => {
  const users = await listAllUsers()
  const firstDayProfit = await Promise.all(
    users.map((user) => getFirstDayProfit(user.id))
  )
  const userProfit = users.map(
    (user, i) => [user, user.profitCached.allTime - firstDayProfit[i]] as const
  )
  const topTradersProfit = sortBy(userProfit, ([_, profit]) => profit)
    .reverse()
    .filter(
      ([user]) =>
        user.username !== 'SalemCenter' &&
        user.username !== 'RichardHanania' &&
        user.username !== 'JamesGrugett'
    )
    .slice(0, 20)

  console.log(topTradersProfit)

  const topTraders = topTradersProfit.map(([user]) => user)

  // Hide profit for now.
  topTraders.forEach((user) => {
    user.profitCached.allTime = 0
  })

  return {
    topTraders,
  }
}

export default function Leaderboards(_props: { topTraders: User[] }) {
  const [{ topTraders }, setProps] =
    useState<Parameters<typeof Leaderboards>[0]>(_props)

  useEffect(() => {
    fetchProps().then((props) => setProps(props))
  }, [])

  useTracking('view leaderboards')

  return (
    <Page>
      <SEO
        title="Leaderboards"
        description="Manifold's leaderboards show the top traders and market creators."
        url="/leaderboards"
      />
      <Title text={'Leaderboards'} className={'hidden md:block'} />

      <Col className="mx-4 max-w-sm items-center gap-10 lg:flex-row">
        <Leaderboard
          className="my-4"
          title="🏅 Top traders"
          users={topTraders}
          columns={
            [
              // Hide profit for now.
              // {
              //   header: 'Total profit',
              //   renderCell: (user) => formatMoney(user.profitCached[period]),
              // },
            ]
          }
        />
      </Col>
    </Page>
  )
}
