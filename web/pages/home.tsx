import React from 'react'
import Router from 'next/router'
import { Page } from 'web/components/page'
import { Col } from 'web/components/layout/col'
import { useUser } from 'web/hooks/use-user'
import { ContractSearch } from 'web/components/contract-search'

const Home = () => {
  const user = useUser()

  if (user === null) {
    Router.replace('/')
    return <></>
  }

  return (
    <Page assertUser="signed-in">
      <Col className="mx-auto w-full">
        <ContractSearch
          querySortOptions={{
            shouldLoadFromStorage: false,
            defaultSort: '24-hour-vol',
          }}
          showCategorySelector
        />
      </Col>
    </Page>
  )
}

export default Home
