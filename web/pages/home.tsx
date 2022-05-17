import React, { useState } from 'react'
import Router from 'next/router'
import { Page } from 'web/components/page'
import { Spacer } from 'web/components/layout/spacer'
import { Col } from 'web/components/layout/col'
import { useUser } from 'web/hooks/use-user'
import { CategorySelector } from '../components/feed/category-selector'
import { ContractSearch } from 'web/components/contract-search'

const Home = () => {
  const user = useUser()
  const [category, setCategory] = useState<string>('all')

  if (user === null) {
    Router.replace('/')
    return <></>
  }

  return (
    <Page assertUser="signed-in">
      <Col className="mx-auto w-full">
        <ContractSearch
          additionalFilter={{ category }}
          querySortOptions={{
            shouldLoadFromStorage: false,
            defaultSort: '24-hour-vol',
          }}
        />
        <CategorySelector
          user={user}
          category={category}
          setCategory={setCategory}
        />
        <Spacer h={1} />
      </Col>
    </Page>
  )
}

export default Home
