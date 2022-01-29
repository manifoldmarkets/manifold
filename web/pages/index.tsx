import React from 'react'
import Router from 'next/router'

import { Contract, getHotContracts } from '../lib/firebase/contracts'
import { Page } from '../components/page'
import { FeedPromo } from '../components/feed-create'
import { Col } from '../components/layout/col'
import { useUser } from '../hooks/use-user'

export async function getStaticProps() {
  const hotContracts = (await getHotContracts().catch(() => [])) ?? []

  return {
    props: { hotContracts },
    revalidate: 60, // regenerate after a minute
  }
}

const Home = (props: { hotContracts: Contract[] }) => {
  const { hotContracts } = props

  const user = useUser()

  if (user) {
    Router.replace('/home')
    return <></>
  }

  return (
    <Page assertUser="signed-out">
      <Col className="items-center">
        <Col className="max-w-3xl">
          <FeedPromo hotContracts={hotContracts ?? []} />
        </Col>
      </Col>
    </Page>
  )
}

export default Home
